import { describe, expect, it } from 'vitest';
import { validateMediaAsset } from './vocabulary';

describe('validateMediaAsset', () => {
  it('accepts supported audio by filename when the browser leaves MIME type blank', () => {
    expect(validateMediaAsset({
      type: 'audio',
      fileName: 'voice.M4A',
      mimeType: '',
      fileSize: 1024 * 1024,
      durationSeconds: 30,
    })).toEqual({ valid: true });
  });

  it('rejects audio over the size and duration limits', () => {
    expect(validateMediaAsset({
      type: 'audio',
      fileName: 'voice.mp3',
      mimeType: 'audio/mpeg',
      fileSize: 1024 * 1024 + 1,
      durationSeconds: 10,
    })).toMatchObject({ valid: false, message: 'Audio files must be 1 MB or smaller.' });
    expect(validateMediaAsset({
      type: 'audio',
      fileName: 'voice.ogg',
      mimeType: 'audio/ogg',
      fileSize: 500,
      durationSeconds: 30.1,
    })).toMatchObject({ valid: false, message: 'Audio clips must be 30 seconds or shorter.' });
  });

  it('accepts supported image extensions without MIME metadata', () => {
    expect(validateMediaAsset({
      type: 'image',
      fileName: 'photo.HEIC',
      mimeType: '',
      fileSize: 500,
    })).toEqual({ valid: true });
  });
});