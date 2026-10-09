import JSZip from 'jszip';
import { validateMediaAsset, validateRelation, validateVocabularyItem } from '../../domain/vocabulary';
import type { LexicalRelation, MediaAsset, VocabularyItem } from '../../domain/types';
import { libraryDatabase, type LibraryDatabase } from '../../data/database';
import type { LibrarySnapshot } from '../../data/library';

type AssetManifestEntry = Omit<MediaAsset, 'blob'> & { archivePath: string };

type ArchiveMetadata = {
  format: 'memory-match';
  version: 1;
  exportedAt: string;
  assets: AssetManifestEntry[];
};

export type ImportBundle = LibrarySnapshot;
export type ConflictChoice = 'existing' | 'imported' | 'both';
export type ImportConflicts = Array<{ item: VocabularyItem; existing: VocabularyItem }>;

function safeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^\.+/, '') || 'media';
}

export async function exportLibraryZip(library: LibrarySnapshot): Promise<Blob> {
  const zip = new JSZip();
  const assets: AssetManifestEntry[] = [];

  for (const asset of library.assets) {
    const folder = asset.type === 'audio' ? 'media/audio' : 'media/images';
    const archivePath = `${folder}/${asset.id}-${safeFileName(asset.fileName)}`;
    zip.file(archivePath, asset.blob);
    const { blob: _blob, ...metadata } = asset;
    assets.push({ ...metadata, archivePath });
  }

  const metadata: ArchiveMetadata = {
    format: 'memory-match',
    version: 1,
    exportedAt: new Date().toISOString(),
    assets,
  };
  zip.file('metadata.json', JSON.stringify(metadata, null, 2));
  zip.file('vocabulary-items.json', JSON.stringify(library.items, null, 2));
  zip.file('lexical-relations.json', JSON.stringify(library.relations, null, 2));
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

async function readJson<T>(zip: JSZip, name: string): Promise<T> {
  const file = zip.file(name);
  if (!file) throw new Error(`Backup is missing ${name}.`);
  try {
    return JSON.parse(await file.async('string')) as T;
  } catch {
    throw new Error(`${name} is not valid JSON.`);
  }
}

function isRelationType(value: unknown): value is LexicalRelation['type'] {
  return value === 'synonym' || value === 'antonym' || value === 'genericSpecific' || value === 'wholePart';
}

export async function parseImportArchive(file: Blob): Promise<ImportBundle> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new Error('Choose a valid Memory Match ZIP backup.');
  }

  const [metadata, items, relations] = await Promise.all([
    readJson<ArchiveMetadata>(zip, 'metadata.json'),
    readJson<VocabularyItem[]>(zip, 'vocabulary-items.json'),
    readJson<LexicalRelation[]>(zip, 'lexical-relations.json'),
  ]);
  if (metadata.format !== 'memory-match' || metadata.version !== 1 || !Array.isArray(metadata.assets)) {
    throw new Error('This backup format is not supported.');
  }
  if (!Array.isArray(items) || !Array.isArray(relations)) throw new Error('The backup data is incomplete.');

  const itemIds = new Set<string>();
  for (const item of items) {
    if (!item || typeof item.id !== 'string' || itemIds.has(item.id)) throw new Error('Vocabulary item IDs must be unique.');
    itemIds.add(item.id);
    const validation = validateVocabularyItem(item);
    if (!validation.valid) throw new Error(`Invalid vocabulary item: ${validation.message}`);
  }

  const relationIds = new Set<string>();
  const checkedRelations: LexicalRelation[] = [];
  for (const relation of relations) {
    if (!relation || typeof relation.id !== 'string' || relationIds.has(relation.id) || !isRelationType(relation.type)) {
      throw new Error('The backup contains an invalid relationship.');
    }
    if (!itemIds.has(relation.itemAId) || !itemIds.has(relation.itemBId)) {
      throw new Error('A relationship points to a missing vocabulary item.');
    }
    const validation = validateRelation(relation, checkedRelations);
    if (!validation.valid) throw new Error(validation.message);
    relationIds.add(relation.id);
    checkedRelations.push(relation);
  }

  const assets = await Promise.all(metadata.assets.map(async (entry): Promise<MediaAsset> => {
    const expectedFolder = entry.type === 'audio' ? 'media/audio/' : entry.type === 'image' ? 'media/images/' : '';
    if (!expectedFolder || !entry.archivePath.startsWith(expectedFolder) || entry.archivePath.includes('..')) {
      throw new Error('The backup contains an invalid media path.');
    }
    if (!itemIds.has(entry.vocabularyItemId)) throw new Error('Media belongs to a missing vocabulary item.');
    const archivedFile = zip.file(entry.archivePath);
    if (!archivedFile) throw new Error(`Backup media is missing: ${entry.fileName}.`);
    const blob = await archivedFile.async('blob');
    const asset: MediaAsset = { ...entry, blob };
    const validation = validateMediaAsset(asset);
    if (!validation.valid) throw new Error(`Invalid media file: ${validation.message}`);
    if (asset.type === 'audio' && (asset.durationSeconds ?? 0) > 30) throw new Error('Audio clips must be 30 seconds or shorter.');
    return asset;
  }));

  const assetIds = new Set<string>();
  for (const asset of assets) {
    if (assetIds.has(asset.id)) throw new Error('Media asset IDs must be unique.');
    assetIds.add(asset.id);
  }
  for (const item of items) {
    if (item.audioAssetId && !assets.some((asset) => asset.id === item.audioAssetId && asset.type === 'audio')) {
      throw new Error('An audio attachment is missing from the backup.');
    }
    if (item.imageAssetId && !assets.some((asset) => asset.id === item.imageAssetId && asset.type === 'image')) {
      throw new Error('An image attachment is missing from the backup.');
    }
  }

  return { items, relations, assets };
}

