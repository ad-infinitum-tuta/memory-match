// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
});