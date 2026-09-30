import type {
  CardRepresentation,
  CardState,
  GameMode,
  GameStyle,
  GeneratedCard,
  GeneratedPair,
  LexicalRelation,
  MediaAsset,
  RelationType,
  VocabularyItem,
} from './types';
import { normalizeText } from './validation';

type AssetMetadata = Pick<MediaAsset, 'id' | 'type' | 'fileName'>;

type CardChoice = {
  itemId: string;
  representation: CardRepresentation;
  contentKey: string;
};

type PairChoice = {
  groupId: string;
  itemIds: string[];
  relationId?: string;
  itemId?: string;
  cards: [CardChoice, CardChoice];
  uniquenessKeys: Set<string>;
};

type PairGroup = {
  id: string;
  options: PairChoice[];
};

export type GenerateGameInput = {
  items: ReadonlyArray<VocabularyItem>;
  relations: ReadonlyArray<LexicalRelation>;
  assets: ReadonlyArray<AssetMetadata>;
  gameMode: GameMode;
  gameStyle: GameStyle;
  maxPairs: number;
  redHerringEnabled: boolean;
  random?: () => number;
};

export type GameGenerationResult = {
  status: 'ready' | 'insufficient';
  cards: GeneratedCard[];
  pairs: GeneratedPair[];
};

type Element = {
  representation: CardRepresentation;
  contentKey: string;
};

function shuffle<T>(values: T[], random: () => number): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function makeId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function targetTextKey(item: VocabularyItem): string | undefined {
  const normalized = item.targetTextComparisonKey ?? (item.targetText ? normalizeText(item.targetText) : '');
  return normalized ? `target:${normalized}` : undefined;
}

function getElements(item: VocabularyItem, assetsById: Map<string, AssetMetadata>): Element[] {
  const elements: Element[] = [];
  if (item.targetText?.trim()) {
    elements.push({ representation: 'targetText', contentKey: `target:${normalizeText(item.targetText)}` });
  }
  if (item.definition?.trim()) {
    elements.push({ representation: 'definition', contentKey: `definition:${normalizeText(item.definition)}` });
  }
  const audio = item.audioAssetId ? assetsById.get(item.audioAssetId) : undefined;
  if (audio?.type === 'audio') {
    elements.push({ representation: 'targetAudio', contentKey: `audio:${audio.fileName}` });
  }
  const image = item.imageAssetId ? assetsById.get(item.imageAssetId) : undefined;
  if (image?.type === 'image') {
    elements.push({ representation: 'image', contentKey: `image:${image.fileName}` });
  }
  return elements;
}

function classicGroups(
  items: ReadonlyArray<VocabularyItem>,
  assetsById: Map<string, AssetMetadata>,
): PairGroup[] {
  return items.map((item) => {
    const elements = getElements(item, assetsById);
    const options: PairChoice[] = [];

    for (let first = 0; first < elements.length; first += 1) {
      for (let second = first + 1; second < elements.length; second += 1) {
        const cardA = elements[first];
        const cardB = elements[second];
        const hasTargetElement = [cardA, cardB].some(({ representation }) =>
          representation === 'targetText' || representation === 'targetAudio',
        );
        if (!hasTargetElement) continue;

        const uniquenessKeys = new Set([cardA.contentKey, cardB.contentKey]);
        const itemTargetKey = targetTextKey(item);
        if (itemTargetKey) uniquenessKeys.add(itemTargetKey);
        options.push({
          groupId: item.id,
          itemIds: [item.id],
          itemId: item.id,
          cards: [
            { itemId: item.id, representation: cardA.representation, contentKey: cardA.contentKey },
            { itemId: item.id, representation: cardB.representation, contentKey: cardB.contentKey },
          ],
          uniquenessKeys,
        });
      }
    }

    return { id: item.id, options };
  }).filter(({ options }) => options.some((option) => 'cards' in option));
}

function relationshipGroups(
  mode: RelationType,
  itemsById: Map<string, VocabularyItem>,
  assetsById: Map<string, AssetMetadata>,
  relations: ReadonlyArray<LexicalRelation>,
): PairGroup[] {
  return relations.filter(({ type }) => type === mode).flatMap((relation) => {
    const itemA = itemsById.get(relation.itemAId);
    const itemB = itemsById.get(relation.itemBId);
    if (!itemA || !itemB) return [];
    const repsA = getElements(itemA, assetsById).filter(({ representation }) =>
      representation === 'targetText' || representation === 'targetAudio',
    );
    const repsB = getElements(itemB, assetsById).filter(({ representation }) =>
      representation === 'targetText' || representation === 'targetAudio',
    );
    if (targetTextKey(itemA) && targetTextKey(itemA) === targetTextKey(itemB)) return [];
    const options: PairChoice[] = [];

    for (const cardA of repsA) {
      for (const cardB of repsB) {
        if (cardA.contentKey === cardB.contentKey) continue;
        const uniquenessKeys = new Set([cardA.contentKey, cardB.contentKey]);
        const itemAKey = targetTextKey(itemA);
        const itemBKey = targetTextKey(itemB);
        if (itemAKey) uniquenessKeys.add(itemAKey);
        if (itemBKey) uniquenessKeys.add(itemBKey);
        options.push({
          groupId: relation.id,
          relationId: relation.id,
          itemIds: [itemA.id, itemB.id],
          cards: [
            { itemId: itemA.id, representation: cardA.representation, contentKey: cardA.contentKey },
            { itemId: itemB.id, representation: cardB.representation, contentKey: cardB.contentKey },
          ],
          uniquenessKeys,
        });
      }
    }
    return options.length ? [{ id: relation.id, options }] : [];
  });
}

