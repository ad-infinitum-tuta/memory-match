import { describe, expect, it } from 'vitest';
import { generateGame } from './generator';
import { createGameState, gameReducer } from './game';
import type { GameSettings, VocabularyItem } from './types';

const settings = (gameStyle: GameSettings['gameStyle']): GameSettings => ({
  gameStyle,
  gameMode: 'classic',
  maxPairs: 4,
  redHerringEnabled: false,
  soundEffectsEnabled: true,
  animationsEnabled: true,
});

const items: VocabularyItem[] = ['a', 'b'].map((id) => ({
  id,
  targetText: `word ${id}`,
  definition: `meaning ${id}`,
  createdAt: '',
  updatedAt: '',
}));

function newGame(style: GameSettings['gameStyle']) {
  const generated = generateGame({
    items,
    relations: [],
    assets: [],
    gameMode: 'classic',
    gameStyle: style,
    maxPairs: 2,
    redHerringEnabled: false,
    random: () => 0.2,
  });
  return createGameState(settings(style), generated);
}

function cardsForItem(state: ReturnType<typeof newGame>, itemId: string) {
  return state.cards.filter(({ itemId: cardItemId }) => cardItemId === itemId);
}

describe('gameReducer', () => {
  it('counts Memory turns on the second valid selection and leaves correct pairs matched', () => {
    let state = newGame('memory');
    const pair = cardsForItem(state, 'a');
    state = gameReducer(state, { type: 'select', cardId: pair[0].id });
    expect(state.turnCount).toBe(0);
    state = gameReducer(state, { type: 'select', cardId: pair[1].id });

    expect(state.turnCount).toBe(1);
    expect(state.matchedPairIds).toHaveLength(1);
    expect(pair.every(({ id }) => state.cards.find((card) => card.id === id)?.state === 'matched')).toBe(true);
    expect(state.isComplete).toBe(false);
    expect(state.isLocked).toBe(true);
    state = gameReducer(state, { type: 'finish-animation' });
    expect(state.isLocked).toBe(false);
  });

  it('ignores matched cards and resolves a Memory mismatch back to hidden', () => {
    let state = newGame('memory');
    const first = state.cards[0];
    const second = state.cards.find(({ itemId }) => itemId !== first.itemId)!;
    state = gameReducer(state, { type: 'select', cardId: first.id });
    state = gameReducer(state, { type: 'select', cardId: second.id });
    expect(state.turnCount).toBe(1);
    expect(state.isLocked).toBe(true);
    expect(state.cards.filter(({ state: cardState }) => cardState === 'incorrect')).toHaveLength(2);
    const lockedState = gameReducer(state, { type: 'select', cardId: state.cards[2].id });
    expect(lockedState).toBe(state);

    state = gameReducer(state, { type: 'resolve-mismatch' });
    expect(state.isLocked).toBe(true);
    expect(state.cards.filter(({ state: cardState }) => cardState === 'hidden')).toHaveLength(4);
    state = gameReducer(state, { type: 'finish-animation' });
    expect(state.isLocked).toBe(false);
  });

  it('scores Match success, waits for removal, and completes after all pairs', () => {
    let state = newGame('match');
    const firstPair = cardsForItem(state, 'a');
    state = gameReducer(state, { type: 'select', cardId: firstPair[0].id });
    state = gameReducer(state, { type: 'select', cardId: firstPair[1].id });
    expect(state.score).toBe(1);
    expect(state.isLocked).toBe(true);
    expect(state.isComplete).toBe(false);
    state = gameReducer(state, { type: 'remove-match' });
    expect(state.cards.filter(({ state: cardState }) => cardState === 'removed')).toHaveLength(2);

    const lastPair = cardsForItem(state, 'b');
    state = gameReducer(state, { type: 'select', cardId: lastPair[0].id });
    state = gameReducer(state, { type: 'select', cardId: lastPair[1].id });
    expect(state.score).toBe(2);
    expect(state.isComplete).toBe(true);
  });

  it('allows Match scores to become negative after an incorrect pair', () => {
    let state = newGame('match');
    state = gameReducer(state, { type: 'select', cardId: state.cards[0].id });
    const differentItem = state.cards.find(({ itemId }) => itemId !== state.cards[0].itemId)!;
    state = gameReducer(state, { type: 'select', cardId: differentItem.id });
    expect(state.score).toBe(0);
    state = gameReducer(state, { type: 'resolve-mismatch' });
    expect(state.score).toBe(-1);
    expect(state.selectedCardIds).toHaveLength(0);
    expect(state.isLocked).toBe(false);
  });

  it('makes restart available after two selections', () => {
    let state = newGame('memory');
    expect(state.selectionCount).toBe(0);
    state = gameReducer(state, { type: 'select', cardId: state.cards[0].id });
    expect(state.selectionCount).toBe(1);
    state = gameReducer(state, { type: 'select', cardId: state.cards[1].id });
    expect(state.selectionCount).toBe(2);
  });
});