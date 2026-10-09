import { useEffect, useRef, useState } from 'react';
import { RotateCcw, Settings, Volume2, X } from 'lucide-react';
import { getLibrary, type LibrarySnapshot } from './data/library';
import { generateGame } from './domain/game-generation';
import type { GameMode, GameSettings, GeneratedCard, GenerationResult } from './domain/types';
import VocabularyView from './features/vocabulary/VocabularyView';

const INITIAL_SETTINGS: GameSettings = {
  gameStyle: 'memory',
  gameMode: 'classic',
  maxPairs: 8,
  redHerringEnabled: false,
  soundEffectsEnabled: true,
  animationsEnabled: true,
};

const CARD_TONES = [
  '#9854bd', '#428bc6', '#37b4b5', '#73bd59',
  '#4385c5', '#e49a35', '#44ae8a', '#c5b935',
  '#27aeba', '#da73a8', '#d05f81', '#dc8732',
  '#37a58e', '#9850a2', '#b24e99', '#cf4566',
];

function pairIdFor(card: GeneratedCard): string | undefined {
  if (card.isRedHerring) return undefined;
  return card.relationId ? `relation:${card.relationId}` : `classic:${card.itemId}`;
}

function cardKind(card: GeneratedCard): string {
  return ({ targetText: 'Spanish', targetAudio: 'Audio', definition: 'Meaning', image: 'Image' })[card.representation];
}

function buildGame(library: LibrarySnapshot, settings: GameSettings): GenerationResult {
  return generateGame({
    items: library.items,
    relations: library.relations,
    assets: library.assets,
    settings,
  });
}

