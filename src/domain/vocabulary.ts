import type { LexicalRelation, MediaAsset, VocabularyItem } from './types';

export type ValidationResult = { valid: true } | { valid: false; message: string };

export function validateVocabularyItem(item: Pick<VocabularyItem, 'targetText' | 'definition' | 'audioAssetId' | 'imageAssetId'>): ValidationResult {
  const hasTarget = Boolean(item.targetText?.trim() || item.audioAssetId);
  const fieldCount = [item.targetText, item.definition, item.audioAssetId, item.imageAssetId]
    .filter((field) => typeof field === 'string' ? Boolean(field.trim()) : Boolean(field))
    .length;

  if (!hasTarget) return { valid: false, message: 'Add target-language text or audio.' };
  if (fieldCount < 2) return { valid: false, message: 'Add at least two vocabulary elements.' };
  return { valid: true };
}

export function validateRelation(
  relation: Pick<LexicalRelation, 'itemAId' | 'itemBId' | 'type'>,
  existing: LexicalRelation[],
  ignoredId?: string,
): ValidationResult {
  if (relation.itemAId === relation.itemBId) {
    return { valid: false, message: 'A vocabulary item cannot relate to itself.' };
  }

  const duplicate = existing.some((candidate) => candidate.id !== ignoredId
    && candidate.type === relation.type
    && ((candidate.itemAId === relation.itemAId && candidate.itemBId === relation.itemBId)
      || (candidate.itemAId === relation.itemBId && candidate.itemBId === relation.itemAId)));

  if (duplicate) return { valid: false, message: 'This relationship already exists.' };
  return { valid: true };
}

export function validateMediaAsset(asset: Pick<MediaAsset, 'type' | 'fileName' | 'mimeType' | 'fileSize' | 'durationSeconds'>): ValidationResult {
  if (asset.type === 'audio') {
    const extensions = /\.(mp3|wav|m4a|ogg|webm)$/i;
    const mimeTypes = /^(audio\/(mpeg|mp3|wav|x-wav|mp4|x-m4a|ogg|webm)|video\/webm)$/i;
    if (!extensions.test(asset.fileName) || (asset.mimeType && !mimeTypes.test(asset.mimeType))) {
      return { valid: false, message: 'Choose an MP3, WAV, M4A, OGG, or WebM audio file.' };
    }
    if (asset.fileSize > 1024 * 1024) return { valid: false, message: 'Audio files must be 1 MB or smaller.' };
    if (asset.durationSeconds !== undefined && asset.durationSeconds > 30) {
      return { valid: false, message: 'Audio clips must be 30 seconds or shorter.' };
    }
    return { valid: true };
  }

  const imageExtensions = /\.(jpe?g|png|webp|heic)$/i;
  const imageMimeTypes = /^(image\/(jpeg|png|webp|heic))$/i;
  if (!imageExtensions.test(asset.fileName) || (asset.mimeType && !imageMimeTypes.test(asset.mimeType))) {
    return { valid: false, message: 'Choose a JPEG, PNG, WebP, or HEIC image.' };
  }
  return { valid: true };
}