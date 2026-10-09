import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LibraryDatabase } from './database';
import { deleteLibraryItem, getLibrary, LibraryValidationError, saveLibraryItem } from './library';
import type { LexicalRelation, VocabularyItem } from '../domain/types';

let database: LibraryDatabase;

function item(id: string, targetText: string, definition: string): VocabularyItem {
  return { id, targetText, definition, createdAt: '', updatedAt: '' };
}

function relation(id: string, itemAId: string, itemBId: string): LexicalRelation {
  return { id, itemAId, itemBId, type: 'synonym', createdAt: '' };
}

beforeEach(async () => {
  database = new LibraryDatabase(`test-${crypto.randomUUID()}`);
  await database.open();
});

afterEach(async () => {
  await database.delete();
});

describe('library persistence', () => {
  it('saves items and relationships together', async () => {
    const first = item('first', 'gato', 'cat');
    const second = item('second', 'felino', 'feline');
    await saveLibraryItem(first, [], [], database);
    await saveLibraryItem(second, [relation('related', 'second', 'first')], [], database);

    const library = await getLibrary(database);
    expect(library.items).toHaveLength(2);
    expect(library.relations).toEqual([relation('related', 'second', 'first')]);
  });

  it('rolls back an invalid vocabulary save', async () => {
    await expect(saveLibraryItem({ ...item('invalid', 'solo', ''), definition: '' }, [], [], database))
      .rejects.toBeInstanceOf(LibraryValidationError);
    expect(await database.items.count()).toBe(0);
  });

  it('rejects reversed duplicate relationships in one edit', async () => {
    await saveLibraryItem(item('first', 'gato', 'cat'), [], [], database);
    await saveLibraryItem(item('second', 'felino', 'feline'), [], [], database);

    await expect(saveLibraryItem(item('first', 'gato', 'cat'), [
      relation('one', 'first', 'second'),
      relation('two', 'second', 'first'),
    ], [], database))
      .rejects.toThrow('This relationship already exists.');
  });

  it('cascades item deletion to relationships and media', async () => {
    await saveLibraryItem(item('first', 'gato', 'cat'), [], [], database);
    await saveLibraryItem(item('second', 'felino', 'feline'), [relation('related', 'second', 'first')], [], database);
    await deleteLibraryItem('first', database);

    const library = await getLibrary(database);
    expect(library.items.map(({ id }) => id)).toEqual(['second']);
    expect(library.relations).toEqual([]);
    expect(library.assets).toEqual([]);
  });
});