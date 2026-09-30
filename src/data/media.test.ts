import { describe, expect, it } from 'vitest';
import { validateAudioFile, validateImageFile } from './media';

describe('media file validation', () => {
  it('accepts supported audio extensions and rejects unsupported formats', () => {
    expect(validateAudioFile({ name: 'voice.MP3', type: 'audio/mpeg', size: 1024 })).toBeUndefined();
    expect(validateAudioFile({ name: 'voice.aac', type: 'audio/aac', size: 1024 })).toContain('Choose an MP3');
  });

  it('enforces the 1 MB audio size limit', () => {
    expect(validateAudioFile({ name: 'voice.wav', type: 'audio/wav', size: 1024 * 1024 })).toBeUndefined();
    expect(validateAudioFile({ name: 'voice.wav', type: 'audio/wav', size: 1024 * 1024 + 1 })).toContain('1 MB');
  });

  it('accepts supported image formats only', () => {
    expect(validateImageFile({ name: 'picture.HEIC', type: 'image/heic' })).toBeUndefined();
    expect(validateImageFile({ name: 'picture.gif', type: 'image/gif' })).toContain('JPEG, PNG, WebP, or HEIC');
  });
});