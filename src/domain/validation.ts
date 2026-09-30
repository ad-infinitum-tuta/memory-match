import type { LexicalRelation, RelationType, VocabularyItem } from './types';

export function normalizeText(value: string): string {
  return value.trim().replace(/\s+/gu, ' ').toLowerCase();
}

export function getVocabularyItemErrors(item: Partial<VocabularyItem>): string[] {
  const hasTargetText = Boolean(item.targetText?.trim());
  const hasAudio = Boolean(item.audioAssetId);
  const elementCount = [
    hasTargetText,
    hasAudio,
    Boolean(item.definition?.trim()),
    Boolean(item.imageAssetId),
  ].filter(Boolean).length;
  const errors: string[] = [];

  if (!hasTargetText && !hasAudio) {
    errors.push('Add target-language text or audio.');
  }
  if (elementCount < 2) {
    errors.push('Add at least two vocabulary elements.');
  }

  return errors;
}

export function findDuplicateVocabularyItemId(
  candidate: VocabularyItem,
  existingItems: ReadonlyArray<VocabularyItem>,
  assets: ReadonlyArray<Pick<import('./types').MediaAsset, 'id' | 'type' | 'fileName'>>,
): string | undefined {
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const signature = (item: VocabularyItem) => ({
    targetText: item.targetText ? normalizeText(item.targetText) : '',
    definition: item.definition ? normalizeText(item.definition) : '',
    audioFileName: item.audioAssetId ? assetsById.get(item.audioAssetId)?.fileName ?? '' : '',
    imageFileName: item.imageAssetId ? assetsById.get(item.imageAssetId)?.fileName ?? '' : '',
  });
  const candidateSignature = signature(candidate);

  return existingItems.find((item) => {
    if (item.id === candidate.id) return false;
    const existingSignature = signature(item);
    return Object.keys(candidateSignature).every((key) =>
      candidateSignature[key as keyof typeof candidateSignature] === existingSignature[key as keyof typeof existingSignature],
    ) && Object.values(candidateSignature).some(Boolean);
  })?.id;
}

export function canonicalRelationKey(
  itemAId: string,
  itemBId: string,
  type: RelationType,
): string {
  const [firstId, secondId] = [itemAId, itemBId].sort();
  return `${type}:${firstId}:${secondId}`;
}

export function getRelationError(
  relation: Pick<LexicalRelation, 'itemAId' | 'itemBId' | 'type'>,
  items: ReadonlyArray<Pick<VocabularyItem, 'id'>>,
  existingRelations: ReadonlyArray<Pick<LexicalRelation, 'itemAId' | 'itemBId' | 'type'>> = [],
  ignoreRelationKey?: string,
): string | undefined {
  if (relation.itemAId === relation.itemBId) {
    return 'A vocabulary item cannot relate to itself.';
  }

  const itemIds = new Set(items.map((item) => item.id));
  if (!itemIds.has(relation.itemAId) || !itemIds.has(relation.itemBId)) {
    return 'Both related vocabulary items must exist.';
  }

  const key = canonicalRelationKey(relation.itemAId, relation.itemBId, relation.type);
  if (existingRelations.some((existing) =>
    canonicalRelationKey(existing.itemAId, existing.itemBId, existing.type) === key && key !== ignoreRelationKey,
  )) {
    return 'This relationship already exists.';
  }

  return undefined;
}