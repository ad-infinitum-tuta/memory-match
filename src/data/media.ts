import type { MediaAsset } from '../domain/types';

const audioExtensions = new Set(['mp3', 'wav', 'm4a', 'ogg', 'webm']);
const audioMimeTypes = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/mp4',
  'audio/x-m4a',
  'audio/ogg',
  'audio/webm',
]);
const imageExtensions = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic']);
const imageMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

function extensionOf(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() ?? '';
}

export function validateAudioFile(file: Pick<File, 'name' | 'type' | 'size'>): string | undefined {
  const extension = extensionOf(file.name);
  if (!audioExtensions.has(extension) || (file.type && !audioMimeTypes.has(file.type.toLowerCase()))) {
    return 'Choose an MP3, WAV, M4A, OGG, or WebM audio file.';
  }
  if (file.size > 1024 * 1024) return 'Audio files must be 1 MB or smaller.';
  return undefined;
}

export function validateImageFile(file: Pick<File, 'name' | 'type'>): string | undefined {
  const extension = extensionOf(file.name);
  if (!imageExtensions.has(extension) || (file.type && !imageMimeTypes.has(file.type.toLowerCase()))) {
    return 'Choose a JPEG, PNG, WebP, or HEIC image file.';
  }
  return undefined;
}

function createId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function audioDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const cleanup = () => {
      audio.pause();
      audio.removeAttribute('src');
      URL.revokeObjectURL(url);
    };
    audio.preload = 'metadata';
    audio.addEventListener('loadedmetadata', () => {
      const duration = audio.duration;
      cleanup();
      if (!Number.isFinite(duration)) reject(new Error('Could not read the audio duration.'));
      else if (duration > 30) reject(new Error('Audio files must be 30 seconds or shorter.'));
      else resolve(duration);
    }, { once: true });
    audio.addEventListener('error', () => {
      cleanup();
      reject(new Error('Could not read this audio file.'));
    }, { once: true });
    audio.src = url;
  });
}

export async function prepareAudioAsset(file: File, vocabularyItemId: string): Promise<MediaAsset> {
  const validationError = validateAudioFile(file);
  if (validationError) throw new Error(validationError);
  const durationSeconds = await audioDuration(file);
  return {
    id: createId(),
    vocabularyItemId,
    type: 'audio',
    blob: file,
    fileName: file.name,
    mimeType: file.type || `audio/${extensionOf(file.name)}`,
    fileSize: file.size,
    durationSeconds,
    createdAt: new Date().toISOString(),
  };
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function prepareImageAsset(file: File, vocabularyItemId: string): Promise<MediaAsset> {
  const validationError = validateImageFile(file);
  if (validationError) throw new Error(validationError);

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    if (extensionOf(file.name) === 'heic') throw new Error('HEIC is not supported by this browser.');
    throw new Error('This image could not be opened by the browser.');
  }

  try {
    const scale = Math.min(1, 600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image processing is unavailable in this browser.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    let blob = await canvasBlob(canvas, 'image/webp', 0.82);
    if (!blob || blob.type !== 'image/webp') blob = await canvasBlob(canvas, 'image/jpeg', 0.84);
    if (!blob) throw new Error('This image could not be compressed.');

    return {
      id: createId(),
      vocabularyItemId,
      type: 'image',
      blob,
      fileName: file.name,
      mimeType: blob.type,
      fileSize: blob.size,
      width: canvas.width,
      height: canvas.height,
      createdAt: new Date().toISOString(),
    };
  } finally {
    bitmap.close();
  }
}