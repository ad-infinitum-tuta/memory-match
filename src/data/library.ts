import { database } from './database';
import { canonicalRelationKey, findDuplicateVocabularyItemId, getRelationError, getVocabularyItemErrors, normalizeText } from '../domain/validation';
import type { LexicalRelation, MediaAsset, RelationType, VocabularyItem } from '../domain/types';

export type RelationDraft = {
  itemId: string;
  type: RelationType;
};

export type LibrarySnapshot = {
  items: VocabularyItem[];
  relations: LexicalRelation[];
  assets: MediaAsset[];
};

export async function readLibrary(): Promise<LibrarySnapshot> {
  const [items, relations, assets] = await Promise.all([
    database.items.orderBy('createdAt').reverse().toArray(),
    database.relations.toArray(),
    database.mediaAssets.toArray(),
  ]);
  return { items, relations, assets };
}

export async function readPreference<T>(key: string, fallback: T): Promise<T> {
  const stored = await database.preferences.get(key);
  return (stored?.value as T | undefined) ?? fallback;
}

export async function writePreference(key: string, value: unknown): Promise<void> {
  await database.preferences.put({ key, value });
}

export async function saveVocabularyItem(
  values: {
    id: string;
    targetText: string;
    definition: string;
    audioAsset?: MediaAsset;
    imageAsset?: MediaAsset;
    removeAudio?: boolean;
    removeImage?: boolean;
  },
  relationDrafts: RelationDraft[],
): Promise<void> {
  const now = new Date().toISOString();
  const targetText = values.targetText.trim();
  const definition = values.definition.trim();
  await database.transaction('rw', database.items, database.relations, database.mediaAssets, async () => {
    const prior = await database.items.get(values.id);
    const item: VocabularyItem = {
      id: values.id,
      ...(targetText ? { targetText, targetTextComparisonKey: normalizeText(targetText) } : {}),
      ...(definition ? { definition, definitionComparisonKey: normalizeText(definition) } : {}),
      ...(!values.removeAudio && !values.audioAsset && prior?.audioAssetId ? { audioAssetId: prior.audioAssetId } : {}),
      ...(!values.removeImage && !values.imageAsset && prior?.imageAssetId ? { imageAssetId: prior.imageAssetId } : {}),
      ...(values.audioAsset ? { audioAssetId: values.audioAsset.id } : {}),
      ...(values.imageAsset ? { imageAssetId: values.imageAsset.id } : {}),
      createdAt: prior?.createdAt ?? now,
      updatedAt: now,
    };
    const errors = getVocabularyItemErrors(item);
    if (errors.length) throw new Error(errors.join(' '));
    const [existingItems, existingAssets] = await Promise.all([
      database.items.toArray(),
      database.mediaAssets.toArray(),
    ]);
    const assetsForComparison = [
      ...existingAssets.filter(({ id }) => id !== prior?.audioAssetId && id !== prior?.imageAssetId),
      ...existingAssets.filter(({ id }) => item.audioAssetId === id || item.imageAssetId === id),
      ...(values.audioAsset ? [values.audioAsset] : []),
      ...(values.imageAsset ? [values.imageAsset] : []),
    ];
    if (findDuplicateVocabularyItemId(item, existingItems, assetsForComparison)) {
      throw new Error('An identical vocabulary item already exists.');
    }

    const existingRelations = await database.relations.toArray();
    const retainedRelations = existingRelations.filter(
      (relation) => relation.itemAId !== item.id && relation.itemBId !== item.id,
    );
    const seen = new Set(retainedRelations.map((relation) =>
      canonicalRelationKey(relation.itemAId, relation.itemBId, relation.type),
    ));
    const knownItems = new Set((await database.items.toArray()).map(({ id }) => id));
    knownItems.add(item.id);

    for (const draft of relationDrafts) {
      if (!draft.itemId) continue;
      const relation = { itemAId: item.id, itemBId: draft.itemId, type: draft.type };
      const relationError = getRelationError(relation, [...knownItems].map((id) => ({ id })));
      if (relationError) throw new Error(relationError);
      const key = canonicalRelationKey(relation.itemAId, relation.itemBId, relation.type);
      if (seen.has(key)) throw new Error('This relationship already exists.');
      seen.add(key);
    }

    const relations: LexicalRelation[] = relationDrafts
      .filter(({ itemId }) => Boolean(itemId))
      .map(({ itemId, type }) => ({
        id: crypto.randomUUID(),
        itemAId: item.id,
        itemBId: itemId,
        type,
        createdAt: now,
      }));

    await database.items.put(item);
    await database.relations.bulkDelete(
      existingRelations
        .filter((relation) => relation.itemAId === item.id || relation.itemBId === item.id)
        .map(({ id }) => id),
    );
    await database.relations.bulkAdd(relations);

    const replacedAssetIds = [
      values.removeAudio || values.audioAsset ? prior?.audioAssetId : undefined,
      values.removeImage || values.imageAsset ? prior?.imageAssetId : undefined,
    ].filter((id): id is string => Boolean(id));
    await database.mediaAssets.bulkDelete(replacedAssetIds);
    if (values.audioAsset) await database.mediaAssets.put(values.audioAsset);
    if (values.imageAsset) await database.mediaAssets.put(values.imageAsset);
  });
}

export async function deleteVocabularyItem(itemId: string): Promise<void> {
  await database.transaction('rw', database.items, database.relations, database.mediaAssets, async () => {
    const [relations, assets] = await Promise.all([
      database.relations.filter(({ itemAId, itemBId }) => itemAId === itemId || itemBId === itemId).toArray(),
      database.mediaAssets.where('vocabularyItemId').equals(itemId).toArray(),
    ]);
    await database.relations.bulkDelete(relations.map(({ id }) => id));
    await database.mediaAssets.bulkDelete(assets.map(({ id }) => id));
    await database.items.delete(itemId);
  });
}

export function relationLabel(type: RelationType): string {
  return {
    synonym: 'Synonym',
    antonym: 'Antonym',
    genericSpecific: 'Generic / Specific',
    wholePart: 'Whole / Part',
  }[type];
}