function selectPairs(groups: PairGroup[], limit: number, random: () => number): PairChoice[] {
  const orderedGroups = shuffle(groups, random).map((group) => ({
    ...group,
    options: shuffle(group.options, random),
  }));
  let best: PairChoice[] = [];
  let visited = 0;
  const maxVisited = 50000;

  function search(index: number, selected: PairChoice[], usedItems: Set<string>, usedKeys: Set<string>): boolean {
    visited += 1;
    if (selected.length > best.length) best = [...selected];
    if (selected.length >= limit) return true;
    if (index >= orderedGroups.length || visited >= maxVisited) return false;
    if (selected.length + orderedGroups.length - index <= best.length) return false;

    const group = orderedGroups[index];
    for (const option of group.options) {
      if (option.itemIds.some((id) => usedItems.has(id))) continue;
      if ([...option.uniquenessKeys].some((key) => usedKeys.has(key))) continue;
      const nextItems = new Set(usedItems);
      const nextKeys = new Set(usedKeys);
      option.itemIds.forEach((id) => nextItems.add(id));
      option.uniquenessKeys.forEach((key) => nextKeys.add(key));
      selected.push(option);
      if (search(index + 1, selected, nextItems, nextKeys)) return true;
      selected.pop();
    }

    return search(index + 1, selected, usedItems, usedKeys);
  }

  search(0, [], new Set(), new Set());
  return best;
}

function makeCard(
  choice: CardChoice,
  isRedHerring: boolean,
  state: CardState,
  relationId?: string,
): GeneratedCard {
  return {
    id: makeId(),
    itemId: choice.itemId,
    ...(relationId ? { relationId } : {}),
    representation: choice.representation,
    contentKey: choice.contentKey,
    isRedHerring,
    state,
  };
}

function addRedHerring(
  cards: GeneratedCard[],
  selectedPairs: PairChoice[],
  items: ReadonlyArray<VocabularyItem>,
  assetsById: Map<string, AssetMetadata>,
  mode: GameMode,
  random: () => number,
  state: CardState,
): void {
  const usedItemIds = new Set(selectedPairs.flatMap(({ itemIds }) => itemIds));
  const usedKeys = new Set(selectedPairs.flatMap(({ uniquenessKeys }) => [...uniquenessKeys]));
  const options = items.filter(({ id }) => !usedItemIds.has(id)).flatMap((item) => {
    const elements = getElements(item, assetsById).filter(({ representation }) =>
      mode === 'classic' || representation === 'targetText' || representation === 'targetAudio',
    );
    const itemTargetKey = targetTextKey(item);
    return elements
      .filter(({ contentKey }) => !usedKeys.has(contentKey) && (!itemTargetKey || !usedKeys.has(itemTargetKey)))
      .map((element) => ({ itemId: item.id, ...element }));
  });
  if (!options.length) return;
  const selected = options[Math.floor(random() * options.length)];
  cards.push(makeCard(selected, true, state));
}

export function generateGame(input: GenerateGameInput): GameGenerationResult {
  const random = input.random ?? Math.random;
  const assetsById = new Map(input.assets.map((asset) => [asset.id, asset]));
  const itemsById = new Map(input.items.map((item) => [item.id, item]));
  const modeGroups = input.gameMode === 'classic'
    ? classicGroups(input.items, assetsById)
    : relationshipGroups(input.gameMode, itemsById, assetsById, input.relations);
  const limit = Math.min(20, Math.max(2, Math.floor(input.maxPairs)));
  const selectedPairs = selectPairs(modeGroups, limit, random);

  if (selectedPairs.length < 2) {
    return { status: 'insufficient', cards: [], pairs: [] };
  }

  const initialCardState: CardState = input.gameStyle === 'memory' ? 'hidden' : 'revealed';
  const cards: GeneratedCard[] = [];
  const pairs: GeneratedPair[] = selectedPairs.map((selection) => {
    const [firstCard, secondCard] = selection.cards.map((choice) =>
      makeCard(choice, false, initialCardState, selection.relationId),
    ) as [GeneratedCard, GeneratedCard];
    cards.push(firstCard, secondCard);
    return {
      id: makeId(),
      ...(selection.itemId ? { itemId: selection.itemId } : {}),
      ...(selection.relationId ? { relationId: selection.relationId } : {}),
      cardAId: firstCard.id,
      cardBId: secondCard.id,
    };
  });

  if (input.redHerringEnabled) {
    addRedHerring(cards, selectedPairs, input.items, assetsById, input.gameMode, random, initialCardState);
  }

  return { status: 'ready', cards: shuffle(cards, random), pairs };
}