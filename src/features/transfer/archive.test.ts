import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getLibrary, saveLibraryItem } from '../../data/library';
import { LibraryDatabase } from '../../data/database';
import type { LexicalRelation, MediaAsset, VocabularyItem } from '../../domain/types';
import { applyImport, exportLibraryZip, findImportConflicts, parseImportArchive } from './archive';

let database: LibraryDatabase;

function item(id: string, targetText: string, definition: string, audioAssetId?: string): VocabularyItem {
  return { id, targetText, definition, audioAssetId, createdAt: '2026-01-01', updatedAt: '2026-01-01' };
}

function audioAsset(id: string, vocabularyItemId: string): MediaAsset {
  const blob = new Blob(['audio-data'], { type: 'audio/mpeg' });
  return {
    id,
    vocabularyItemId,
    type: 'audio',
    blob,
    fileName: `${id}.mp3`,
    mimeType: 'audio/mpeg',
    fileSize: blob.size,
    durationSeconds: 1,
    createdAt: '2026-01-01',
  };
}

function relation(id: string, itemAId: string, itemBId: string): LexicalRelation {
  return { id, itemAId, itemBId, type: 'synonym', createdAt: '2026-01-01' };
}

beforeEach(async () => {
  database = new LibraryDatabase(`archive-test-${crypto.randomUUID()}`);
  await database.open();
});

afterEach(async () => {
  await database.delete();
});

describe('ZIP transfer', () => {
  it('round-trips items, relations, media metadata, and blobs', async () => {
    const first = item('first', 'gato', 'cat', 'voice-first');
    const second = item('second', 'felino', 'feline');
    const asset = audioAsset('voice-first', first.id);
    const library = {
      items: [first, second],
      relations: [relation('synonym-first-second', first.id, second.id)],
      assets: [asset],
    };

    const restored = await parseImportArchive(await exportLibraryZip(library));
    expect(restored.items).toEqual(library.items);
    expect(restored.relations).toEqual(library.relations);
    expect(restored.assets[0]).toMatchObject({ id: asset.id, fileName: asset.fileName, mimeType: asset.mimeType });
    expect(restored.assets[0].blob.size).toBe(asset.blob.size);
  });

  it('duplicates a conflicting item and remaps its media and relation endpoints', async () => {
    const existing = item('shared', 'gato', 'cat');
    await saveLibraryItem(existing, [], [], database);
    const imported = item('shared', 'perro', 'dog', 'voice-shared');
    const related = item('related', 'canino', 'canine');
    const bundle = {
      items: [imported, related],
      relations: [relation('relation-shared-related', imported.id, related.id)],
      assets: [audioAsset('voice-shared', imported.id)],
    };
    const conflicts = findImportConflicts(bundle, [existing]);
    expect(conflicts).toHaveLength(1);

    const result = await applyImport(bundle, { shared: 'both' }, database);
    const restored = await getLibrary(database);
    const importedCopy = restored.items.find(({ targetText }) => targetText === 'perro');
    expect(result).toMatchObject({ itemsAdded: 1, itemsDuplicated: 1, relationsAdded: 1 });
    expect(importedCopy).toBeDefined();
    expect(importedCopy?.id).not.toBe(existing.id);
    expect(importedCopy?.audioAssetId).toBeDefined();
    expect(restored.assets[0].vocabularyItemId).toBe(importedCopy?.id);
    expect(restored.items.find(({ id }) => id === existing.id)).toEqual(existing);
    expect(restored.relations[0]).toMatchObject({ itemAId: importedCopy?.id, itemBId: 'related' });
  });

  it('keeps local conflicts without importing the conflicting item media', async () => {
    const existing = item('shared', 'gato', 'cat');
    await saveLibraryItem(existing, [], [], database);
    const bundle = {
      items: [item('shared', 'perro', 'dog', 'voice-shared'), item('related', 'canino', 'canine')],
      relations: [relation('relation-shared-related', 'shared', 'related')],
      assets: [audioAsset('voice-shared', 'shared')],
    };

    await applyImport(bundle, { shared: 'existing' }, database);
    const restored = await getLibrary(database);
    expect(restored.items.find(({ id }) => id === 'shared')).toEqual(existing);
    expect(restored.items.some(({ id }) => id === 'related')).toBe(true);
    expect(restored.assets).toEqual([]);
    expect(restored.relations).toHaveLength(1);
  });

  it('replaces local conflicts and their previous media', async () => {
    const existing = item('shared', 'gato', 'cat', 'old-voice');
    const oldAsset = audioAsset('old-voice', 'shared');
    await saveLibraryItem(existing, [], [oldAsset], database);
    const imported = item('shared', 'perro', 'dog', 'new-voice');
    const bundle = { items: [imported], relations: [], assets: [audioAsset('new-voice', 'shared')] };

    await applyImport(bundle, { shared: 'imported' }, database);
    const restored = await getLibrary(database);
    expect(restored.items).toEqual([imported]);
    expect(restored.assets.map(({ id }) => id)).toEqual(['new-voice']);
  });
});