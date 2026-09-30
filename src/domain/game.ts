import type { GameGenerationResult } from './generator';
import type { GameSettings, GameState } from './types';
import type { GeneratedCard } from './types';

export type GameAction =
  | { type: 'select'; cardId: string }
  | { type: 'resolve-mismatch' }
  | { type: 'finish-animation' }
  | { type: 'remove-match' };

export function createGameState(settings: GameSettings, generated: GameGenerationResult): GameState {
  return {
    settings,
    cards: generated.cards,
    pairs: generated.pairs,
    selectedCardIds: [],
    selectionCount: 0,
    matchedPairIds: [],
    turnCount: 0,
    score: 0,
    isLocked: false,
    isAnimating: false,
    isComplete: false,
  };
}

function pairForCards(state: GameState, firstId: string, secondId: string) {
  return state.pairs.find((pair) =>
    (pair.cardAId === firstId && pair.cardBId === secondId)
    || (pair.cardAId === secondId && pair.cardBId === firstId),
  );
}

function setCards(state: GameState, cardIds: string[], cardState: GeneratedCard['state']): GeneratedCard[] {
  const selected = new Set(cardIds);
  return state.cards.map((card) => selected.has(card.id) ? { ...card, state: cardState } : card);
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  if (action.type === 'select') {
    if (state.isLocked || state.isComplete || state.selectedCardIds.includes(action.cardId)) return state;
    const card = state.cards.find(({ id }) => id === action.cardId);
    if (!card) return state;
    if (state.settings.gameStyle === 'memory' && card.state !== 'hidden') return state;
    if (state.settings.gameStyle === 'match' && card.state !== 'revealed') return state;

    const selectedCardIds = [...state.selectedCardIds, card.id];
    const selectionCount = state.selectionCount + 1;
    if (selectedCardIds.length === 1) {
      return {
        ...state,
        cards: setCards(state, [card.id], 'selected'),
        selectedCardIds,
        selectionCount,
      };
    }

    const pair = pairForCards(state, selectedCardIds[0], selectedCardIds[1]);
    const turnCount = state.settings.gameStyle === 'memory' ? state.turnCount + 1 : state.turnCount;
    if (pair && !card.isRedHerring) {
      if (state.settings.gameStyle === 'memory') {
        const matchedPairIds = [...state.matchedPairIds, pair.id];
        return {
          ...state,
          cards: setCards(state, selectedCardIds, 'matched'),
          selectedCardIds: [],
          selectionCount,
          matchedPairIds,
          turnCount,
          isLocked: true,
          isAnimating: true,
          isComplete: matchedPairIds.length === state.pairs.length,
        };
      }

      const matchedPairIds = [...state.matchedPairIds, pair.id];
      return {
        ...state,
        cards: setCards(state, selectedCardIds, 'matched'),
        selectedCardIds,
        selectionCount,
        matchedPairIds,
        score: state.score + 1,
        isLocked: true,
        isComplete: matchedPairIds.length === state.pairs.length,
      };
    }

    return {
      ...state,
      cards: setCards(state, selectedCardIds, 'incorrect'),
      selectedCardIds,
      selectionCount,
      turnCount,
      isLocked: true,
    };
  }

  if (action.type === 'resolve-mismatch') {
    if (!state.isLocked || state.selectedCardIds.length !== 2) return state;
    const cardState = state.settings.gameStyle === 'memory' ? 'hidden' : 'revealed';
    return {
      ...state,
      cards: setCards(state, state.selectedCardIds, cardState),
      selectedCardIds: [],
      score: state.settings.gameStyle === 'match' ? state.score - 1 : state.score,
      isLocked: state.settings.gameStyle === 'memory',
      isAnimating: state.settings.gameStyle === 'memory',
    };
  }

  if (action.type === 'finish-animation') {
    if (!state.isAnimating) return state;
    return { ...state, isAnimating: false, isLocked: false };
  }

  if (action.type === 'remove-match') {
    if (state.settings.gameStyle !== 'match' || !state.isLocked || state.selectedCardIds.length !== 2) return state;
    return {
      ...state,
      cards: setCards(state, state.selectedCardIds, 'removed'),
      selectedCardIds: [],
      isLocked: false,
    };
  }

  return state;
}