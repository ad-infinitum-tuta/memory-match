export type RelationType = 'synonym' | 'antonym' | 'genericSpecific' | 'wholePart';

export type GameMode = 'classic' | RelationType;

export type GameStyle = 'memory' | 'match';

export type Representation = 'targetText' | 'targetAudio' | 'definition' | 'image';

export type VocabularyItem = {
  id: string;
  targetText?: string;
  definition?: string;
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

export type GeneratedCard = {
  id: string;
  itemId: string;
  relationId?: string;
  representation: Representation;
  contentKey: string;
  text?: string;
  assetId?: string;
  isRedHerring: boolean;
};

export type GeneratedPair = {
  id: string;
  itemId?: string;
  relationId?: string;
  cardAId: string;
  cardBId: string;
};

export type GeneratedGame = {
  cards: GeneratedCard[];
  pairs: GeneratedPair[];
};

export type GenerationResult =
  | { kind: 'ready'; game: GeneratedGame }
  | { kind: 'insufficient'; availablePairs: number };