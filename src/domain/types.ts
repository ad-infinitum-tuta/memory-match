export type RelationType =
  | 'synonym'
  | 'antonym'
  | 'genericSpecific'
  | 'wholePart';

export type GameStyle = 'memory' | 'match';

export type GameMode = 'classic' | RelationType;

export type VocabularyItem = {
  id: string;
  targetText?: string;
  targetTextComparisonKey?: string;
  definition?: string;
  definitionComparisonKey?: string;
  audioAssetId?: string;
  imageAssetId?: string;
  createdAt: string;
  updatedAt: string;
};

export type MediaAsset = {
  id: string;
  vocabularyItemId: string;
  type: 'audio' | 'image';
  blob: Blob;
  fileName: string;
  mimeType: string;
  fileSize: number;
  durationSeconds?: number;
  width?: number;
  height?: number;
  createdAt: string;
};

export type LexicalRelation = {
  id: string;
  itemAId: string;
  itemBId: string;
  type: RelationType;
  createdAt: string;
};

export type GameSettings = {
  gameStyle: GameStyle;
  gameMode: GameMode;
  maxPairs: number;
  redHerringEnabled: boolean;
  soundEffectsEnabled: boolean;
  animationsEnabled: boolean;
};

export type CardRepresentation = 'targetText' | 'targetAudio' | 'definition' | 'image';

export type CardState = 'hidden' | 'revealed' | 'selected' | 'matched' | 'incorrect' | 'removed' | 'disabled';

export type GeneratedCard = {
  id: string;
  itemId: string;
  relationId?: string;
  representation: CardRepresentation;
  contentKey: string;
  isRedHerring: boolean;
  state: CardState;
};

export type GeneratedPair = {
  id: string;
  itemId?: string;
  relationId?: string;
  cardAId: string;
  cardBId: string;
};

export type GameState = {
  settings: GameSettings;
  cards: GeneratedCard[];
  pairs: GeneratedPair[];
  selectedCardIds: string[];
  selectionCount: number;
  matchedPairIds: string[];
  turnCount: number;
  score: number;
  isLocked: boolean;
  isAnimating: boolean;
  isComplete: boolean;
};