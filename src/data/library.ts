import type { Table } from 'dexie';
import { validateMediaAsset, validateRelation, validateVocabularyItem } from '../domain/vocabulary';
import type { LexicalRelation, MediaAsset, VocabularyItem } from '../domain/types';
import { libraryDatabase, type LibraryDatabase } from './database';

export class LibraryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LibraryValidationError';
  }
}

export type LibrarySnapshot = {
  items: VocabularyItem[];
  relations: LexicalRelation[];
  assets: MediaAsset[];
};

function itemRelations(table: Table<LexicalRelation, string>, itemId: string) {
  return table.where('itemAId').equals(itemId).or('itemBId').equals(itemId);
}

export async function getLibrary(database: LibraryDatabase = libraryDatabase): Promise<LibrarySnapshot> {
  const [items, relations, assets] = await Promise.all([
    database.items.toArray(),
    database.relations.toArray(),
    database.assets.toArray(),
  ]);
  return { items, relations, assets };
}

export async function saveLibraryItem(
  item: VocabularyItem,
  relations: LexicalRelation[],
  assets: MediaAsset[] = [],
  database: LibraryDatabase = libraryDatabase,
): Promise<void> {
  const itemValidation = validateVocabularyItem(item);
  if (!itemValidation.valid) throw new LibraryValidationError(itemValidation.message);

  await database.transaction('rw', database.items, database.relations, database.assets, async () => {
    const existingItems = await database.items.toArray();
    const itemIds = new Set(existingItems.map(({ id }) => id));
    itemIds.add(item.id);
    const attachedRelations = await itemRelations(database.relations, item.id).toArray();
    const attachedIds = new Set(attachedRelations.map(({ id }) => id));
    const remainingRelations = (await database.relations.toArray())
      .filter(({ id }) => !attachedIds.has(id));
    const acceptedRelations: LexicalRelation[] = [];
    const relationIds = new Set<string>();

    for (const relation of relations) {
      if (relation.itemAId !== item.id && relation.itemBId !== item.id) {
        throw new LibraryValidationError('Each relationship must include this vocabulary item.');
      }
      if (!itemIds.has(relation.itemAId) || !itemIds.has(relation.itemBId)) {
        throw new LibraryValidationError('Choose an existing related vocabulary item.');
      }
      if (relationIds.has(relation.id)) throw new LibraryValidationError('Relationship IDs must be unique.');
      const validation = validateRelation(relation, [...remainingRelations, ...acceptedRelations]);
      if (!validation.valid) throw new LibraryValidationError(validation.message);
      acceptedRelations.push(relation);
      relationIds.add(relation.id);
    }

    const currentAssets = await database.assets.where('vocabularyItemId').equals(item.id).toArray();
    const incomingAssets = assets.filter((asset) => asset.vocabularyItemId === item.id);
    if (incomingAssets.length !== assets.length) {
      throw new LibraryValidationError('Media must belong to the vocabulary item being saved.');
    }
    const availableAssets = new Map([...currentAssets, ...incomingAssets].map((asset) => [asset.id, asset]));
    const referencedAssetIds = [item.audioAssetId, item.imageAssetId].filter((id): id is string => Boolean(id));
    const referencedAssets = referencedAssetIds.map((id) => availableAssets.get(id));
    if (referencedAssets.some((asset) => !asset)) {
      throw new LibraryValidationError('A selected media file is missing. Select it again and retry.');
    }
    if (new Set(referencedAssets.map((asset) => asset!.type)).size !== referencedAssets.length) {
      throw new LibraryValidationError('Use at most one audio file and one image per item.');
    }
    for (const asset of incomingAssets) {
      const validation = validateMediaAsset(asset);
      if (!validation.valid) throw new LibraryValidationError(validation.message);
      if (!referencedAssetIds.includes(asset.id)) {
        throw new LibraryValidationError('Remove unused media before saving.');
      }
    }
    if (item.audioAssetId && availableAssets.get(item.audioAssetId)?.type !== 'audio') {
      throw new LibraryValidationError('The selected audio attachment is invalid.');
    }
    if (item.imageAssetId && availableAssets.get(item.imageAssetId)?.type !== 'image') {
      throw new LibraryValidationError('The selected image attachment is invalid.');
    }

    await database.items.put(item);
    await itemRelations(database.relations, item.id).delete();
    if (acceptedRelations.length) await database.relations.bulkPut(acceptedRelations);
    const staleAssets = currentAssets.filter((asset) => !referencedAssetIds.includes(asset.id));
    if (staleAssets.length) await database.assets.bulkDelete(staleAssets.map(({ id }) => id));
    if (incomingAssets.length) await database.assets.bulkPut(incomingAssets);
  });
}

export async function deleteLibraryItem(itemId: string, database: LibraryDatabase = libraryDatabase): Promise<void> {
  await database.transaction('rw', database.items, database.relations, database.assets, async () => {
    await database.items.delete(itemId);
    await itemRelations(database.relations, itemId).delete();
    await database.assets.where('vocabularyItemId').equals(itemId).delete();
  });
}