import { normalizeText } from './text';
import type {
  GeneratedCard,
  GeneratedGame,
  GenerationResult,
  GameMode,
  GameSettings,
  LexicalRelation,
  MediaAsset,
  Representation,
  VocabularyItem,
} from './types';

type GeneratorInput = {
  items: VocabularyItem[];
  relations: LexicalRelation[];
  assets: MediaAsset[];
  settings: Pick<GameSettings, 'gameMode' | 'maxPairs' | 'redHerringEnabled'>;
  random?: () => number;
};

const CLASSIC_COMBINATIONS: [Representation, Representation][] = [
  ['targetText', 'definition'],
  ['targetAudio', 'definition'],
  ['targetText', 'image'],
  ['targetAudio', 'image'],
  ['targetText', 'targetAudio'],
];

function shuffled<T>(values: T[], random: () => number): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function representationValue(
  item: VocabularyItem,
  representation: Representation,
  assetsById: Map<string, MediaAsset>,
): { contentKey: string; text?: string; assetId?: string } | undefined {
  if (representation === 'targetText' && item.targetText?.trim()) {
    return { contentKey: normalizeText(item.targetText), text: item.targetText.trim() };
  }
  if (representation === 'definition' && item.definition?.trim()) {
    return { contentKey: normalizeText(item.definition), text: item.definition.trim() };
  }
  const assetId = representation === 'targetAudio' ? item.audioAssetId
    : representation === 'image' ? item.imageAssetId : undefined;
  const asset = assetId ? assetsById.get(assetId) : undefined;
  if (!asset) return undefined;
  return { contentKey: normalizeText(asset.fileName), assetId: asset.id };
}

function card(
  item: VocabularyItem,
  representation: Representation,
  assetsById: Map<string, MediaAsset>,
  relationId?: string,
  isRedHerring = false,
): GeneratedCard | undefined {
  const value = representationValue(item, representation, assetsById);
  if (!value) return undefined;
  return {
    id: `${item.id}:${representation}:${relationId ?? 'classic'}${isRedHerring ? ':red-herring' : ''}`,
    itemId: item.id,
    relationId,
    representation,
    contentKey: value.contentKey,
    text: value.text,
    assetId: value.assetId,
    isRedHerring,
  };
}

function getAvailableRepresentations(item: VocabularyItem, assetsById: Map<string, MediaAsset>): Representation[] {
  return (['targetText', 'targetAudio', 'definition', 'image'] as Representation[])
    .filter((representation) => Boolean(representationValue(item, representation, assetsById)));
}

function canAdd(
  cards: GeneratedCard[],
  usedContent: Set<string>,
  usedItemTexts: Set<string>,
  usedItemIds: Set<string>,
): boolean {
  const itemTextKeys = new Set<string>();
  for (const current of cards) {
    const itemText = current.representation === 'targetText'
      ? current.contentKey
      : undefined;
    if (itemText && (usedItemTexts.has(itemText) || itemTextKeys.has(itemText))) return false;
    if (itemText) itemTextKeys.add(itemText);
    const contentKey = `${current.representation}:${current.contentKey}`;
    if (usedContent.has(contentKey)) return false;
    if (usedItemIds.has(current.itemId)) return false;
  }
  return true;
}

function getItemTextKey(item: VocabularyItem): string | undefined {
  return item.targetText?.trim() ? normalizeText(item.targetText) : undefined;
}

function selectClassicPairs(
  input: GeneratorInput,
  assetsById: Map<string, MediaAsset>,
  random: () => number,
): GeneratedGame {
  const itemOrder = shuffled(input.items, random);
  const usedContent = new Set<string>();
  const usedItemTexts = new Set<string>();
  const usedItemIds = new Set<string>();
  const game: GeneratedGame = { cards: [], pairs: [] };

  for (const item of itemOrder) {
    if (game.pairs.length >= input.settings.maxPairs) break;
    const textKey = getItemTextKey(item);
    if ((textKey && usedItemTexts.has(textKey)) || usedItemIds.has(item.id)) continue;

    const combinations = shuffled(CLASSIC_COMBINATIONS, random);
    for (const [representationA, representationB] of combinations) {
      const cardA = card(item, representationA, assetsById);
      const cardB = card(item, representationB, assetsById);
      if (!cardA || !cardB || !canAdd([cardA, cardB], usedContent, usedItemTexts, usedItemIds)) continue;

      const pairId = `classic:${item.id}`;
      game.cards.push(cardA, cardB);
      game.pairs.push({ id: pairId, itemId: item.id, cardAId: cardA.id, cardBId: cardB.id });
      usedContent.add(`${cardA.representation}:${cardA.contentKey}`);
      usedContent.add(`${cardB.representation}:${cardB.contentKey}`);
      if (textKey) usedItemTexts.add(textKey);
      usedItemIds.add(item.id);
      break;
    }
  }

  addRedHerring(game, input, assetsById, usedContent, usedItemTexts, usedItemIds, random);
  return game;
}

