import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { database } from './database';
import { deleteVocabularyItem, readLibrary, saveVocabularyItem } from './library';

beforeEach(async () => {
  await database.delete();
  await database.open();
});

describe('library persistence', () => {
  it('saves vocabulary items and relationship mappings together', async () => {
    await saveVocabularyItem({ id: 'one', targetText: 'rápido', definition: 'fast' }, []);
    await saveVocabularyItem({ id: 'two', targetText: 'veloz', definition: 'quick' }, [
      { itemId: 'one', type: 'synonym' },
    ]);

    const library = await readLibrary();
    expect(library.items).toHaveLength(2);
    expect(library.items[0].targetTextComparisonKey).toBe('veloz');
    expect(library.relations).toMatchObject([{ itemAId: 'two', itemBId: 'one', type: 'synonym' }]);
  });

  it('rejects invalid items without writing partial records', async () => {
    await expect(saveVocabularyItem({ id: 'invalid', targetText: 'solo', definition: '' }, []))
      .rejects.toThrow('Add at least two vocabulary elements.');
    expect(await database.items.count()).toBe(0);
  });

  it('rejects exact duplicate items while allowing the same target text with a different definition', async () => {
    await saveVocabularyItem({ id: 'one', targetText: '  banco ', definition: 'bank' }, []);
    await expect(saveVocabularyItem({ id: 'two', targetText: 'BANCO', definition: ' bank ' }, []))
      .rejects.toThrow('An identical vocabulary item already exists.');
    await saveVocabularyItem({ id: 'three', targetText: 'banco', definition: 'bench' }, []);
    expect(await database.items.count()).toBe(2);
  });

  it('removes all relationships when deleting an item', async () => {
    await saveVocabularyItem({ id: 'one', targetText: 'rápido', definition: 'fast' }, []);
    await saveVocabularyItem({ id: 'two', targetText: 'veloz', definition: 'quick' }, [
      { itemId: 'one', type: 'synonym' },
    ]);
    await deleteVocabularyItem('one');

    expect((await readLibrary()).items.map(({ id }) => id)).toEqual(['two']);
    expect(await database.relations.count()).toBe(0);
  });

  it('rejects duplicate reverse mappings within one edit and leaves the previous edit intact', async () => {
    await saveVocabularyItem({ id: 'one', targetText: 'rápido', definition: 'fast' }, []);
    await saveVocabularyItem({ id: 'two', targetText: 'veloz', definition: 'quick' }, [
      { itemId: 'one', type: 'synonym' },
    ]);

    await expect(saveVocabularyItem({ id: 'one', targetText: 'rápido', definition: 'fast' }, [
      { itemId: 'two', type: 'synonym' },
      { itemId: 'two', type: 'synonym' },
    ])).rejects.toThrow('This relationship already exists.');

    const library = await readLibrary();
    expect(library.relations).toHaveLength(1);
    expect(library.relations[0].itemAId).toBe('two');
  });

  it('stores media blobs with an item and replaces/removes old assets on edit', async () => {
    const audio = (id: string, fileName: string) => ({
      id,
      vocabularyItemId: 'one',
      type: 'audio' as const,
      blob: new Blob(['audio']),
      fileName,
      mimeType: 'audio/mpeg',
      fileSize: 5,
      durationSeconds: 2,
      createdAt: '',
    });
    const image = {
      id: 'image-one',
      vocabularyItemId: 'one',
      type: 'image' as const,
      blob: new Blob(['image']),
      fileName: 'photo.webp',
      mimeType: 'image/webp',
      fileSize: 5,
      width: 100,
      height: 100,
      createdAt: '',
    };

    await saveVocabularyItem({ id: 'one', targetText: 'hola', definition: 'hello', audioAsset: audio('audio-one', 'old.mp3'), imageAsset: image }, []);
    await saveVocabularyItem({ id: 'one', targetText: 'hola', definition: 'hello', audioAsset: audio('audio-two', 'new.mp3'), removeImage: true }, []);

    const library = await readLibrary();
    expect(library.items[0]).toMatchObject({ audioAssetId: 'audio-two' });
    expect(library.items[0].imageAssetId).toBeUndefined();
    expect(library.assets.map(({ id }) => id)).toEqual(['audio-two']);
    expect(library.assets[0].blob).toBeInstanceOf(Blob);
  });

  it('rolls back new item and media records when relation validation fails', async () => {
    const audio = {
      id: 'audio-invalid',
      vocabularyItemId: 'one',
      type: 'audio' as const,
      blob: new Blob(['audio']),
      fileName: 'voice.mp3',
      mimeType: 'audio/mpeg',
      fileSize: 5,
      createdAt: '',
    };

    await expect(saveVocabularyItem({ id: 'one', targetText: 'hola', definition: 'hello', audioAsset: audio }, [
      { itemId: 'one', type: 'synonym' },
    ])).rejects.toThrow('A vocabulary item cannot relate to itself.');
    expect(await database.items.count()).toBe(0);
    expect(await database.mediaAssets.count()).toBe(0);
  });
});