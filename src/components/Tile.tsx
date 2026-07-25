import type { Tile as TileModel } from '../game/build';

interface TileProps {
  tile: TileModel;
  wrong: boolean;
  onSelect: (id: string) => void;
  singleWord: boolean;
}

export function Tile({ tile, wrong, onSelect, singleWord }: TileProps) {
  return (
    <button
      type="button"
      className={`tile ${wrong ? 'tile--wrong' : ''}`}
      onClick={() => onSelect(tile.id)}
      aria-label={`${singleWord ? 'Word' : 'Phrase'}: ${tile.text}`}
    >
      {tile.text}
    </button>
  );
}
