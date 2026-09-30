// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareAudioAsset } from './media';

function mockAudio(duration: number) {
  class AudioMetadataMock {
    duration = duration;
    preload = '';
    private listeners = new Map<string, EventListener>();

    addEventListener(type: string, listener: EventListener) {
      this.listeners.set(type, listener);
    }

    pause() {}
    removeAttribute() {}

    set src(_url: string) {
      queueMicrotask(() => this.listeners.get('loadedmetadata')?.(new Event('loadedmetadata')));
    }
  }
  vi.stubGlobal('Audio', AudioMetadataMock);
}

afterEach(() => vi.unstubAllGlobals());

describe('audio duration validation', () => {
  it('accepts clips up to 30 seconds', async () => {
    mockAudio(30);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:audio');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const file = new File(['audio'], 'voice.mp3', { type: 'audio/mpeg' });
    const asset = await prepareAudioAsset(file, 'item-1');
    expect(asset.durationSeconds).toBe(30);
  });

  it('rejects clips longer than 30 seconds', async () => {
    mockAudio(30.01);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:audio');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const file = new File(['audio'], 'voice.mp3', { type: 'audio/mpeg' });
    await expect(prepareAudioAsset(file, 'item-1')).rejects.toThrow('30 seconds or shorter');
  });
});