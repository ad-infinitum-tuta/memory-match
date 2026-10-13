import { useState } from 'react';
import { ArrowLeft, Link2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { deleteLibraryItem, getLibrary, LibraryValidationError, saveLibraryItem, type LibrarySnapshot } from '../../data/library';
import { validateMediaAsset, validateVocabularyItem } from '../../domain/vocabulary';
import type { LexicalRelation, MediaAsset, RelationType, VocabularyItem } from '../../domain/types';
import { applyImport, exportLibraryZip, findImportConflicts, parseImportArchive, type ConflictChoice, type ImportBundle, type ImportConflicts } from '../transfer/archive';
import { processImage, readAudioDuration } from './media';

type RelationDraft = {
  id?: string;
  type: RelationType;
  relatedItemId: string;
};

type Props = {
  library: LibrarySnapshot;
  onLibraryChange: (library: LibrarySnapshot) => void;
  onClose: () => void;
};

const RELATION_LABELS: Record<RelationType, string> = {
  synonym: 'Synonym',
  antonym: 'Antonym',
  genericSpecific: 'Generic / Specific',
  wholePart: 'Whole / Part',
};

const EMPTY_FORM = { targetText: '', definition: '' };

function itemLabel(item: VocabularyItem): string {
  return [item.targetText, item.definition].filter(Boolean).join(' · ');
}

export default function VocabularyView({ library, onLibraryChange, onClose }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [relationDrafts, setRelationDrafts] = useState<RelationDraft[]>([]);
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([]);
  const [draftId, setDraftId] = useState(() => crypto.randomUUID());
  const [pendingImport, setPendingImport] = useState<{ bundle: ImportBundle; conflicts: ImportConflicts; choices: Record<string, ConflictChoice> } | null>(null);
  const [transferMessage, setTransferMessage] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const resetForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setRelationDrafts([]);
    setMediaAssets([]);
    setDraftId(crypto.randomUUID());
    setError('');
  };

  const startEdit = (item: VocabularyItem) => {
    setEditingId(item.id);
    setForm({ targetText: item.targetText ?? '', definition: item.definition ?? '' });
    setRelationDrafts(library.relations
      .filter((relation) => relation.itemAId === item.id || relation.itemBId === item.id)
      .map((relation) => ({
        id: relation.id,
        type: relation.type,
        relatedItemId: relation.itemAId === item.id ? relation.itemBId : relation.itemAId,
      })));
    setMediaAssets(library.assets.filter((asset) => asset.vocabularyItemId === item.id));
    setError('');
  };

  const addAudioFile = async (file?: File) => {
    if (!file) {
      console.log('[VocabularyView] Audio file processing skipped: no file received.');
      return;
    }
    console.log('[VocabularyView] Audio file processing started.', { name: file.name, type: file.type, size: file.size });
    setError('');
    const preliminary = validateMediaAsset({ type: 'audio', fileName: file.name, mimeType: file.type, fileSize: file.size });
    if (!preliminary.valid) {
      console.log('[VocabularyView] Audio file rejected during preliminary validation.', { name: file.name, message: preliminary.message });
      setError(preliminary.message);
      return;
    }
    try {
      const durationSeconds = await readAudioDuration(file);
      const validation = validateMediaAsset({ type: 'audio', fileName: file.name, mimeType: file.type, fileSize: file.size, durationSeconds });
      if (!validation.valid) throw new Error(validation.message);
      const asset: MediaAsset = {
        id: crypto.randomUUID(),
        vocabularyItemId: editingId ?? draftId,
        type: 'audio',
        blob: file,
        fileName: file.name,
        mimeType: file.type,
        fileSize: file.size,
        durationSeconds,
        createdAt: new Date().toISOString(),
      };
      setMediaAssets((current) => [...current.filter(({ type }) => type !== 'audio'), asset]);
      console.log('[VocabularyView] Audio file processed and added to form state.', { name: asset.fileName, durationSeconds: asset.durationSeconds });
    } catch (cause) {
      console.error('[VocabularyView] Audio file processing failed.', { name: file.name, cause });
      setError(cause instanceof Error ? cause.message : 'This audio file could not be processed.');
    }
  };

  const addImageFile = async (file?: File) => {
    if (!file) {
      console.log('[VocabularyView] Image file processing skipped: no file received.');
      return;
    }
    console.log('[VocabularyView] Image file processing started.', { name: file.name, type: file.type, size: file.size });
    setError('');
    const validation = validateMediaAsset({ type: 'image', fileName: file.name, mimeType: file.type, fileSize: file.size });
    if (!validation.valid) {
      console.log('[VocabularyView] Image file rejected during validation.', { name: file.name, message: validation.message });
      setError(validation.message);
      return;
    }
    try {
      const processed = await processImage(file);
      const asset: MediaAsset = {
        id: crypto.randomUUID(),
        vocabularyItemId: editingId ?? draftId,
        type: 'image',
        blob: processed.blob,
        fileName: file.name,
        mimeType: processed.mimeType,
        fileSize: processed.blob.size,
        width: processed.width,
        height: processed.height,
        createdAt: new Date().toISOString(),
      };
      setMediaAssets((current) => [...current.filter(({ type }) => type !== 'image'), asset]);
      console.log('[VocabularyView] Image file processed and added to form state.', { name: asset.fileName, type: asset.mimeType, size: asset.fileSize });
    } catch (cause) {
      console.error('[VocabularyView] Image file processing failed.', { name: file.name, cause });
      setError(cause instanceof Error ? cause.message : 'This image could not be processed.');
    }
  };

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    const id = editingId ?? draftId;
    const existing = library.items.find((item) => item.id === id);
    const now = new Date().toISOString();
    const audioAsset = mediaAssets.find(({ type }) => type === 'audio');
    const imageAsset = mediaAssets.find(({ type }) => type === 'image');
    const item: VocabularyItem = {
      id,
      targetText: form.targetText.trim() || undefined,
      definition: form.definition.trim() || undefined,
      audioAssetId: audioAsset?.id,
      imageAssetId: imageAsset?.id,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const itemValidation = validateVocabularyItem(item);
    if (!itemValidation.valid) {
      setError(itemValidation.message);
      return;
    }

    const relations: LexicalRelation[] = relationDrafts
      .filter(({ relatedItemId }) => Boolean(relatedItemId))
      .map((draft) => ({
        id: draft.id ?? crypto.randomUUID(),
        itemAId: id,
        itemBId: draft.relatedItemId,
        type: draft.type,
        createdAt: now,
      }));

    setIsSaving(true);
    try {
      await saveLibraryItem(item, relations, mediaAssets);
      onLibraryChange(await getLibrary());
      resetForm();
    } catch (cause) {
      setError(cause instanceof LibraryValidationError
        ? cause.message
        : 'Could not save this item. Your entries are still here; try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (item: VocabularyItem) => {
    setError('');
    try {
      await deleteLibraryItem(item.id);
      if (editingId === item.id) resetForm();
      onLibraryChange(await getLibrary());
    } catch {
      setError('Could not delete this item. Please try again.');
    }
  };

  const handleExport = async () => {
    setTransferMessage('');
    setIsTransferring(true);
    try {
      const archive = await exportLibraryZip(await getLibrary());
      const url = URL.createObjectURL(archive);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'memory-match-backup.zip';
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setTransferMessage('Backup downloaded.');
    } catch {
      setTransferMessage('Could not create a backup. Please try again.');
    } finally {
      setIsTransferring(false);
    }
  };

  const handleImportFile = async (file?: File) => {
    if (!file) return;
    setTransferMessage('');
    setIsTransferring(true);
    try {
      const bundle = await parseImportArchive(file);
      const conflicts = findImportConflicts(bundle, library.items);
      if (conflicts.length) {
        setPendingImport({
          bundle,
          conflicts,
          choices: Object.fromEntries(conflicts.map(({ item }) => [item.id, 'existing' as const])),
        });
      } else {
        const result = await applyImport(bundle, {});
        onLibraryChange(await getLibrary());
        setTransferMessage(`Imported ${result.itemsAdded} items and ${result.relationsAdded} relationships.`);
      }
    } catch (cause) {
      setTransferMessage(cause instanceof Error ? cause.message : 'Could not import this backup.');
    } finally {
      setIsTransferring(false);
    }
  };

  const finishImport = async () => {
    if (!pendingImport) return;
    setTransferMessage('');
    setIsTransferring(true);
    try {
      const result = await applyImport(pendingImport.bundle, pendingImport.choices);
      onLibraryChange(await getLibrary());
      setPendingImport(null);
      setTransferMessage(`Imported ${result.itemsAdded} items, replaced ${result.itemsReplaced}, kept both for ${result.itemsDuplicated}, and added ${result.relationsAdded} relationships.`);
    } catch (cause) {
      setTransferMessage(cause instanceof Error ? cause.message : 'Could not import this backup.');
    } finally {
      setIsTransferring(false);
    }
  };

  const otherItems = library.items.filter((item) => item.id !== editingId);

  return (
    <main className="vocabulary-view">
      <header className="vocabulary-header">
        <button aria-label="Back to game" className="library-icon-button" onClick={onClose} title="Back to game" type="button">
          <ArrowLeft aria-hidden="true" />
        </button>
        <div>
          <p className="view-kicker">Your collection</p>
          <h1>Vocabulary</h1>
        </div>
        <div className="vocabulary-actions">
          <button className="transfer-button" disabled={isTransferring} onClick={() => void handleExport()} type="button">Export</button>
          <label className={`transfer-button${isTransferring ? ' is-disabled' : ''}`}>
            Import
            <input accept=".zip,application/zip" disabled={isTransferring} onChange={(event) => { void handleImportFile(event.target.files?.[0]); event.target.value = ''; }} type="file" />
          </label>
          <button className="add-item-button" onClick={resetForm} type="button"><Plus aria-hidden="true" /> Add word</button>
        </div>
      </header>

      {transferMessage && <p className="transfer-message" role="status">{transferMessage}</p>}

      <div className="library-layout">
        <section aria-label="Vocabulary items" className="library-list">
          <div className="library-list-heading">
            <h2>Items</h2>
            <span>{library.items.length}</span>
          </div>
          {library.items.length === 0 ? (
            <p className="empty-library">No vocabulary yet.</p>
          ) : (
            <ul>
              {library.items.map((item) => (
                <li className="library-item" key={item.id}>
                  <div className="library-item-copy">
                    <strong>{item.targetText || 'Audio vocabulary'}</strong>
                    <span>{item.definition || 'No definition'}</span>
                  </div>
                  <div className="library-item-actions">
                    <button aria-label={`Edit ${item.targetText || 'vocabulary item'}`} className="library-icon-button" onClick={() => startEdit(item)} title="Edit item" type="button">
                      <Pencil aria-hidden="true" />
                    </button>
                    <button aria-label={`Delete ${item.targetText || 'vocabulary item'}`} className="library-icon-button danger" onClick={() => handleDelete(item)} title="Delete item" type="button">
                      <Trash2 aria-hidden="true" />
                    </button>
                  </div>
                  {library.relations.some((relation) => relation.itemAId === item.id || relation.itemBId === item.id) && (
                    <div className="library-relations">
                      <Link2 aria-hidden="true" />
                      {library.relations
                        .filter((relation) => relation.itemAId === item.id || relation.itemBId === item.id)
                        .map((relation) => {
                          const relatedId = relation.itemAId === item.id ? relation.itemBId : relation.itemAId;
                          const related = library.items.find((candidate) => candidate.id === relatedId);
                          return `${RELATION_LABELS[relation.type]} · ${related ? itemLabel(related) : 'Missing item'}`;
                        })
                        .join('  /  ')}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label={editingId ? 'Edit vocabulary item' : 'Add vocabulary item'} className="vocabulary-form-panel">
          <div className="form-heading">
            <h2>{editingId ? 'Edit item' : 'New item'}</h2>
            {editingId && <button aria-label="Cancel editing" className="library-icon-button" onClick={resetForm} type="button"><X aria-hidden="true" /></button>}
          </div>
          <form onSubmit={handleSave}>
            <label className="form-field">
              <span>Target-language text</span>
              <input autoComplete="off" onChange={(event) => setForm({ ...form, targetText: event.target.value })} value={form.targetText} />
            </label>
            <label className="form-field">
              <span>Definition</span>
              <textarea onChange={(event) => setForm({ ...form, definition: event.target.value })} rows={2} value={form.definition} />
            </label>

            <label className="upload-field">
              <span>Target-language audio</span>
              <input accept="audio/mp3,audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/ogg,audio/webm,.m4a" onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                console.log('[VocabularyView] Audio file selected in input.', { name: file?.name, type: file?.type, size: file?.size, filesCount: event.currentTarget.files?.length ?? 0 });
                void addAudioFile(file);
                event.currentTarget.value = '';
                console.log('[VocabularyView] Audio input value cleared after selection.');
              }} type="file" />
              {mediaAssets.find(({ type }) => type === 'audio') && (
                <span className="selected-media">
                  {mediaAssets.find(({ type }) => type === 'audio')?.fileName}
                  <button aria-label="Remove audio" onClick={(event) => { event.preventDefault(); setMediaAssets((current) => current.filter(({ type }) => type !== 'audio')); }} type="button"><X aria-hidden="true" /></button>
                </span>
              )}
            </label>
            <label className="upload-field">
              <span>Image</span>
              <input accept="image/jpeg,image/png,image/webp,image/heic,.heic" onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                console.log('[VocabularyView] Image file selected in input.', { name: file?.name, type: file?.type, size: file?.size, filesCount: event.currentTarget.files?.length ?? 0 });
                void addImageFile(file);
                event.currentTarget.value = '';
                console.log('[VocabularyView] Image input value cleared after selection.');
              }} type="file" />
              {mediaAssets.find(({ type }) => type === 'image') && (
                <span className="selected-media">
                  {mediaAssets.find(({ type }) => type === 'image')?.fileName}
                  <button aria-label="Remove image" onClick={(event) => { event.preventDefault(); setMediaAssets((current) => current.filter(({ type }) => type !== 'image')); }} type="button"><X aria-hidden="true" /></button>
                </span>
              )}
            </label>

            {relationDrafts.map((draft, index) => (
              <div className="relationship-editor" key={draft.id ?? index}>
                <div className="relationship-editor-heading">
                  <span>Relationship</span>
                  <button aria-label="Remove relationship" className="remove-relation" onClick={() => setRelationDrafts((current) => current.filter((_, row) => row !== index))} type="button">
                    <X aria-hidden="true" />
                  </button>
                </div>
                <select
                  aria-label="Relationship type"
                  onChange={(event) => setRelationDrafts((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, type: event.target.value as RelationType } : row))}
                  value={draft.type}
                >
                  {Object.entries(RELATION_LABELS).map(([type, label]) => <option key={type} value={type}>{label}</option>)}
                </select>
                <select
                  aria-label="Related vocabulary item"
                  onChange={(event) => setRelationDrafts((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, relatedItemId: event.target.value } : row))}
                  value={draft.relatedItemId}
                >
                  <option value="">Choose an item</option>
                  {otherItems.map((item) => <option key={item.id} value={item.id}>{itemLabel(item)}</option>)}
                </select>
              </div>
            ))}

            {otherItems.length > 0 && (
              <button className="add-relation-button" onClick={() => setRelationDrafts((current) => [...current, { type: 'synonym', relatedItemId: '' }])} type="button">
                <Plus aria-hidden="true" /> Add relationship
              </button>
            )}

            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="save-item-button" disabled={isSaving} type="submit">{isSaving ? 'Saving…' : 'Save item'}</button>
          </form>
        </section>
      </div>

      {pendingImport && (
        <div className="dialog-backdrop">
          <section aria-labelledby="import-conflict-title" aria-modal="true" className="import-dialog" role="dialog">
            <div className="dialog-heading">
              <h2 id="import-conflict-title">Resolve import conflicts</h2>
              <button aria-label="Cancel import" className="dialog-close" onClick={() => setPendingImport(null)} type="button"><X aria-hidden="true" /></button>
            </div>
            <p className="import-intro">Some item IDs already exist in this library.</p>
            <div className="conflict-list">
              {pendingImport.conflicts.map(({ item, existing }) => (
                <label className="conflict-item" key={item.id}>
                  <span><strong>{item.targetText || item.id}</strong><small>Existing: {existing.targetText || item.id} · {existing.definition || 'No definition'}</small></span>
                  <select
                    aria-label={`Conflict choice for ${item.targetText || item.id}`}
                    onChange={(event) => setPendingImport((current) => current ? {
                      ...current,
                      choices: { ...current.choices, [item.id]: event.target.value as ConflictChoice },
                    } : current)}
                    value={pendingImport.choices[item.id] ?? 'existing'}
                  >
                    <option value="existing">Keep existing</option>
                    <option value="imported">Keep imported</option>
                    <option value="both">Keep both</option>
                  </select>
                </label>
              ))}
            </div>
            <div className="import-actions">
              <button className="transfer-button" onClick={() => setPendingImport(null)} type="button">Cancel</button>
              <button className="save-item-button" disabled={isTransferring} onClick={() => void finishImport()} type="button">{isTransferring ? 'Importing…' : 'Import backup'}</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}