function selectRelationshipPairs(
  input: GeneratorInput,
  itemsById: Map<string, VocabularyItem>,
  assetsById: Map<string, MediaAsset>,
  random: () => number,
): GeneratedGame {
  const usedContent = new Set<string>();
  const usedItemTexts = new Set<string>();
  const usedItemIds = new Set<string>();
  const game: GeneratedGame = { cards: [], pairs: [] };
  const relations = shuffled(input.relations.filter(({ type }) => type === input.settings.gameMode), random);

  for (const relation of relations) {
    if (game.pairs.length >= input.settings.maxPairs) break;
    const itemA = itemsById.get(relation.itemAId);
    const itemB = itemsById.get(relation.itemBId);
    if (!itemA || !itemB || usedItemIds.has(itemA.id) || usedItemIds.has(itemB.id)) continue;

    const textKeyA = getItemTextKey(itemA);
    const textKeyB = getItemTextKey(itemB);
    if ((textKeyA && (usedItemTexts.has(textKeyA) || textKeyA === textKeyB))
      || (textKeyB && usedItemTexts.has(textKeyB))) continue;

    const optionsA = shuffled(getAvailableRepresentations(itemA, assetsById)
      .filter((representation) => representation === 'targetText' || representation === 'targetAudio'), random);
    const optionsB = shuffled(getAvailableRepresentations(itemB, assetsById)
      .filter((representation) => representation === 'targetText' || representation === 'targetAudio'), random);

    let selectedCards: [GeneratedCard, GeneratedCard] | undefined;
    for (const representationA of optionsA) {
      for (const representationB of optionsB) {
        const cardA = card(itemA, representationA, assetsById, relation.id);
        const cardB = card(itemB, representationB, assetsById, relation.id);
        if (cardA && cardB && canAdd([cardA, cardB], usedContent, usedItemTexts, usedItemIds)) {
          selectedCards = [cardA, cardB];
          break;
        }
      }
      if (selectedCards) break;
    }
    if (!selectedCards) continue;

    const [cardA, cardB] = selectedCards;
    game.cards.push(cardA, cardB);
    game.pairs.push({ id: `relation:${relation.id}`, relationId: relation.id, cardAId: cardA.id, cardBId: cardB.id });
    usedContent.add(`${cardA.representation}:${cardA.contentKey}`);
    usedContent.add(`${cardB.representation}:${cardB.contentKey}`);
    if (textKeyA) usedItemTexts.add(textKeyA);
    if (textKeyB) usedItemTexts.add(textKeyB);
    usedItemIds.add(itemA.id);
    usedItemIds.add(itemB.id);
  }

  addRedHerring(game, input, assetsById, usedContent, usedItemTexts, usedItemIds, random);
  return game;
}

function addRedHerring(
  game: GeneratedGame,
  input: GeneratorInput,
  assetsById: Map<string, MediaAsset>,
  usedContent: Set<string>,
  usedItemTexts: Set<string>,
  usedItemIds: Set<string>,
  random: () => number,
): void {
  if (!input.settings.redHerringEnabled) return;

  const candidates = shuffled(input.items.filter((item) => !usedItemIds.has(item.id)), random);
  for (const item of candidates) {
    const itemText = getItemTextKey(item);
    if (itemText && usedItemTexts.has(itemText)) continue;
    const representations = input.settings.gameMode === 'classic'
      ? getAvailableRepresentations(item, assetsById)
      : getAvailableRepresentations(item, assetsById).filter((representation) => representation === 'targetText' || representation === 'targetAudio');
    for (const representation of shuffled(representations, random)) {
      const redHerring = card(item, representation, assetsById, undefined, true);
      if (!redHerring || !canAdd([redHerring], usedContent, usedItemTexts, usedItemIds)) continue;
      game.cards.push(redHerring);
      return;
    }
  }
}

export function generateGame(input: GeneratorInput): GenerationResult {
  const random = input.random ?? Math.random;
  const itemsById = new Map(input.items.map((item) => [item.id, item]));
  const assetsById = new Map(input.assets.map((asset) => [asset.id, asset]));
  const normalizedSettings = {
    ...input,
    settings: { ...input.settings, maxPairs: Math.max(2, Math.min(20, Math.floor(input.settings.maxPairs))) },
  };
  let game: GeneratedGame = { cards: [], pairs: [] };
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const candidate = normalizedSettings.settings.gameMode === 'classic'
      ? selectClassicPairs(normalizedSettings, assetsById, random)
      : selectRelationshipPairs(normalizedSettings, itemsById, assetsById, random);
    if (candidate.pairs.length > game.pairs.length) game = candidate;
    if (game.pairs.length === normalizedSettings.settings.maxPairs) break;
  }

  if (game.pairs.length < 2) return { kind: 'insufficient', availablePairs: game.pairs.length };
  return { kind: 'ready', game: { ...game, cards: shuffled(game.cards, random) } };
}

export function relationTypeForMode(mode: GameMode): LexicalRelation['type'] | undefined {
  return mode === 'classic' ? undefined : mode;
}