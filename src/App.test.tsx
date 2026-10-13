// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { libraryDatabase } from './data/database';
import { saveLibraryItem } from './data/library';
import type { VocabularyItem } from './domain/types';

async function clearLibrary() {
  await libraryDatabase.transaction('rw', libraryDatabase.items, libraryDatabase.relations, libraryDatabase.assets, async () => {
    await Promise.all([
      libraryDatabase.items.clear(),
      libraryDatabase.relations.clear(),
      libraryDatabase.assets.clear(),
    ]);
  });
}

beforeEach(clearLibrary);
afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  await clearLibrary();
});

describe('app vocabulary workflow', () => {
  it('creates vocabulary, starts a game, and restores the library after remount', async () => {
    const user = userEvent.setup();
    const firstRender = render(<App />);
    await screen.findByText('Not enough pairs yet');
    await user.click(screen.getByRole('button', { name: 'Add vocabulary' }));

    await user.type(screen.getByLabelText('Target-language text'), 'gato');
    await user.type(screen.getByLabelText('Definition'), 'cat');
    await user.click(screen.getByRole('button', { name: 'Save item' }));
    await screen.findByText('gato', { selector: 'strong' });

    await user.click(screen.getByRole('button', { name: 'Add word' }));
    await user.type(screen.getByLabelText('Target-language text'), 'perro');
    await user.type(screen.getByLabelText('Definition'), 'dog');
    await user.click(screen.getByRole('button', { name: 'Save item' }));
    await screen.findByText('perro', { selector: 'strong' });
    await user.click(screen.getByRole('button', { name: 'Back to game' }));
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Reveal card' })).toHaveLength(4));

    firstRender.unmount();
    render(<App />);
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Reveal card' })).toHaveLength(4));
  });

  it('scores correct and incorrect Match selections', async () => {
    const items: VocabularyItem[] = [
      { id: 'cat', targetText: 'gato', definition: 'cat', createdAt: '', updatedAt: '' },
      { id: 'dog', targetText: 'perro', definition: 'dog', createdAt: '', updatedAt: '' },
      { id: 'moon', targetText: 'luna', definition: 'moon', createdAt: '', updatedAt: '' },
    ];
    for (const item of items) await saveLibraryItem(item, [], [], libraryDatabase);
    const user = userEvent.setup();
    render(<App />);
    await screen.findAllByRole('button', { name: 'Reveal card' });
    await user.click(screen.getByRole('button', { name: 'Game settings' }));
    await user.click(screen.getByRole('button', { name: 'Match' }));
    await user.click(screen.getByRole('button', { name: 'Close settings' }));

    await user.click(screen.getByRole('button', { name: 'Spanish: gato' }));
    await user.click(screen.getByRole('button', { name: 'Meaning: cat' }));
    await waitFor(() => expect(screen.getByText('Score:').parentElement?.textContent).toContain('1'));

    await user.click(screen.getByRole('button', { name: 'Spanish: perro' }));
    await user.click(screen.getByRole('button', { name: 'Meaning: moon' }));
    await waitFor(() => expect(screen.getByText('Score:').parentElement?.textContent).toContain('0'));
  });

  it('deselects a selected card in Match style', async () => {
    const items: VocabularyItem[] = [
      { id: 'cat', targetText: 'gato', definition: 'cat', createdAt: '', updatedAt: '' },
      { id: 'dog', targetText: 'perro', definition: 'dog', createdAt: '', updatedAt: '' },
    ];
    for (const item of items) await saveLibraryItem(item, [], [], libraryDatabase);
    const user = userEvent.setup();
    render(<App />);
    await screen.findAllByRole('button', { name: 'Reveal card' });
    await user.click(screen.getByRole('button', { name: 'Game settings' }));
    await user.click(screen.getByRole('button', { name: 'Match' }));
    await user.click(screen.getByRole('button', { name: 'Close settings' }));

    const spanishCard = screen.getByRole('button', { name: 'Spanish: gato' });
    await user.click(spanishCard);
    expect(spanishCard.getAttribute('aria-pressed')).toBe('true');
    await user.click(spanishCard);
    expect(spanishCard.getAttribute('aria-pressed')).toBe('false');
  });

  it('keeps matched audio cards playable', async () => {
    const audioItem: VocabularyItem = {
      id: 'cat',
      definition: 'cat',
      audioAssetId: 'cat-audio',
      createdAt: '',
      updatedAt: '',
    };
    const textItem: VocabularyItem = {
      id: 'dog',
      targetText: 'perro',
      definition: 'dog',
      createdAt: '',
      updatedAt: '',
    };
    const audioAsset = {
      id: 'cat-audio',
      vocabularyItemId: audioItem.id,
      type: 'audio' as const,
      blob: new Blob(['audio-data'], { type: 'audio/mpeg' }),
      fileName: 'cat.mp3',
      mimeType: 'audio/mpeg',
      fileSize: 10,
      createdAt: '',
    };
    await saveLibraryItem(audioItem, [], [audioAsset], libraryDatabase);
    await saveLibraryItem(textItem, [], [], libraryDatabase);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:cat-audio');
    const playAudio = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    const user = userEvent.setup();
    const { container } = render(<App />);
    await screen.findAllByRole('button', { name: 'Reveal card' });

    const audioCard = await waitFor(() => {
      const card = container.querySelector('audio')?.closest('.card-wrap')?.querySelector('.memory-card');
      if (!(card instanceof HTMLButtonElement)) throw new Error('Audio card is not rendered yet.');
      return card;
    });
    await user.click(audioCard as HTMLButtonElement);
    const replayButton = await screen.findByRole('button', { name: 'Replay audio' });
    expect(replayButton.querySelector('svg')).not.toBeNull();
    await user.click(screen.getByText('cat').closest('.memory-card') as HTMLButtonElement);

    expect(audioCard.classList.contains('is-matched')).toBe(true);
    await waitFor(() => expect(replayButton.isConnected).toBe(true));
    await user.click(replayButton);
    expect(playAudio).toHaveBeenCalledTimes(2);
  });

  it('shows the replay icon when an audio card is selected second in Memory style', async () => {
    const audioItem: VocabularyItem = {
      id: 'cat',
      definition: 'cat',
      audioAssetId: 'cat-audio',
      createdAt: '',
      updatedAt: '',
    };
    const otherItem: VocabularyItem = {
      id: 'dog',
      targetText: 'perro',
      definition: 'dog',
      createdAt: '',
      updatedAt: '',
    };
    const audioAsset = {
      id: 'cat-audio',
      vocabularyItemId: audioItem.id,
      type: 'audio' as const,
      blob: new Blob(['audio-data'], { type: 'audio/mpeg' }),
      fileName: 'cat.mp3',
      mimeType: 'audio/mpeg',
      fileSize: 10,
      createdAt: '',
    };
    await saveLibraryItem(audioItem, [], [audioAsset], libraryDatabase);
    await saveLibraryItem(otherItem, [], [], libraryDatabase);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:cat-audio');
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    const user = userEvent.setup();
    const { container } = render(<App />);
    await screen.findAllByRole('button', { name: 'Reveal card' });

    const audioCard = await waitFor(() => {
      const card = container.querySelector('audio')?.closest('.card-wrap')?.querySelector('.memory-card');
      if (!(card instanceof HTMLButtonElement)) throw new Error('Audio card is not rendered yet.');
      return card;
    });
    await user.click(screen.getByText('dog').closest('.memory-card') as HTMLButtonElement);
    await user.click(audioCard as HTMLButtonElement);

    expect(audioCard.classList.contains('is-incorrect')).toBe(true);
    expect(audioCard.closest('.card-wrap')?.querySelector('.audio-replay svg')).not.toBeNull();
  });

  it('animates an incorrect Memory selection and flips both cards back after two seconds', async () => {
    const items: VocabularyItem[] = [
      { id: 'cat', targetText: 'gato', definition: 'cat', createdAt: '', updatedAt: '' },
      { id: 'dog', targetText: 'perro', definition: 'dog', createdAt: '', updatedAt: '' },
    ];
    for (const item of items) await saveLibraryItem(item, [], [], libraryDatabase);
    render(<App />);
    await screen.findAllByRole('button', { name: 'Reveal card' });
    const user = userEvent.setup();

    const cardFor = (text: string) => screen.getByText(text).closest('.memory-card') as HTMLButtonElement;
    await user.click(cardFor('gato'));
    await user.click(cardFor('dog'));
    expect(cardFor('gato').classList.contains('is-incorrect')).toBe(true);
    expect(cardFor('dog').classList.contains('is-incorrect')).toBe(true);

    await new Promise((resolve) => window.setTimeout(resolve, 1900));
    expect(cardFor('gato').classList.contains('is-revealed')).toBe(true);
    await new Promise((resolve) => window.setTimeout(resolve, 200));
    expect(cardFor('gato').classList.contains('is-revealed')).toBe(false);
    expect(cardFor('dog').classList.contains('is-revealed')).toBe(false);
  }, 10_000);
});