export function findImportConflicts(bundle: ImportBundle, existingItems: VocabularyItem[]): ImportConflicts {
  const existingById = new Map(existingItems.map((item) => [item.id, item]));
  return bundle.items.flatMap((item) => {
    const existing = existingById.get(item.id);
    return existing && JSON.stringify(existing) !== JSON.stringify(item) ? [{ item, existing }] : [];
  });
}

function relationKey(relation: Pick<LexicalRelation, 'itemAId' | 'itemBId' | 'type'>): string {
  const [first, second] = [relation.itemAId, relation.itemBId].sort();
  return `${relation.type}:${first}:${second}`;
}

export async function applyImport(
  bundle: ImportBundle,
  choices: Record<string, ConflictChoice>,
  database: LibraryDatabase = libraryDatabase,
): Promise<{ itemsAdded: number; itemsReplaced: number; itemsDuplicated: number; relationsAdded: number }> {
  return database.transaction('rw', database.items, database.relations, database.assets, async () => {
    const localItems = await database.items.toArray();
    const localById = new Map(localItems.map((item) => [item.id, item]));
    const itemIdMap = new Map<string, string>();
    const skippedItemIds = new Set<string>();
    const replacedItemIds = new Set<string>();
    let itemsAdded = 0;
    let itemsReplaced = 0;
    let itemsDuplicated = 0;

    for (const item of bundle.items) {
      const existing = localById.get(item.id);
      const differs = existing && JSON.stringify(existing) !== JSON.stringify(item);
      const choice = differs ? choices[item.id] : 'imported';
      if (differs && !choice) throw new Error(`Choose how to resolve the conflict for ${item.targetText || item.id}.`);
      if (choice === 'existing') {
        itemIdMap.set(item.id, item.id);
        skippedItemIds.add(item.id);
      } else if (choice === 'both') {
        itemIdMap.set(item.id, crypto.randomUUID());
        itemsDuplicated += 1;
      } else {
        itemIdMap.set(item.id, item.id);
        if (existing) {
          replacedItemIds.add(item.id);
          itemsReplaced += 1;
        } else {
          itemsAdded += 1;
        }
      }
    }

    const localAssets = await database.assets.toArray();
    const localAssetIds = new Set(localAssets.map(({ id }) => id));
    const assetIdMap = new Map<string, string>();
    const assetsToWrite: MediaAsset[] = [];
    for (const asset of bundle.assets) {
      if (skippedItemIds.has(asset.vocabularyItemId)) continue;
      const mappedItemId = itemIdMap.get(asset.vocabularyItemId);
      if (!mappedItemId) throw new Error('Imported media belongs to an unresolved vocabulary item.');
      const mappedAssetId = localAssetIds.has(asset.id) ? crypto.randomUUID() : asset.id;
      assetIdMap.set(asset.id, mappedAssetId);
      assetsToWrite.push({ ...asset, id: mappedAssetId, vocabularyItemId: mappedItemId });
    }
    for (const item of bundle.items) {
      if (skippedItemIds.has(item.id)) continue;
      const mapped = { ...item, id: itemIdMap.get(item.id)! };
      if (item.audioAssetId) {
        const assetId = assetIdMap.get(item.audioAssetId);
        if (!assetId) throw new Error('An imported audio attachment could not be restored.');
        mapped.audioAssetId = assetId;
      }
      if (item.imageAssetId) {
        const assetId = assetIdMap.get(item.imageAssetId);
        if (!assetId) throw new Error('An imported image attachment could not be restored.');
        mapped.imageAssetId = assetId;
      }
      const validation = validateVocabularyItem(mapped);
      if (!validation.valid) throw new Error(validation.message);
      await database.items.put(mapped);
    }

    for (const itemId of replacedItemIds) {
      const item = bundle.items.find((candidate) => candidate.id === itemId)!;
      const keep = [item.audioAssetId, item.imageAssetId]
        .map((assetId) => assetId ? assetIdMap.get(assetId) : undefined)
        .filter((assetId): assetId is string => Boolean(assetId));
      const stale = localAssets.filter((asset) => asset.vocabularyItemId === itemId && !keep.includes(asset.id));
      if (stale.length) await database.assets.bulkDelete(stale.map(({ id }) => id));
    }
    if (assetsToWrite.length) await database.assets.bulkPut(assetsToWrite);

    const localRelations = await database.relations.toArray();
    const knownRelationKeys = new Set(localRelations.map(relationKey));
    const knownRelationIds = new Set(localRelations.map(({ id }) => id));
    const allItemIds = new Set((await database.items.toArray()).map(({ id }) => id));
    const relationsToWrite: LexicalRelation[] = [];
    for (const relation of bundle.relations) {
      const itemAId = itemIdMap.get(relation.itemAId);
      const itemBId = itemIdMap.get(relation.itemBId);
      if (!itemAId || !itemBId || !allItemIds.has(itemAId) || !allItemIds.has(itemBId)) continue;
      const mapped = { ...relation, itemAId, itemBId };
      const key = relationKey(mapped);
      if (knownRelationKeys.has(key)) continue;
      if (knownRelationIds.has(mapped.id)) mapped.id = crypto.randomUUID();
      const validation = validateRelation(mapped, [...localRelations, ...relationsToWrite]);
      if (!validation.valid) throw new Error(validation.message);
      relationsToWrite.push(mapped);
      knownRelationKeys.add(key);
      knownRelationIds.add(mapped.id);
    }
    if (relationsToWrite.length) await database.relations.bulkPut(relationsToWrite);

    return { itemsAdded, itemsReplaced, itemsDuplicated, relationsAdded: relationsToWrite.length };
  });
}