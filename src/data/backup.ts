import JSZip from 'jszip';
import { database } from './database';
import { readLibrary, type LibrarySnapshot } from './library';
import { validateAudioFile, validateImageFile } from './media';
import { canonicalRelationKey, findDuplicateVocabularyItemId, getVocabularyItemErrors, normalizeText } from '../domain/validation';
import type { LexicalRelation, MediaAsset, VocabularyItem } from '../domain/types';

const archiveFormat = 'memory-match-library';
const relationTypes = new Set(['synonym', 'antonym', 'genericSpecific', 'wholePart']);

type MediaManifestEntry = Omit<MediaAsset, 'blob'> & { path: string };

export type BackupBundle = {
  items: VocabularyItem[];
  relations: LexicalRelation[];
  assets: MediaAsset[];
};

export type ImportConflictChoice = 'existing' | 'imported' | 'both';

function createId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sameItem(first: VocabularyItem, second: VocabularyItem): boolean {
  return first.id === second.id
    && first.targetText === second.targetText
    && first.targetTextComparisonKey === second.targetTextComparisonKey
    && first.definition === second.definition
    && first.definitionComparisonKey === second.definitionComparisonKey
    && first.audioAssetId === second.audioAssetId
    && first.imageAssetId === second.imageAssetId
    && first.createdAt === second.createdAt
    && first.updatedAt === second.updatedAt;
}

async function sameBlob(first: Blob, second: Blob): Promise<boolean> {
  if (first.size !== second.size || first.type !== second.type) return false;
  const [firstBytes, secondBytes] = await Promise.all([first.arrayBuffer(), second.arrayBuffer()]);
  const firstView = new Uint8Array(firstBytes);
  const secondView = new Uint8Array(secondBytes);
  return firstView.every((byte, index) => byte === secondView[index]);
}

