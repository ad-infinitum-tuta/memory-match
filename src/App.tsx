import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, BookOpen, Check, ChevronDown, Download, Pencil, Plus, RotateCcw, Settings2, Smartphone, Trash2, Upload, X } from 'lucide-react';
import { applyBackup, exportBackup, findImportConflicts, parseBackup, type BackupBundle, type ImportConflictChoice } from './data/backup';
import { deleteVocabularyItem, readLibrary, readPreference, relationLabel, saveVocabularyItem, writePreference, type LibrarySnapshot, type RelationDraft } from './data/library';
import { createGameState, gameReducer } from './domain/game';
import { generateGame } from './domain/generator';
import type { GameMode, GameSettings, GameState, GeneratedCard, RelationType, VocabularyItem } from './domain/types';
import GameBoard from './components/GameBoard';
import { prepareAudioAsset, prepareImageAsset, validateAudioFile, validateImageFile } from './data/media';

type FormState = {
  id?: string;
  targetText: string;
  definition: string;
  relations: RelationDraft[];
  audioFile: File | null;
  imageFile: File | null;
  removeAudio: boolean;
  removeImage: boolean;
};

const relationTypes: RelationType[] = ['synonym', 'antonym', 'genericSpecific', 'wholePart'];
const gameModes: GameMode[] = ['classic', ...relationTypes];
const defaultSettings: GameSettings = {
  gameStyle: 'memory',
  gameMode: 'classic',
  maxPairs: 6,
  redHerringEnabled: false,
  soundEffectsEnabled: true,
  animationsEnabled: true,
};

function gameModeLabel(mode: GameMode): string {
  return mode === 'classic' ? 'Classic' : relationLabel(mode);
}

