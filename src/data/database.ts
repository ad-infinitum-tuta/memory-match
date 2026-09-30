import Dexie, { type Table } from 'dexie';
import type { LexicalRelation, MediaAsset, VocabularyItem } from '../domain/types';

export type StoredPreference = {
  key: string;
  value: unknown;
};

export class VocabularyDatabase extends Dexie {
  items!: Table<VocabularyItem, string>;
  relations!: Table<LexicalRelation, string>;
  mediaAssets!: Table<MediaAsset, string>;
  preferences!: Table<StoredPreference, string>;

  constructor() {
    super('memory-match');
    this.version(1).stores({
      items: '&id, targetTextComparisonKey, definitionComparisonKey, createdAt',
      relations: '&id, [itemAId+itemBId+type], itemAId, itemBId, type',
      mediaAssets: '&id, vocabularyItemId, type, fileName',
      preferences: '&key',
    });
  }
}

export const database = new VocabularyDatabase();