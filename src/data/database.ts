import Dexie, { type Table } from 'dexie';
import type { LexicalRelation, MediaAsset, VocabularyItem } from '../domain/types';

export class LibraryDatabase extends Dexie {
  items!: Table<VocabularyItem, string>;
  relations!: Table<LexicalRelation, string>;
  assets!: Table<MediaAsset, string>;

  constructor(name = 'memory-match') {
    super(name);
    this.version(1).stores({
      items: 'id, targetTextComparisonKey, definitionComparisonKey',
      relations: 'id, type, itemAId, itemBId',
      assets: 'id, vocabularyItemId, type, fileName',
    });
  }
}

export const libraryDatabase = new LibraryDatabase();