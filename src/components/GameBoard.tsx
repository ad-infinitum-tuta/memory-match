import { useEffect, useRef, useState } from 'react';
import { RotateCcw, Volume2 } from 'lucide-react';
import type { GameStyle, GeneratedCard, MediaAsset, VocabularyItem } from '../domain/types';

type GameBoardProps = {
  cards: GeneratedCard[];
  items: VocabularyItem[];
  assets: MediaAsset[];
  gameStyle: GameStyle;
  animationsEnabled: boolean;
  isLocked: boolean;
  onSelect: (card: GeneratedCard) => void;
  onAudioPlaying: (playing: boolean) => void;
};

export default function GameBoard({ cards, items, assets, gameStyle, animationsEnabled, isLocked, onSelect, onAudioPlaying }: GameBoardProps) {
  const [assetUrls, setAssetUrls] = useState<Map<string, string>>(() => new Map());
  const activeAudio = useRef<HTMLAudioElement | null>(null);
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));

  useEffect(() => {
    const urls = new Map(assets.map((asset) => [asset.id, URL.createObjectURL(asset.blob)]));
    setAssetUrls(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [assets]);

  useEffect(() => () => {
    activeAudio.current?.pause();
    activeAudio.current = null;
    onAudioPlaying(false);
  }, [onAudioPlaying]);

  function playAudio(asset: MediaAsset | undefined) {
    const url = asset ? assetUrls.get(asset.id) : undefined;
    if (!url) return;
    activeAudio.current?.pause();
    const player = new Audio(url);
    activeAudio.current = player;
    onAudioPlaying(true);
    const stop = () => {
      if (activeAudio.current !== player) return;
      activeAudio.current = null;
      onAudioPlaying(false);
    };
    player.addEventListener('ended', stop, { once: true });
    player.addEventListener('error', stop, { once: true });
    void player.play().catch(stop);
  }

  function chooseCard(card: GeneratedCard) {
    if (isLocked || card.state === 'selected' || ['matched', 'removed', 'disabled', 'incorrect'].includes(card.state)) return;
    if (card.representation === 'targetAudio') {
      const item = itemsById.get(card.itemId);
      playAudio(item?.audioAssetId ? assetsById.get(item.audioAssetId) : undefined);
    }
    onSelect(card);
  }

  return (
    <div className={`card-grid ${gameStyle === 'match' ? 'card-grid-match' : ''} ${animationsEnabled ? '' : 'animations-off'}`}>
      {cards.map((card) => {
        const item = itemsById.get(card.itemId);
        const audioAsset = item?.audioAssetId ? assetsById.get(item.audioAssetId) : undefined;
        const imageAsset = item?.imageAssetId ? assetsById.get(item.imageAssetId) : undefined;
        const isHidden = gameStyle === 'memory' && card.state === 'hidden';
        const isInactive = ['matched', 'removed', 'disabled', 'incorrect'].includes(card.state);
        const cardClass = [
          'game-card',
          `card-${card.state}`,
          `card-${card.representation}`,
          card.isRedHerring ? 'card-red-herring' : '',
          isHidden ? 'card-hidden' : '',
        ].filter(Boolean).join(' ');

        return (
          <div
            className={cardClass}
            key={card.id}
            role="button"
            tabIndex={isInactive || isLocked ? -1 : 0}
            aria-label={isHidden ? 'Hidden card' : card.representation === 'targetAudio' ? 'Audio card' : card.representation === 'targetText' ? item?.targetText || 'Target-language text' : card.representation === 'definition' ? item?.definition || 'Definition' : item?.targetText || 'Vocabulary image'}
            aria-disabled={isInactive || isLocked}
            onClick={() => chooseCard(card)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                chooseCard(card);
              }
            }}
          >
            {isHidden ? <span className="card-back-mark" aria-hidden="true">M</span> : (
              <>
                <div className="card-content">
                  {card.representation === 'targetText' && <span className="card-text">{item?.targetText}</span>}
                  {card.representation === 'definition' && <span className="card-definition">{item?.definition}</span>}
                  {card.representation === 'image' && imageAsset && <img className="card-image" src={assetUrls.get(imageAsset.id)} alt={item?.targetText ?? 'Vocabulary illustration'} />}
                  {card.representation === 'targetAudio' && <><Volume2 className="audio-card-icon" size={22} /><span className="audio-card-label">Listen</span></>}
                </div>
                {card.representation === 'targetAudio' && (card.state === 'selected' || (gameStyle === 'memory' && card.state === 'revealed')) && !isLocked && (
                  <button className="audio-replay" type="button" aria-label="Replay pronunciation" onClick={(event) => { event.stopPropagation(); playAudio(audioAsset); }}>
                    <RotateCcw size={15} />
                  </button>
                )}
                {card.isRedHerring && <span className="red-herring-mark" aria-hidden="true">?</span>}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}