export async function exportBackup(snapshot: LibrarySnapshot): Promise<Blob> {
  const archive = new JSZip();
  archive.file('metadata.json', JSON.stringify({ format: archiveFormat, schemaVersion: 1, exportedAt: new Date().toISOString() }, null, 2));
  archive.file('vocabulary-items.json', JSON.stringify(snapshot.items, null, 2));
  archive.file('lexical-relations.json', JSON.stringify(snapshot.relations, null, 2));

  const manifest: MediaManifestEntry[] = [];
  for (const asset of snapshot.assets) {
    const path = `media/${asset.type}/${asset.id}`;
    archive.file(path, asset.blob);
    const { blob: _blob, ...metadata } = asset;
    manifest.push({ ...metadata, path });
  }
  archive.file('media-assets.json', JSON.stringify(manifest, null, 2));
  return archive.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

export async function parseBackup(file: Blob): Promise<BackupBundle> {
  let archive: JSZip;
  try {
    archive = await JSZip.loadAsync(file);
  } catch {
    throw new Error('This file is not a readable Memory Match backup.');
  }

  async function readJson(path: string): Promise<unknown> {
    const entry = archive.file(path);
    if (!entry) throw new Error(`Backup is missing ${path}.`);
    try {
      return JSON.parse(await entry.async('string')) as unknown;
    } catch {
      throw new Error(`Backup contains invalid ${path}.`);
    }
  }

  const metadata = await readJson('metadata.json');
  if (!isRecord(metadata) || metadata.format !== archiveFormat || metadata.schemaVersion !== 1) {
    throw new Error('This backup format is not supported.');
  }
  const rawItems = await readJson('vocabulary-items.json');
  const rawRelations = await readJson('lexical-relations.json');
  const rawManifest = await readJson('media-assets.json');
  if (!Array.isArray(rawItems) || !Array.isArray(rawRelations) || !Array.isArray(rawManifest)) {
    throw new Error('Backup records are malformed.');
  }

  const assets: MediaAsset[] = [];
  for (const entry of rawManifest) {
    if (!isRecord(entry)
      || typeof entry.id !== 'string'
      || typeof entry.vocabularyItemId !== 'string'
      || (entry.type !== 'audio' && entry.type !== 'image')
      || typeof entry.fileName !== 'string'
      || typeof entry.mimeType !== 'string'
      || typeof entry.fileSize !== 'number'
      || typeof entry.createdAt !== 'string'
      || typeof entry.path !== 'string'
      || /[\\/]/u.test(entry.id)
      || entry.path !== `media/${entry.type}/${entry.id}`) {
      throw new Error('Backup contains invalid media metadata.');
    }
    const mediaFile = archive.file(entry.path);
    if (!mediaFile) throw new Error(`Backup is missing media file ${entry.fileName}.`);
    const blob = await mediaFile.async('blob');
    assets.push({
      id: entry.id,
      vocabularyItemId: entry.vocabularyItemId,
      type: entry.type,
      blob,
      fileName: entry.fileName,
      mimeType: entry.mimeType,
      fileSize: entry.fileSize,
      ...(typeof entry.durationSeconds === 'number' ? { durationSeconds: entry.durationSeconds } : {}),
      ...(typeof entry.width === 'number' ? { width: entry.width } : {}),
      ...(typeof entry.height === 'number' ? { height: entry.height } : {}),
      createdAt: entry.createdAt,
    });
  }

  const items = rawItems as VocabularyItem[];
  const relations = rawRelations as LexicalRelation[];
  validateBackupRecords(items, relations, assets);
  return { items, relations, assets };
}

export function validateBackupRecords(
  items: VocabularyItem[],
  relations: LexicalRelation[],
  assets: MediaAsset[],
): void {
  const itemIds = new Set<string>();
  const assetIds = new Set<string>();
  const itemsById = new Map<string, VocabularyItem>();
  const assetsById = new Map<string, MediaAsset>();

  for (const item of items) {
    if (!isRecord(item)
      || typeof item.id !== 'string'
      || !item.id
      || typeof item.createdAt !== 'string'
      || typeof item.updatedAt !== 'string'
      || (item.targetText !== undefined && typeof item.targetText !== 'string')
      || (item.targetTextComparisonKey !== undefined && typeof item.targetTextComparisonKey !== 'string')
      || (item.definition !== undefined && typeof item.definition !== 'string')
      || (item.definitionComparisonKey !== undefined && typeof item.definitionComparisonKey !== 'string')
      || (item.audioAssetId !== undefined && typeof item.audioAssetId !== 'string')
      || (item.imageAssetId !== undefined && typeof item.imageAssetId !== 'string')) {
      throw new Error('Backup contains an invalid vocabulary item.');
    }
    if (itemIds.has(item.id)) throw new Error('Backup contains duplicate vocabulary item IDs.');
    itemIds.add(item.id);
    itemsById.set(item.id, item);
  }
  for (const asset of assets) {
    if (assetIds.has(asset.id)) throw new Error('Backup contains duplicate media IDs.');
    assetIds.add(asset.id);
    assetsById.set(asset.id, asset);
    if (!itemIds.has(asset.vocabularyItemId)) throw new Error('Media references a missing vocabulary item.');
    if (asset.blob.size !== asset.fileSize) throw new Error(`Media file ${asset.fileName} has an invalid size.`);
    if (asset.type === 'audio') {
      const error = validateAudioFile({ name: asset.fileName, type: asset.mimeType, size: asset.fileSize });
      if (error || typeof asset.durationSeconds !== 'number' || !Number.isFinite(asset.durationSeconds) || asset.durationSeconds <= 0 || asset.durationSeconds > 30) {
        throw new Error(error ?? `Audio file ${asset.fileName} has an invalid duration.`);
      }
    } else {
      const error = validateImageFile({ name: asset.fileName, type: '' });
      if (error || !['image/webp', 'image/jpeg'].includes(asset.mimeType) || !asset.width || !asset.height || Math.max(asset.width, asset.height) > 600) {
        throw new Error(error ?? `Image file ${asset.fileName} is not a processed image.`);
      }
    }
  }
  for (const item of items) {
    const errors = getVocabularyItemErrors(item);
    if (errors.length) throw new Error(`Vocabulary item ${item.id}: ${errors.join(' ')}`);
    if (item.targetTextComparisonKey && item.targetTextComparisonKey !== normalizeText(item.targetText ?? '')) {
      throw new Error(`Vocabulary item ${item.id} has an invalid target-text comparison key.`);
    }
    if (item.definitionComparisonKey && item.definitionComparisonKey !== normalizeText(item.definition ?? '')) {
      throw new Error(`Vocabulary item ${item.id} has an invalid definition comparison key.`);
    }
    for (const assetId of [item.audioAssetId, item.imageAssetId]) {
      if (assetId && !assetsById.has(assetId)) throw new Error(`Vocabulary item ${item.id} references missing media.`);
    }
    if (item.audioAssetId && (assetsById.get(item.audioAssetId)?.type !== 'audio' || assetsById.get(item.audioAssetId)?.vocabularyItemId !== item.id)) throw new Error(`Vocabulary item ${item.id} has invalid audio media.`);
    if (item.imageAssetId && (assetsById.get(item.imageAssetId)?.type !== 'image' || assetsById.get(item.imageAssetId)?.vocabularyItemId !== item.id)) throw new Error(`Vocabulary item ${item.id} has invalid image media.`);
    if (findDuplicateVocabularyItemId(item, items, assets)) throw new Error(`Backup contains an identical vocabulary item to ${item.id}.`);
  }

  const relationKeys = new Set<string>();
  const relationIds = new Set<string>();
  for (const relation of relations) {
    if (!isRecord(relation) || typeof relation.id !== 'string' || typeof relation.itemAId !== 'string' || typeof relation.itemBId !== 'string' || typeof relation.createdAt !== 'string' || !relationTypes.has(relation.type)) {
      throw new Error('Backup contains an invalid lexical relationship.');
    }
    if (relationIds.has(relation.id)) throw new Error('Backup contains duplicate relationship IDs.');
    relationIds.add(relation.id);
    if (!itemIds.has(relation.itemAId) || !itemIds.has(relation.itemBId) || relation.itemAId === relation.itemBId) {
      throw new Error('A relationship references invalid vocabulary items.');
    }
    const key = canonicalRelationKey(relation.itemAId, relation.itemBId, relation.type);
    if (relationKeys.has(key)) throw new Error('Backup contains duplicate relationship mappings.');
    relationKeys.add(key);
  }
  if (itemsById.size !== items.length) throw new Error('Backup contains invalid vocabulary items.');
}

export function findImportConflicts(bundle: BackupBundle, existingItems: VocabularyItem[]): VocabularyItem[] {
  const existingById = new Map(existingItems.map((item) => [item.id, item]));
  return bundle.items.filter((item) => {
    const existing = existingById.get(item.id);
    return Boolean(existing && !sameItem(existing, item));
  });
}

export async function applyBackup(
  bundle: BackupBundle,
  choices: Record<string, ImportConflictChoice>,
): Promise<void> {
  const current = await readLibrary();
  validateBackupRecords(bundle.items, bundle.relations, bundle.assets);
  const conflicts = findImportConflicts(bundle, current.items);
  if (conflicts.some(({ id }) => !choices[id])) throw new Error('Choose how to resolve each conflicting vocabulary item.');

  const itemIdMap = new Map(bundle.items.map((item) => [
    item.id,
    conflicts.some(({ id }) => id === item.id) && choices[item.id] === 'both' ? createId() : item.id,
  ]));
  const skippedItemIds = new Set(conflicts.filter(({ id }) => choices[id] === 'existing').map(({ id }) => id));
  const importedAssets = bundle.assets.filter((asset) => !skippedItemIds.has(asset.vocabularyItemId));
  const currentAssets = new Map(current.assets.map((asset) => [asset.id, asset]));
  const assetIdMap = new Map<string, string>();

  for (const asset of importedAssets) {
    const existing = currentAssets.get(asset.id);
    if (!existing) {
      assetIdMap.set(asset.id, asset.id);
      continue;
    }
    const ownerId = itemIdMap.get(asset.vocabularyItemId)!;
    const sameMetadata = existing.vocabularyItemId === ownerId
      && existing.type === asset.type
      && existing.fileName === asset.fileName
      && existing.mimeType === asset.mimeType
      && existing.fileSize === asset.fileSize;
    assetIdMap.set(asset.id, sameMetadata && await sameBlob(existing.blob, asset.blob) ? asset.id : createId());
  }

  const itemsToWrite = bundle.items.filter(({ id }) => !skippedItemIds.has(id)).map((item) => ({
    ...item,
    id: itemIdMap.get(item.id)!,
    ...(item.audioAssetId ? { audioAssetId: assetIdMap.get(item.audioAssetId) ?? item.audioAssetId } : {}),
    ...(item.imageAssetId ? { imageAssetId: assetIdMap.get(item.imageAssetId) ?? item.imageAssetId } : {}),
  }));
  const assetsToWrite = importedAssets.map((asset) => ({
    ...asset,
    id: assetIdMap.get(asset.id)!,
    vocabularyItemId: itemIdMap.get(asset.vocabularyItemId)!,
  }));
  const replacedItemIds = new Set(conflicts.filter(({ id }) => choices[id] === 'imported').map(({ id }) => id));
  const replacedRelationIds = current.relations
    .filter(({ itemAId, itemBId }) => replacedItemIds.has(itemAId) || replacedItemIds.has(itemBId))
    .map(({ id }) => id);
  const retainedRelations = current.relations.filter(({ id }) => !replacedRelationIds.includes(id));
  const existingRelationKeys = new Set(retainedRelations.map(({ itemAId, itemBId, type }) =>
    canonicalRelationKey(itemAId, itemBId, type),
  ));
  const existingRelationIds = new Set(current.relations.map(({ id }) => id));
  const relationsToWrite = bundle.relations.flatMap((relation) => {
    if (skippedItemIds.has(relation.itemAId) || skippedItemIds.has(relation.itemBId)) return [];
    const itemAId = itemIdMap.get(relation.itemAId)!;
    const itemBId = itemIdMap.get(relation.itemBId)!;
    const key = canonicalRelationKey(itemAId, itemBId, relation.type);
    if (existingRelationKeys.has(key)) return [];
    existingRelationKeys.add(key);
    return [{ ...relation, id: existingRelationIds.has(relation.id) ? createId() : relation.id, itemAId, itemBId }];
  });

  const staleAssetIds = current.items
    .filter(({ id }) => replacedItemIds.has(id))
    .flatMap(({ audioAssetId, imageAssetId }) => [audioAssetId, imageAssetId].filter((id): id is string => Boolean(id)))
    .filter((id) => !itemsToWrite.some((item) => item.audioAssetId === id || item.imageAssetId === id));

  await database.transaction('rw', database.items, database.relations, database.mediaAssets, async () => {
    await database.items.bulkPut(itemsToWrite);
    await database.mediaAssets.bulkPut(assetsToWrite);
    await database.mediaAssets.bulkDelete(staleAssetIds);
    await database.relations.bulkDelete(replacedRelationIds);
    await database.relations.bulkAdd(relationsToWrite);
  });
}