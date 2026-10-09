import { describe, expect, it } from 'vitest';
import { generateGame } from './game-generation';
import { normalizeText } from './text';
import type { LexicalRelation, VocabularyItem } from './types';

function item(id: string, targetText: string, definition: string): VocabularyItem {
  return { id, targetText, definition, createdAt: '', updatedAt: '' };
}

function relation(id: string, itemAId: string, itemBId: string): LexicalRelation {
  return { id, itemAId, itemBId, type: 'synonym', createdAt: '' };
}

const settings = { gameMode: 'classic' as const, maxPairs: 8, redHerringEnabled: false };

describe('normalizeText', () => {
  it('folds case and whitespace without removing diacritics', () => {
    expect(normalizeText('  CAFÉ   con leche ')).toBe('café con leche');
    expect(normalizeText('café')).not.toBe(normalizeText('cafe'));
  });
});

describe('generateGame', () => {
  it('generates one valid target-language pair per Classic item', () => {
    const result = generateGame({
      items: [item('a', 'gato', 'cat'), item('b', 'perro', 'dog')],
      relations: [],
      assets: [],
      settings,
      random: () => 0,
    });

    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') {
      expect(result.game.pairs).toHaveLength(2);
      expect(result.game.cards).toHaveLength(4);
      expect(result.game.pairs.every((pair) => pair.itemId)).toBe(true);
    }
  });

  it('rejects duplicate target text even when definitions differ', () => {
    const result = generateGame({
      items: [item('a', 'banco', 'bank'), item('b', ' BANCO ', 'bench'), item('c', 'gato', 'cat')],
      relations: [],
      assets: [],
      settings,
      random: () => 0,
    });

    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') {
      const itemIds = result.game.pairs.map((pair) => pair.itemId);
      expect(itemIds.filter((id) => id === 'a' || id === 'b')).toHaveLength(1);
    }
  });

  it('selects relationship pairs without reusing an item', () => {
    const items = [item('a', 'rápido', 'fast'), item('b', 'veloz', 'swift'), item('c', 'ligero', 'light'), item('d', 'ágil', 'agile')];
    const result = generateGame({
      items,
      relations: [relation('ab', 'a', 'b'), relation('ac', 'a', 'c'), relation('cd', 'c', 'd')],
      assets: [],
      settings: { ...settings, gameMode: 'synonym' },
      random: () => 0.99,
    });

    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') {
      expect(result.game.pairs).toHaveLength(2);
      expect(new Set(result.game.cards.map((card) => card.itemId)).size).toBe(4);
    }
  });

  it('adds at most one unique red herring outside generated pairs', () => {
    const result = generateGame({
      items: [item('a', 'gato', 'cat'), item('b', 'perro', 'dog'), item('c', 'pájaro', 'bird')],
      relations: [],
      assets: [],
      settings: { ...settings, maxPairs: 2, redHerringEnabled: true },
      random: () => 0,
    });

    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') {
      expect(result.game.cards.filter((card) => card.isRedHerring)).toHaveLength(1);
      expect(result.game.cards).toHaveLength(5);
    }
  });

  it('reports insufficient vocabulary below two pairs', () => {
    const result = generateGame({
      items: [item('a', 'gato', 'cat')],
      relations: [],
      assets: [],
      settings,
    });
    expect(result).toEqual({ kind: 'insufficient', availablePairs: 1 });
  });
});