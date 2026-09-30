import { describe, expect, it } from 'vitest';
import { canonicalRelationKey, getRelationError, getVocabularyItemErrors, normalizeText } from './validation';

describe('normalizeText', () => {
  it('trims, folds case, and collapses whitespace while preserving diacritics', () => {
    expect(normalizeText('  CAFÉ   au lait  ')).toBe('café au lait');
    expect(normalizeText('cafe au lait')).not.toBe(normalizeText('café au lait'));
  });
});

describe('getVocabularyItemErrors', () => {
  it('requires a target-language element and at least two elements', () => {
    expect(getVocabularyItemErrors({ targetText: ' hola ' })).toEqual([
      'Add at least two vocabulary elements.',
    ]);
    expect(getVocabularyItemErrors({ definition: 'hello', imageAssetId: 'image-1' })).toEqual([
      'Add target-language text or audio.',
    ]);
    expect(getVocabularyItemErrors({ targetText: 'hola', definition: 'hello' })).toEqual([]);
    expect(getVocabularyItemErrors({ audioAssetId: 'audio-1', imageAssetId: 'image-1' })).toEqual([]);
  });
});

describe('relationship validation', () => {
  const items = [{ id: 'a' }, { id: 'b' }];

  it('uses an order-independent key for duplicate detection', () => {
    expect(canonicalRelationKey('a', 'b', 'synonym')).toBe(canonicalRelationKey('b', 'a', 'synonym'));
    expect(getRelationError(
      { itemAId: 'b', itemBId: 'a', type: 'synonym' },
      items,
      [{ itemAId: 'a', itemBId: 'b', type: 'synonym' }],
    )).toBe('This relationship already exists.');
  });

  it('rejects self-links and missing item references', () => {
    expect(getRelationError({ itemAId: 'a', itemBId: 'a', type: 'antonym' }, items)).toBe(
      'A vocabulary item cannot relate to itself.',
    );
    expect(getRelationError({ itemAId: 'a', itemBId: 'missing', type: 'antonym' }, items)).toBe(
      'Both related vocabulary items must exist.',
    );
  });

  it('allows distinct relationship types for the same item pair', () => {
    expect(getRelationError(
      { itemAId: 'a', itemBId: 'b', type: 'antonym' },
      items,
      [{ itemAId: 'a', itemBId: 'b', type: 'synonym' }],
    )).toBeUndefined();
  });
});