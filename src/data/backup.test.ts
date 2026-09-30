import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { applyBackup, exportBackup, findImportConflicts, parseBackup, type BackupBundle } from './backup';
import { database } from './database';
import { readLibrary, saveVocabularyItem } from './library';
import type { LexicalRelation, VocabularyItem } from '../domain/types';
import { normalizeText } from '../domain/validation';

beforeEach(async () => {
  await database.delete();
  await database.open();
});

const createItem = (id: string, targetText: string, definition: string): VocabularyItem => ({
  id,
  targetText,
  targetTextComparisonKey: normalizeText(targetText),
  definition,
  definitionComparisonKey: normalizeText(definition),
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

describe('backup and restore', () => {
  it('round-trips items, relationship mappings, and media blobs through a ZIP', async () => {
    const audio = {
      id: 'audio-one',
      vocabularyItemId: 'one',
      type: 'audio' as const,
      blob: new Blob(['audio-data'], { type: 'audio/mpeg' }),
      fileName: 'voice.mp3',
      mimeType: 'audio/mpeg',
      fileSize: 10,
      durationSeconds: 2,
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    await saveVocabularyItem({ id: 'one', targetText: 'hola', definition: 'hello', audioAsset: audio }, []);
    await saveVocabularyItem({ id: 'two', targetText: 'adiós', definition: 'goodbye' }, [
      { itemId: 'one', type: 'antonym' },
    ]);
    const original = await readLibrary();
    const archive = await exportBackup(original);
    const restored = await parseBackup(archive);

    expect(restored.items).toHaveLength(2);
    expect(restored.relations).toMatchObject([{ itemAId: 'two', itemBId: 'one', type: 'antonym' }]);
    expect(restored.assets[0].fileName).toBe('voice.mp3');
    expect(await restored.assets[0].blob.text()).toBe('audio-data');
  });

  it('rejects invalid archive bytes and invalid relationship references', async () => {
    await expect(parseBackup(new Blob(['not a zip']))).rejects.toThrow('not a readable');
    const archive = await exportBackup({ items: [], relations: [], assets: [] });
    const zip = await import('jszip').then(({ default: JSZip }) => JSZip.loadAsync(archive));
    zip.file('lexical-relations.json', JSON.stringify([{ id: 'bad', itemAId: 'missing', itemBId: 'also-missing', type: 'synonym', createdAt: '' }]));
    await expect(parseBackup(await zip.generateAsync({ type: 'blob' }))).rejects.toThrow('relationship references invalid');
  });

  it('rejects exact duplicate vocabulary records in an imported archive', async () => {
    const first = createItem('first', 'hola', 'hello');
    const second = createItem('second', ' HOLA ', ' hello ');
    const bundle: BackupBundle = { items: [first, second], relations: [], assets: [] };
    const archive = await exportBackup({ ...bundle, assets: [] });
    await expect(parseBackup(archive)).rejects.toThrow('identical vocabulary item');
  });

  it('detects only conflicting IDs whose vocabulary fields differ', async () => {
    const original = createItem('same', 'word', 'meaning');
    const changed = { ...original, definition: 'other', definitionComparisonKey: 'other' };
    expect(findImportConflicts({ items: [original, changed], relations: [], assets: [] }, [original])).toEqual([changed]);
  });

  it('keeps both conflicting items and rewires imported relations to the new ID', async () => {
    await saveVocabularyItem({ id: 'shared', targetText: 'local', definition: 'local meaning' }, []);
    const importedItems = [createItem('shared', 'imported', 'imported meaning'), createItem('related', 'related', 'definition')];
    const relation: LexicalRelation = {
      id: 'relation-one',
      itemAId: 'shared',
      itemBId: 'related',
      type: 'synonym',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const bundle: BackupBundle = { items: importedItems, relations: [relation], assets: [] };
    expect(findImportConflicts(bundle, (await readLibrary()).items)).toHaveLength(1);

    await applyBackup(bundle, { shared: 'both' });
    const library = await readLibrary();
    const imported = library.items.find(({ targetText }) => targetText === 'imported')!;
    expect(library.items).toHaveLength(3);
    expect(library.relations).toMatchObject([{ itemAId: imported.id, itemBId: 'related', type: 'synonym' }]);
  });

  it('supports keep-existing and keep-imported conflict choices', async () => {
    await saveVocabularyItem({ id: 'shared', targetText: 'local', definition: 'local meaning' }, []);
    const bundle: BackupBundle = {
      items: [createItem('shared', 'imported', 'imported meaning')],
      relations: [],
      assets: [],
    };
    await applyBackup(bundle, { shared: 'existing' });
    expect((await readLibrary()).items[0].targetText).toBe('local');

    await applyBackup(bundle, { shared: 'imported' });
    expect((await readLibrary()).items[0].targetText).toBe('imported');
  });

  it('does not import incoming mappings for a keep-existing conflict', async () => {
    await saveVocabularyItem({ id: 'shared', targetText: 'local', definition: 'local meaning' }, []);
    await saveVocabularyItem({ id: 'local-related', targetText: 'nearby', definition: 'local neighbor' }, [
      { itemId: 'shared', type: 'synonym' },
    ]);
    const bundle: BackupBundle = {
      items: [createItem('shared', 'imported', 'imported meaning'), createItem('remote-related', 'remote', 'remote neighbor')],
      relations: [{ id: 'remote-relation', itemAId: 'shared', itemBId: 'remote-related', type: 'synonym', createdAt: '' }],
      assets: [],
    };

    await applyBackup(bundle, { shared: 'existing' });
    const library = await readLibrary();
    expect(library.relations).toHaveLength(1);
    expect(library.relations[0].itemBId).toBe('shared');
  });

  it('replaces mappings attached to a keep-imported conflict', async () => {
    await saveVocabularyItem({ id: 'shared', targetText: 'local', definition: 'local meaning' }, []);
    await saveVocabularyItem({ id: 'local-related', targetText: 'nearby', definition: 'local neighbor' }, [
      { itemId: 'shared', type: 'synonym' },
    ]);
    const bundle: BackupBundle = {
      items: [createItem('shared', 'imported', 'imported meaning'), createItem('remote-related', 'remote', 'remote neighbor')],
      relations: [{ id: 'remote-relation', itemAId: 'shared', itemBId: 'remote-related', type: 'synonym', createdAt: '' }],
      assets: [],
    };

    await applyBackup(bundle, { shared: 'imported' });
    const library = await readLibrary();
    expect(library.relations).toHaveLength(1);
    expect(library.relations[0].itemBId).toBe('remote-related');
  });
});