import { describe, expect, it } from 'vitest';
import { generateGame } from './generator';
import type { LexicalRelation, VocabularyItem } from './types';

const item = (id: string, targetText: string, definition = `meaning ${id}`): VocabularyItem => ({
  id,
  targetText,
  definition,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const generate = (items: VocabularyItem[], relations: LexicalRelation[] = [], overrides = {}) => generateGame({
  items,
  relations,
  assets: [],
  gameMode: 'classic',
  gameStyle: 'memory',
  maxPairs: 20,
  redHerringEnabled: false,
  random: () => 0.37,
  ...overrides,
});

describe('generateGame', () => {
  it('creates one valid Classic pair per chosen item and hides Memory cards', () => {
    const result = generate([item('a', 'hola'), item('b', 'adiós')]);
    expect(result.status).toBe('ready');
    expect(result.pairs).toHaveLength(2);
    expect(result.cards).toHaveLength(4);
    expect(result.cards.every(({ state }) => state === 'hidden')).toBe(true);
    expect(new Set(result.pairs.map(({ itemId }) => itemId)).size).toBe(2);
  });

  it('chooses no more than the configured pair maximum', () => {
    const result = generate([item('a', 'one'), item('b', 'two'), item('c', 'three')], [], { maxPairs: 2 });
    expect(result.pairs).toHaveLength(2);
  });

  it('excludes duplicated normalized target text even when definitions differ', () => {
    const result = generate([item('a', '  FAST '), item('b', 'fast', 'quick'), item('c', 'slow')]);
    expect(result.status).toBe('ready');
    const selectedItemIds = new Set(result.pairs.map(({ itemId }) => itemId));
    expect(selectedItemIds.has('a') && selectedItemIds.has('b')).toBe(false);
  });

  it('returns an insufficient result instead of a partial board with fewer than two pairs', () => {
    expect(generate([item('a', 'only')])).toEqual({ status: 'insufficient', cards: [], pairs: [] });
  });

  it('selects only non-overlapping relationship mappings', () => {
    const items = ['a', 'b', 'c', 'd', 'e'].map((id) => item(id, id));
    const relations: LexicalRelation[] = [
      { id: 'ab', itemAId: 'a', itemBId: 'b', type: 'synonym', createdAt: '' },
      { id: 'ac', itemAId: 'a', itemBId: 'c', type: 'synonym', createdAt: '' },
      { id: 'de', itemAId: 'd', itemBId: 'e', type: 'synonym', createdAt: '' },
    ];
    const result = generate(items, relations, { gameMode: 'synonym' });
    const usedIds = result.pairs.flatMap(({ relationId }) => {
      const relation = relations.find(({ id }) => id === relationId)!;
      return [relation.itemAId, relation.itemBId];
    });

    expect(result.pairs).toHaveLength(2);
    expect(new Set(usedIds).size).toBe(usedIds.length);
  });

  it('rejects a relationship pair whose two cards show identical normalized text', () => {
    const items = [item('a', 'same'), item('b', ' SAME '), item('c', 'third'), item('d', 'fourth')];
    const relations: LexicalRelation[] = [
      { id: 'ab', itemAId: 'a', itemBId: 'b', type: 'antonym', createdAt: '' },
      { id: 'cd', itemAId: 'c', itemBId: 'd', type: 'antonym', createdAt: '' },
    ];
    const result = generate(items, relations, { gameMode: 'antonym' });
    expect(result.status).toBe('insufficient');
    expect(result.cards).toHaveLength(0);
  });

  it('rejects duplicate target words in one relationship even when distinct audio is available', () => {
    const items = [
      { ...item('a', 'same'), audioAssetId: 'audio-a' },
      { ...item('b', ' SAME ', 'different'), audioAssetId: 'audio-b' },
      item('c', 'third'),
      item('d', 'fourth'),
      item('e', 'fifth'),
      item('f', 'sixth'),
    ];
    const relations: LexicalRelation[] = [
      { id: 'ab', itemAId: 'a', itemBId: 'b', type: 'synonym', createdAt: '' },
      { id: 'cd', itemAId: 'c', itemBId: 'd', type: 'synonym', createdAt: '' },
      { id: 'ef', itemAId: 'e', itemBId: 'f', type: 'synonym', createdAt: '' },
    ];
    const assets = [
      { id: 'audio-a', type: 'audio' as const, fileName: 'a.mp3' },
      { id: 'audio-b', type: 'audio' as const, fileName: 'b.mp3' },
    ];
    const result = generate(items, relations, { gameMode: 'synonym', assets });
    expect(result.pairs).toHaveLength(2);
    expect(result.pairs.some(({ relationId }) => relationId === 'ab')).toBe(false);
  });

  it('compares media filenames as stored rather than normalizing their case', () => {
    const items = [
      { id: 'a', targetText: 'first', audioAssetId: 'audio-a', createdAt: '', updatedAt: '' },
      { id: 'b', targetText: 'second', audioAssetId: 'audio-b', createdAt: '', updatedAt: '' },
    ];
    const assets = [
      { id: 'audio-a', type: 'audio' as const, fileName: 'Voice.mp3' },
      { id: 'audio-b', type: 'audio' as const, fileName: 'voice.mp3' },
    ];
    const result = generate(items, [], { assets });
    expect(result.status).toBe('ready');
    expect(result.pairs).toHaveLength(2);
    expect(result.cards.filter(({ representation }) => representation === 'targetAudio')).toHaveLength(2);
  });

  it('adds a unique red-herring card without adding a valid pair', () => {
    const result = generate([item('a', 'hola'), item('b', 'adiós'), item('c', 'gracias')], [], { redHerringEnabled: true, maxPairs: 2 });
    expect(result.pairs).toHaveLength(2);
    expect(result.cards.filter(({ isRedHerring }) => isRedHerring)).toHaveLength(1);
    expect(result.cards).toHaveLength(5);
  });

  it('starts Match cards face up', () => {
    const result = generate([item('a', 'hola'), item('b', 'adiós')], [], { gameStyle: 'match' });
    expect(result.cards.every(({ state }) => state === 'revealed')).toBe(true);
  });
});