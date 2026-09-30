// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from './App';
import { database } from './data/database';

beforeEach(async () => {
  cleanup();
  await database.delete();
  await database.open();
});

afterEach(() => cleanup());

describe('Vocabulary and play UI', () => {
  it('adds, edits, and deletes a local vocabulary item', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Vocabulary library' }));
    await user.click(await screen.findByRole('button', { name: 'Add your first word' }));
    await user.type(screen.getByLabelText('Target-language text'), 'ventana');
    await user.type(screen.getByLabelText('Reference-language definition'), 'window');
    await user.click(screen.getByRole('button', { name: 'Save item' }));
    await screen.findByRole('heading', { name: 'ventana' });

    await user.click(screen.getByRole('button', { name: 'Edit ventana' }));
    const targetField = screen.getByLabelText('Target-language text');
    await user.clear(targetField);
    await user.type(targetField, 'puerta');
    await user.click(screen.getByRole('button', { name: 'Save item' }));
    await screen.findByRole('heading', { name: 'puerta' });

    await user.click(screen.getByRole('button', { name: 'Delete puerta' }));
    await screen.findByRole('heading', { name: 'Nothing collected yet' });
  });

  it('saves lexical relations and starts a successful Match pair', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Vocabulary library' }));
    await user.click(await screen.findByRole('button', { name: 'Add your first word' }));
    await user.type(screen.getByLabelText('Target-language text'), 'ventana');
    await user.type(screen.getByLabelText('Reference-language definition'), 'window');
    await user.click(screen.getByRole('button', { name: 'Save item' }));
    await screen.findByRole('heading', { name: 'ventana' });

    await user.click(screen.getByRole('button', { name: 'Add word' }));
    await user.type(screen.getByLabelText('Target-language text'), 'puerta');
    await user.type(screen.getByLabelText('Reference-language definition'), 'door');
    await user.click(screen.getByRole('button', { name: 'Add relationship' }));
    const relatedItem = screen.getByLabelText('Related vocabulary item') as HTMLSelectElement;
    await user.selectOptions(relatedItem, relatedItem.options[1].value);
    await user.click(screen.getByRole('button', { name: 'Save item' }));
    await screen.findByText(/Synonym · ventana/);

    await user.click(screen.getByRole('button', { name: 'Game' }));
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(screen.getByRole('button', { name: 'Match' }));
    await user.click(screen.getByRole('button', { name: 'ventana' }));
    await user.click(screen.getByRole('button', { name: 'window' }));

    await waitFor(() => expect(screen.getByText('Score').parentElement?.textContent).toContain('1'));
    expect(screen.getByRole('button', { name: 'Restart game' })).toBeTruthy();
  });

  it('retains invalid form values and reports vocabulary validation errors', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Vocabulary library' }));
    await user.click(await screen.findByRole('button', { name: 'Add your first word' }));
    await user.type(screen.getByLabelText('Target-language text'), 'hola');
    await user.click(screen.getByRole('button', { name: 'Save item' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Add at least two vocabulary elements.');
    expect((screen.getByLabelText('Target-language text') as HTMLInputElement).value).toBe('hola');
    expect(screen.queryByRole('heading', { name: 'hola' })).toBeNull();
  });
});