function App() {
  const [library, setLibrary] = useState<LibrarySnapshot>({ items: [], relations: [], assets: [] });
  const [generation, setGeneration] = useState<GenerationResult | null>(null);
  const [settings, setSettings] = useState(INITIAL_SETTINGS);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [matchedPairIds, setMatchedPairIds] = useState<string[]>([]);
  const [moves, setMoves] = useState(0);
  const [score, setScore] = useState(0);
  const [incorrectIds, setIncorrectIds] = useState<string[]>([]);
  const [isLocked, setIsLocked] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isVocabularyOpen, setIsVocabularyOpen] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const mismatchTimeout = useRef<number | null>(null);
  const audioElements = useRef(new Map<string, HTMLAudioElement>());
  const activeAudioId = useRef<string | null>(null);
  const mismatchWaitingForAudio = useRef(false);

  useEffect(() => {
    let isMounted = true;
    getLibrary().then((savedLibrary) => {
      if (!isMounted) return;
      setLibrary(savedLibrary);
      setGeneration(buildGame(savedLibrary, INITIAL_SETTINGS));
    }).catch(() => {
      if (!isMounted) return;
      setStorageError('Local browser storage is unavailable. Enable it to use your vocabulary library.');
      setGeneration({ kind: 'insufficient', availablePairs: 0 });
    });

    return () => {
      isMounted = false;
      if (mismatchTimeout.current) window.clearTimeout(mismatchTimeout.current);
    };
  }, []);

  useEffect(() => {
    const urls: Record<string, string> = {};
    for (const asset of library.assets) {
      urls[asset.id] = URL.createObjectURL(asset.blob);
    }
    setMediaUrls(urls);
    return () => Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
  }, [library.assets]);

  const stopActiveAudio = () => {
    if (!activeAudioId.current) return;
    const audio = audioElements.current.get(activeAudioId.current);
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    activeAudioId.current = null;
  };

  const playCardAudio = (card: GeneratedCard) => {
    if (!card.assetId) return;
    stopActiveAudio();
    const audio = audioElements.current.get(card.id);
    if (!audio) return;
    activeAudioId.current = card.id;
    void audio.play().catch(() => {
      if (activeAudioId.current === card.id) activeAudioId.current = null;
      if (mismatchWaitingForAudio.current) scheduleMemoryMismatch();
    });
  };

  const finishMismatch = () => {
    mismatchWaitingForAudio.current = false;
    mismatchTimeout.current = null;
    setSelectedIds([]);
    setIncorrectIds([]);
    setIsLocked(false);
  };

  const scheduleMemoryMismatch = () => {
    if (mismatchTimeout.current) window.clearTimeout(mismatchTimeout.current);
    mismatchTimeout.current = window.setTimeout(finishMismatch, 2000);
  };

  const audioEnded = (cardId: string) => {
    if (activeAudioId.current === cardId) activeAudioId.current = null;
    if (mismatchWaitingForAudio.current) scheduleMemoryMismatch();
  };

  const restart = (nextLibrary = library, nextSettings = settings) => {
    if (mismatchTimeout.current) window.clearTimeout(mismatchTimeout.current);
    stopActiveAudio();
    mismatchWaitingForAudio.current = false;
    mismatchTimeout.current = null;
    setLibrary(nextLibrary);
    setSettings(nextSettings);
    setGeneration(buildGame(nextLibrary, nextSettings));
    setSelectedIds([]);
    setMatchedPairIds([]);
    setMoves(0);
    setScore(0);
    setIncorrectIds([]);
    setIsLocked(false);
  };

  const revealCard = (card: GeneratedCard) => {
    const game = generation?.kind === 'ready' ? generation.game : undefined;
    const currentPairId = pairIdFor(card);
    if (!game || isLocked || isComplete || (currentPairId && matchedPairIds.includes(currentPairId)) || selectedIds.includes(card.id)) return;
    if (card.representation === 'targetAudio') playCardAudio(card);

    if (selectedIds.length === 0) {
      setSelectedIds([card.id]);
      return;
    }

    const firstCard = game.cards.find(({ id }) => id === selectedIds[0]);
    if (!firstCard) return;

    setMoves((currentMoves) => currentMoves + 1);
    setSelectedIds([firstCard.id, card.id]);
    const firstPairId = pairIdFor(firstCard);

    if (firstPairId && firstPairId === currentPairId) {
      if (settings.gameStyle === 'match') {
        setScore((currentScore) => currentScore + 1);
        setMatchedPairIds((currentMatches) => [...currentMatches, firstPairId]);
        setSelectedIds([]);
      } else {
        setMatchedPairIds((currentMatches) => [...currentMatches, firstPairId]);
        setSelectedIds([]);
      }
      return;
    }

    setIsLocked(true);
    if (settings.gameStyle === 'match') {
      setIncorrectIds([firstCard.id, card.id]);
      mismatchTimeout.current = window.setTimeout(() => {
        setScore((currentScore) => currentScore - 1);
        finishMismatch();
      }, 500);
      return;
    }

    const activeAudio = activeAudioId.current ? audioElements.current.get(activeAudioId.current) : undefined;
    mismatchWaitingForAudio.current = Boolean(activeAudio && !activeAudio.paused && [firstCard.id, card.id].includes(activeAudioId.current ?? ''));
    if (!mismatchWaitingForAudio.current) scheduleMemoryMismatch();
  };

  const activeGame = generation?.kind === 'ready' ? generation.game : undefined;
  const isComplete = Boolean(activeGame && matchedPairIds.length === activeGame.pairs.length);
  const handleLibraryChange = (nextLibrary: LibrarySnapshot) => restart(nextLibrary, settings);

  if (isVocabularyOpen) {
    return <VocabularyView library={library} onClose={() => setIsVocabularyOpen(false)} onLibraryChange={handleLibraryChange} />;
  }

  return (
    <main className={`app-shell${settings.animationsEnabled ? '' : ' reduced-motion'}`}>
      <header className="game-header">
        <h1>Memory Match</h1>
        <p className="move-count"><span>{settings.gameStyle === 'memory' ? 'Moves:' : 'Score:'}</span> {settings.gameStyle === 'memory' ? moves : score}</p>
      </header>

      <p className="landscape-hint">Rotate your device to landscape for more room.</p>

      <section className="game-area" aria-label="Memory game">
        {generation === null ? (
          <div className="insufficient-state" role="status">Loading vocabulary…</div>
        ) : generation.kind === 'insufficient' ? (
          <div className="insufficient-state" role="status">
            <h2>Not enough pairs yet</h2>
            <p>{storageError || `This game needs at least two valid ${settings.gameMode === 'classic' ? 'vocabulary items' : `${settings.gameMode} relationships`}.`}</p>
            <button className="play-again" onClick={() => setIsVocabularyOpen(true)} type="button">Add vocabulary</button>
          </div>
        ) : (
          <>
            {isComplete && (
              <div className="completion-banner" role="status">
                <div><strong>Lovely work!</strong><span>{settings.gameStyle === 'memory' ? `Complete in ${moves} ${moves === 1 ? 'move' : 'moves'}.` : `Final score: ${score}.`}</span></div>
                <button className="play-again" onClick={() => restart()} type="button">Play again</button>
              </div>
            )}
            <div className="card-grid">
              {generation.game.cards.map((card, index) => {
              const isSelected = selectedIds.includes(card.id);
              const isRevealed = settings.gameStyle === 'match' || isSelected;
              const cardPairId = pairIdFor(card);
              const isMatched = Boolean(cardPairId && matchedPairIds.includes(cardPairId));
              const asset = card.assetId ? library.assets.find(({ id }) => id === card.assetId) : undefined;
              const label = card.text ?? (card.representation === 'targetAudio' ? 'Listen' : card.representation === 'image' ? 'Image' : 'Vocabulary card');
              return (
                <div className="card-wrap" key={card.id} style={{ '--card-tone': CARD_TONES[index % CARD_TONES.length] } as React.CSSProperties}>
                  <button
                  aria-label={isRevealed || isMatched ? `${cardKind(card)}: ${label}` : 'Reveal card'}
                  aria-pressed={settings.gameStyle === 'match' ? isSelected : isRevealed || isMatched}
                  className={`memory-card${isRevealed ? ' is-revealed' : ''}${isSelected ? ' is-selected' : ''}${isMatched ? ' is-matched' : ''}${incorrectIds.includes(card.id) ? ' is-incorrect' : ''}${settings.gameStyle === 'match' && isMatched ? ' is-removed' : ''}`}
                  disabled={isLocked || isMatched || isComplete}
                  onClick={() => revealCard(card)}
                  type="button"
                >
                  <span className="card-inner">
                    <span aria-hidden="true" className="card-face card-back">?</span>
                    <span className="card-face card-front">
                      {card.representation === 'image' && asset && mediaUrls[asset.id]
                        ? <img alt="Vocabulary image" className="card-image" src={mediaUrls[asset.id]} />
                        : <><span className="card-kind">{cardKind(card)}</span><span className="card-word">{label}</span></>}
                    </span>
                  </span>
                  </button>
                  {card.representation === 'targetAudio' && asset && mediaUrls[asset.id] && (
                    <>
                      <audio
                        onEnded={() => audioEnded(card.id)}
                        onError={() => audioEnded(card.id)}
                        ref={(element) => { if (element) audioElements.current.set(card.id, element); else audioElements.current.delete(card.id); }}
                        src={mediaUrls[asset.id]}
                      />
                      {isSelected && !isLocked && !isMatched && (
                        <button aria-label="Replay audio" className="audio-replay" onClick={() => playCardAudio(card)} title="Replay audio" type="button">
                          <Volume2 aria-hidden="true" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              );
            })}
            </div>
          </>
        )}

        <div className="game-controls">
          <button
            aria-label="Game settings"
            className="icon-button"
            onClick={() => setIsSettingsOpen(true)}
            title="Game settings"
            type="button"
          >
            <Settings aria-hidden="true" />
          </button>
          <button
            aria-label="Restart game"
            className="icon-button"
            disabled={moves === 0}
            onClick={() => restart()}
            title="Restart game"
            type="button"
          >
            <RotateCcw aria-hidden="true" />
          </button>
        </div>
      </section>

      {isSettingsOpen && (
        <div className="dialog-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setIsSettingsOpen(false);
        }}>
          <section aria-labelledby="settings-title" aria-modal="true" className="settings-dialog" role="dialog">
            <div className="dialog-heading">
              <h2 id="settings-title">Game settings</h2>
              <button aria-label="Close settings" className="dialog-close" onClick={() => setIsSettingsOpen(false)} type="button">
                <X aria-hidden="true" />
              </button>
            </div>
            <span className="settings-field">Game style</span>
            <div aria-label="Game style" className="style-switch" role="group">
              <button aria-pressed={settings.gameStyle === 'memory'} onClick={() => restart(library, { ...settings, gameStyle: 'memory' })} type="button">Memory</button>
              <button aria-pressed={settings.gameStyle === 'match'} onClick={() => restart(library, { ...settings, gameStyle: 'match' })} type="button">Match</button>
            </div>
            <label className="settings-field" htmlFor="game-mode">Game mode</label>
            <select id="game-mode" onChange={(event) => restart(library, { ...settings, gameMode: event.target.value as GameMode })} value={settings.gameMode}>
              <option value="classic">Classic</option>
              <option value="synonym">Synonyms</option>
              <option value="antonym">Antonyms</option>
              <option value="genericSpecific">Generic / Specific</option>
              <option value="wholePart">Whole / Part</option>
            </select>
            <label className="pair-setting" htmlFor="pair-count"><span>Maximum pairs</span><output htmlFor="pair-count">{settings.maxPairs}</output></label>
            <input
              id="pair-count"
              max="20"
              min="2"
              onChange={(event) => restart(library, { ...settings, maxPairs: Number(event.target.value) })}
              type="range"
              value={settings.maxPairs}
            />
            <label className="red-herring-setting">
              <input checked={settings.redHerringEnabled} onChange={(event) => restart(library, { ...settings, redHerringEnabled: event.target.checked })} type="checkbox" />
              <span>One red herring</span>
            </label>
            <label className="red-herring-setting">
              <input checked={settings.soundEffectsEnabled} onChange={(event) => restart(library, { ...settings, soundEffectsEnabled: event.target.checked })} type="checkbox" />
              <span>Sound effects</span>
            </label>
            <label className="red-herring-setting">
              <input checked={settings.animationsEnabled} onChange={(event) => restart(library, { ...settings, animationsEnabled: event.target.checked })} type="checkbox" />
              <span>Animations</span>
            </label>
            <button className="vocabulary-link" onClick={() => { setIsSettingsOpen(false); setIsVocabularyOpen(true); }} type="button">Open Vocabulary</button>
          </section>
        </div>
      )}
    </main>
  );
}

export default App;