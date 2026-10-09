export type ProcessedImage = {
  blob: Blob;
  mimeType: 'image/webp' | 'image/jpeg';
  width: number;
  height: number;
};

export function readAudioDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const cleanup = () => {
      audio.removeAttribute('src');
      URL.revokeObjectURL(url);
    };
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      const duration = audio.duration;
      cleanup();
      if (!Number.isFinite(duration)) reject(new Error('Could not read audio duration.'));
      else resolve(duration);
    };
    audio.onerror = () => {
      cleanup();
      reject(new Error('Could not read audio duration.'));
    };
    audio.src = url;
  });
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function processImage(file: File): Promise<ProcessedImage> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    if (/\.heic$/i.test(file.name) || file.type === 'image/heic') {
      throw new Error('HEIC is not supported by this browser.');
    }
    throw new Error('This image could not be opened by the browser.');
  }

  const scale = Math.min(1, 600 / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    throw new Error('Image processing is unavailable in this browser.');
  }
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const webp = await canvasBlob(canvas, 'image/webp', 0.84);
  if (webp?.type === 'image/webp') return { blob: webp, mimeType: 'image/webp', width, height };

  const jpeg = await canvasBlob(canvas, 'image/jpeg', 0.86);
  if (!jpeg) throw new Error('This image could not be compressed.');
  return { blob: jpeg, mimeType: 'image/jpeg', width, height };
}