export default function App() {
  const [showLibrary, setShowLibrary] = useState(false);
  const [library, setLibrary] = useState<LibrarySnapshot>({ items: [], relations: [], assets: [] });
  const [settings, setSettings] = useState<GameSettings>(defaultSettings);
  const [game, setGame] = useState<GameState | null>(null);
  const [isInsufficient, setIsInsufficient] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState('');
  const [backupError, setBackupError] = useState('');
  const [pendingImport, setPendingImport] = useState<{ bundle: BackupBundle; conflicts: VocabularyItem[] } | null>(null);
  const [conflictChoices, setConflictChoices] = useState<Record<string, ImportConflictChoice>>({});
  const [isSaving, setIsSaving] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);

  function startGame(snapshot: LibrarySnapshot, nextSettings: GameSettings) {
    const generated = generateGame({
      items: snapshot.items,
      relations: snapshot.relations,
      assets: snapshot.assets,
      gameMode: nextSettings.gameMode,
      gameStyle: nextSettings.gameStyle,
      maxPairs: nextSettings.maxPairs,
      redHerringEnabled: nextSettings.redHerringEnabled,
    });
    setIsInsufficient(generated.status === 'insufficient');
    setGame(generated.status === 'ready' ? createGameState(nextSettings, generated) : null);
  }

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      readLibrary(),
      readPreference('soundEffectsEnabled', defaultSettings.soundEffectsEnabled),
      readPreference('animationsEnabled', defaultSettings.animationsEnabled),
    ]).then(([snapshot, soundEffectsEnabled, animationsEnabled]) => {
      if (cancelled) return;
      const loadedSettings = { ...defaultSettings, soundEffectsEnabled, animationsEnabled };
      setLibrary(snapshot);
      setSettings(loadedSettings);
      startGame(snapshot, loadedSettings);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (game?.isAnimating) {
      const timer = window.setTimeout(() => setGame((current) => current ? gameReducer(current, { type: 'finish-animation' }) : current), settings.animationsEnabled ? 480 : 0);
      return () => window.clearTimeout(timer);
    }
    if (!game?.isLocked || game.selectedCardIds.length !== 2) return;
    const selected = game.cards.filter(({ id }) => game.selectedCardIds.includes(id));
    const mismatch = selected.some(({ state }) => state === 'incorrect');
    if (mismatch) {
      if (game.settings.gameStyle === 'memory' && audioPlaying) return;
      const timeout = game.settings.gameStyle === 'memory' ? 4000 : 1000;
      const timer = window.setTimeout(() => setGame((current) => current ? gameReducer(current, { type: 'resolve-mismatch' }) : current), timeout);
      return () => window.clearTimeout(timer);
    }
    if (game.settings.gameStyle === 'match') {
      const timer = window.setTimeout(() => setGame((current) => current ? gameReducer(current, { type: 'remove-match' }) : current), 420);
      return () => window.clearTimeout(timer);
    }
  }, [game, audioPlaying, settings.animationsEnabled]);

  const onAudioPlaying = useCallback((playing: boolean) => setAudioPlaying(playing), []);

  async function refreshLibrary(): Promise<LibrarySnapshot> {
    const snapshot = await readLibrary();
    setLibrary(snapshot);
    startGame(snapshot, settings);
    return snapshot;
  }

  function updateGameSettings(next: GameSettings) {
    setSettings(next);
    startGame(library, next);
  }

  async function updatePreference(key: 'soundEffectsEnabled' | 'animationsEnabled', value: boolean) {
    const next = { ...settings, [key]: value };
    setSettings(next);
    setGame((current) => current ? { ...current, settings: next } : current);
    try {
      await writePreference(key, value);
    } catch {
      setError('This preference could not be saved in browser storage.');
    }
  }

  function selectCard(card: GeneratedCard) {
    setGame((current) => current ? gameReducer(current, { type: 'select', cardId: card.id }) : current);
  }

  function openNewItem() {
    setError('');
    setForm({ targetText: '', definition: '', relations: [], audioFile: null, imageFile: null, removeAudio: false, removeImage: false });
  }

  function openEditItem(item: VocabularyItem) {
    const relations = library.relations
      .filter(({ itemAId, itemBId }) => itemAId === item.id || itemBId === item.id)
      .map(({ itemAId, itemBId, type }) => ({
        itemId: itemAId === item.id ? itemBId : itemAId,
        type,
      }));
    setError('');
    setForm({ id: item.id, targetText: item.targetText ?? '', definition: item.definition ?? '', relations, audioFile: null, imageFile: null, removeAudio: false, removeImage: false });
  }

  async function saveItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form || isSaving) return;
    setIsSaving(true);
    setError('');
    try {
      const id = form.id ?? crypto.randomUUID();
      const [audioAsset, imageAsset] = await Promise.all([
        form.audioFile ? prepareAudioAsset(form.audioFile, id) : undefined,
        form.imageFile ? prepareImageAsset(form.imageFile, id) : undefined,
      ]);
      await saveVocabularyItem({
        id,
        targetText: form.targetText,
        definition: form.definition,
        audioAsset,
        imageAsset,
        removeAudio: form.removeAudio,
        removeImage: form.removeImage,
      }, form.relations);
      const snapshot = await readLibrary();
      setLibrary(snapshot);
      startGame(snapshot, settings);
      setForm(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save this vocabulary item.');
    } finally {
      setIsSaving(false);
    }
  }

  async function removeItem(itemId: string) {
    await deleteVocabularyItem(itemId);
    await refreshLibrary();
  }

  async function downloadLibrary() {
    setBackupError('');
    try {
      const blob = await exportBackup(library);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'memory-match-backup.zip';
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setBackupError('The library could not be exported.');
    }
  }

  async function selectImportFile(file: File | undefined) {
    if (!file) return;
    setBackupError('');
    try {
      const bundle = await parseBackup(file);
      const conflicts = findImportConflicts(bundle, library.items);
      if (conflicts.length) {
        setConflictChoices({});
        setPendingImport({ bundle, conflicts });
      } else {
        await applyBackup(bundle, {});
        await refreshLibrary();
      }
    } catch (importError) {
      setBackupError(importError instanceof Error ? importError.message : 'The library could not be imported.');
    }
  }

  async function confirmImport() {
    if (!pendingImport || pendingImport.conflicts.some(({ id }) => !conflictChoices[id])) return;
    setBackupError('');
    try {
      await applyBackup(pendingImport.bundle, conflictChoices);
      await refreshLibrary();
      setPendingImport(null);
    } catch (importError) {
      setBackupError(importError instanceof Error ? importError.message : 'The library could not be imported.');
    }
  }

  function relatedItemTitle(itemId: string): string {
    const item = library.items.find(({ id }) => id === itemId);
    return item?.targetText || item?.definition || 'Untitled';
  }

  function attachedMediaName(itemId: string | undefined, type: 'audio' | 'image'): string | undefined {
    const item = itemId ? library.items.find(({ id }) => id === itemId) : undefined;
    const assetId = type === 'audio' ? item?.audioAssetId : item?.imageAssetId;
    return library.assets.find((asset) => asset.id === assetId)?.fileName;
  }

  if (showLibrary) {
    return (
      <main className="library-shell">
        <header className="library-header">
          <button className="back-button" type="button" onClick={() => { setForm(null); setShowLibrary(false); }}>
            <ArrowLeft size={17} /> Game
          </button>
          <div className="library-heading">
            <div className="library-heading-copy"><p className="eyebrow">YOUR WORD COLLECTION</p><h1>Vocabulary</h1></div>
            <div className="library-actions"><button className="icon-button" type="button" aria-label="Export library" title="Export library" onClick={() => void downloadLibrary()}><Download size={17} /></button><button className="icon-button" type="button" aria-label="Import library" title="Import library" onClick={() => importInput.current?.click()}><Upload size={17} /></button><input ref={importInput} className="visually-hidden" type="file" accept=".zip,application/zip" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; void selectImportFile(file); }} /><button className="primary-button" type="button" onClick={openNewItem}><Plus size={17} /> Add word</button></div>
          </div>
          <div className="library-rule"><span>{library.items.length} {library.items.length === 1 ? 'item' : 'items'}</span><i /></div>
        </header>
        {backupError && <p className="backup-error" role="alert">{backupError}</p>}

        {form ? (
          <section className="editor-panel" aria-labelledby="editor-title">
            <div className="editor-heading">
              <div><p className="eyebrow">VOCABULARY ITEM</p><h2 id="editor-title">{form.id ? 'Edit word' : 'Add a word'}</h2></div>
              <button className="icon-button" type="button" aria-label="Close form" onClick={() => setForm(null)}><X size={19} /></button>
            </div>
            <form onSubmit={saveItem}>
              <div className="form-grid">
                <label className="field"><span>Target-language text</span><input autoFocus value={form.targetText} onChange={(event) => setForm({ ...form, targetText: event.target.value })} placeholder="e.g. ventana" /></label>
                <label className="field"><span>Reference-language definition</span><input value={form.definition} onChange={(event) => setForm({ ...form, definition: event.target.value })} placeholder="e.g. window" /></label>
              </div>
              <div className="media-grid">
                <div className="media-field"><span>Target-language audio</span><label className="upload-control"><input type="file" accept=".mp3,.wav,.m4a,.ogg,.webm,audio/*" onChange={(event) => {
                  const file = event.currentTarget.files?.[0] ?? null;
                  event.currentTarget.value = '';
                  if (!file) return;
                  const validationError = validateAudioFile(file);
                  if (validationError) { setError(validationError); return; }
                  setError('');
                  setForm({ ...form, audioFile: file, removeAudio: false });
                }} /><span>{form.audioFile?.name ?? (!form.removeAudio ? attachedMediaName(form.id, 'audio') : undefined) ?? 'Choose audio file'}</span><Plus size={15} /></label>
                  {(form.audioFile || (!form.removeAudio && attachedMediaName(form.id, 'audio'))) && <button className="clear-media" type="button" onClick={() => setForm({ ...form, audioFile: null, removeAudio: true })}><X size={13} /> Remove audio</button>}
                </div>
                <div className="media-field"><span>Image</span><label className="upload-control"><input type="file" accept=".jpg,.jpeg,.png,.webp,.heic,image/*" onChange={(event) => {
                  const file = event.currentTarget.files?.[0] ?? null;
                  event.currentTarget.value = '';
                  if (!file) return;
                  const validationError = validateImageFile(file);
                  if (validationError) { setError(validationError); return; }
                  setError('');
                  setForm({ ...form, imageFile: file, removeImage: false });
                }} /><span>{form.imageFile?.name ?? (!form.removeImage ? attachedMediaName(form.id, 'image') : undefined) ?? 'Choose image file'}</span><Plus size={15} /></label>
                  {(form.imageFile || (!form.removeImage && attachedMediaName(form.id, 'image'))) && <button className="clear-media" type="button" onClick={() => setForm({ ...form, imageFile: null, removeImage: true })}><X size={13} /> Remove image</button>}
                </div>
              </div>
              <div className="relation-section">
                <div className="relation-title"><span>RELATIONSHIPS</span><span className="optional-label">OPTIONAL</span></div>
                {form.relations.map((relation, index) => (
                  <div className="relation-row" key={`${index}-${relation.itemId}`}>
                    <label className="select-field"><span className="visually-hidden">Relationship type</span><select value={relation.type} onChange={(event) => {
                      const relations = [...form.relations];
                      relations[index] = { ...relation, type: event.target.value as RelationType };
                      setForm({ ...form, relations });
                    }}>{relationTypes.map((type) => <option key={type} value={type}>{relationLabel(type)}</option>)}</select><ChevronDown size={14} /></label>
                    <label className="select-field related-select"><span className="visually-hidden">Related vocabulary item</span><select value={relation.itemId} onChange={(event) => {
                      const relations = [...form.relations];
                      relations[index] = { ...relation, itemId: event.target.value };
                      setForm({ ...form, relations });
                    }}><option value="">Choose a word</option>{library.items.filter(({ id }) => id !== form.id).map((item) => <option key={item.id} value={item.id}>{item.targetText || 'Audio item'}{item.definition ? ` · ${item.definition}` : ''}</option>)}</select><ChevronDown size={14} /></label>
                    <button className="remove-relation" type="button" aria-label="Remove relationship" onClick={() => setForm({ ...form, relations: form.relations.filter((_, itemIndex) => itemIndex !== index) })}><X size={16} /></button>
                  </div>
                ))}
                <button className="add-relation" type="button" onClick={() => setForm({ ...form, relations: [...form.relations, { itemId: '', type: 'synonym' }] })}><Plus size={15} /> Add relationship</button>
              </div>
              {error && <p className="form-error" role="alert">{error}</p>}
              <div className="form-actions"><button className="cancel-button" type="button" onClick={() => setForm(null)}>Cancel</button><button className="primary-button" type="submit" disabled={isSaving}><Check size={16} /> {isSaving ? 'Saving...' : 'Save item'}</button></div>
            </form>
          </section>
        ) : library.items.length ? (
          <section className="vocabulary-list" aria-label="Vocabulary items">
            {library.items.map((item) => {
              const related = library.relations.filter(({ itemAId, itemBId }) => itemAId === item.id || itemBId === item.id);
              return (
                <article className="vocabulary-row" key={item.id}>
                  <div className="item-initial" aria-hidden="true">{(item.targetText || item.definition || '?').slice(0, 1).toLocaleUpperCase()}</div>
                  <div className="item-copy"><h2>{item.targetText || 'Audio vocabulary'}</h2><p>{item.definition || 'No definition added'}</p>
                    {related.length > 0 && <div className="relation-tags">{related.map((relation) => <span className="relation-tag" key={relation.id}>{relationLabel(relation.type)} · {relatedItemTitle(relation.itemAId === item.id ? relation.itemBId : relation.itemAId)}</span>)}</div>}
                  </div>
                  <div className="item-actions"><span className="relation-count">{related.length} rel.</span><button className="icon-button" type="button" aria-label={`Edit ${item.targetText || 'vocabulary item'}`} onClick={() => openEditItem(item)}><Pencil size={16} /></button><button className="icon-button delete-button" type="button" aria-label={`Delete ${item.targetText || 'vocabulary item'}`} onClick={() => void removeItem(item.id)}><Trash2 size={16} /></button></div>
                </article>
              );
            })}
          </section>
        ) : (
          <section className="library-empty">
            <div className="library-empty-icon"><BookOpen size={23} /></div><p className="eyebrow">A LIBRARY OF YOUR OWN</p><h2>Nothing collected yet</h2>
            <p>Add a word and its meaning to begin building your vocabulary.</p><button className="primary-button" type="button" onClick={openNewItem}><Plus size={17} /> Add your first word</button>
          </section>
        )}
        {pendingImport && <div className="dialog-scrim"><section className="conflict-dialog" role="dialog" aria-modal="true" aria-labelledby="conflict-title"><div className="editor-heading"><div><p className="eyebrow">IMPORT OPTIONS</p><h2 id="conflict-title">Matching item IDs</h2></div><button className="icon-button" type="button" aria-label="Cancel import" onClick={() => setPendingImport(null)}><X size={18} /></button></div><p className="conflict-intro">Choose how to handle each vocabulary item that differs from an item already in this library.</p><div className="conflict-list">{pendingImport.conflicts.map((item) => <fieldset className="conflict-item" key={item.id}><legend>{item.targetText || item.definition || item.id}<span>{item.definition && item.targetText ? ` · ${item.definition}` : ''}</span></legend><div className="choice-row">{([['existing', 'Keep existing'], ['imported', 'Keep imported'], ['both', 'Keep both']] as const).map(([choice, label]) => <label key={choice} className={conflictChoices[item.id] === choice ? 'choice-selected' : ''}><input type="radio" name={`conflict-${item.id}`} checked={conflictChoices[item.id] === choice} onChange={() => setConflictChoices({ ...conflictChoices, [item.id]: choice })} />{label}</label>)}</div></fieldset>)}</div>{backupError && <p className="form-error" role="alert">{backupError}</p>}<div className="form-actions"><button className="cancel-button" type="button" onClick={() => setPendingImport(null)}>Cancel</button><button className="primary-button" type="button" disabled={pendingImport.conflicts.some(({ id }) => !conflictChoices[id])} onClick={() => void confirmImport()}><Upload size={15} /> Import library</button></div></section></div>}
      </main>
    );
  }

  return (
    <main className="app-shell">
      <div className="rotate-prompt" role="status"><Smartphone size={25} /><span>Turn your device sideways to play</span></div>
      <header className="topbar"><a className="wordmark" href="#" aria-label="Memory Match home"><span className="wordmark-mark" aria-hidden="true">M</span><span>Memory Match</span></a><div className="topbar-actions"><button className="icon-button" type="button" aria-label="Vocabulary library" title="Vocabulary library" onClick={() => setShowLibrary(true)}><BookOpen size={19} strokeWidth={1.8} /></button></div></header>
      <section className="game-area" aria-labelledby="game-title">
        <div className="game-heading"><div><p className="eyebrow">A little practice, every day</p><h1 id="game-title">{gameModeLabel(settings.gameMode)}</h1></div><div className="game-stats" aria-label="Game status"><div className="stat"><span className="stat-label">Style</span><strong>{settings.gameStyle === 'memory' ? 'Memory' : 'Match'}</strong></div><div className="stat"><span className="stat-label">{settings.gameStyle === 'memory' ? 'Turns' : 'Score'}</span><strong>{settings.gameStyle === 'memory' ? game?.turnCount ?? 0 : game?.score ?? 0}</strong></div></div></div>
        <div className="board-frame"><div className="board-toolbar"><span className="board-label">PLAYFIELD <span className="board-dot" /></span><div className="board-controls"><button className="icon-button" type="button" aria-label="Settings" aria-expanded={settingsOpen} title="Settings" onClick={() => setSettingsOpen(!settingsOpen)}><Settings2 size={18} /></button>{game && game.selectionCount >= 2 && <button className="icon-button" type="button" aria-label="Restart game" title="Restart game" onClick={() => startGame(library, settings)}><RotateCcw size={17} /></button>}</div></div>
          {settingsOpen && <section className="settings-panel" aria-label="Game settings">
            <div className="settings-grid">
              <fieldset className="setting-group"><legend>STYLE</legend><div className="segmented-control"><button type="button" className={settings.gameStyle === 'memory' ? 'active' : ''} onClick={() => updateGameSettings({ ...settings, gameStyle: 'memory' })}>Memory</button><button type="button" className={settings.gameStyle === 'match' ? 'active' : ''} onClick={() => updateGameSettings({ ...settings, gameStyle: 'match' })}>Match</button></div></fieldset>
              <label className="setting-group"><span>MODE</span><span className="select-field"><select value={settings.gameMode} onChange={(event) => updateGameSettings({ ...settings, gameMode: event.target.value as GameMode })}>{gameModes.map((mode) => <option key={mode} value={mode}>{gameModeLabel(mode)}</option>)}</select><ChevronDown size={14} /></span></label>
              <label className="setting-group"><span>MAX PAIRS</span><input className="pairs-input" type="number" min={2} max={20} step={1} value={settings.maxPairs} onChange={(event) => { const value = Number(event.target.value); if (Number.isInteger(value) && value >= 2 && value <= 20) updateGameSettings({ ...settings, maxPairs: value }); }} /></label>
              <label className="setting-toggle"><input type="checkbox" checked={settings.redHerringEnabled} onChange={(event) => updateGameSettings({ ...settings, redHerringEnabled: event.target.checked })} /><span>Red herring</span></label>
            </div>
            <div className="settings-bottom"><label className="setting-toggle"><input type="checkbox" checked={settings.soundEffectsEnabled} onChange={(event) => void updatePreference('soundEffectsEnabled', event.target.checked)} /><span>Sound effects</span></label><label className="setting-toggle"><input type="checkbox" checked={settings.animationsEnabled} onChange={(event) => void updatePreference('animationsEnabled', event.target.checked)} /><span>Animations</span></label><button className="settings-vocabulary" type="button" onClick={() => { setShowLibrary(true); setSettingsOpen(false); }}><BookOpen size={15} /> Vocabulary</button></div>
            {error && <p className="form-error" role="alert">{error}</p>}
          </section>}
          {game?.isComplete && <div className="completion-banner"><div><p className="eyebrow">ROUND COMPLETE</p><strong>{settings.gameStyle === 'memory' ? `${game.turnCount} turns` : `Final score ${game.score}`}</strong></div><button className="primary-button" type="button" onClick={() => startGame(library, settings)}><RotateCcw size={16} /> Play again</button></div>}
          {game ? <GameBoard cards={game.cards} items={library.items} assets={library.assets} gameStyle={settings.gameStyle} animationsEnabled={settings.animationsEnabled} isLocked={game.isLocked} onSelect={selectCard} onAudioPlaying={onAudioPlaying} /> : <div className="insufficient-state"><div className="empty-mark" aria-hidden="true"><span className="sample-card sample-card-back">?</span><span className="sample-card sample-card-front">+</span></div><p className="empty-kicker">{isInsufficient ? 'A few more words needed' : 'Preparing your board'}</p><h2>{isInsufficient ? `${gameModeLabel(settings.gameMode)} needs two valid pairs` : 'Getting things ready'}</h2><p className="empty-copy">Add words or relationships that can make pairs in this mode.</p><button className="primary-button" type="button" onClick={() => setShowLibrary(true)}><BookOpen size={17} /> Add vocabulary</button></div>}
        </div>
        <footer className="game-footer"><span>LOCAL LIBRARY <i /></span><span>Nothing leaves this browser</span></footer>
      </section>
    </main>
  );
}