'use client';

export default function WatchlistButton({
  symbol,
  company,
  isInWatchlist,
  onWatchlistChange,
  type = 'button',
}: WatchlistButtonProps) {
  const nextState = !isInWatchlist;
  return (
    <button
      type="button"
      onClick={() => onWatchlistChange?.(symbol, nextState)}
      className="yellow-btn px-4 py-2 rounded text-sm"
      aria-label={isInWatchlist ? `Remove ${company} (${symbol}) from watchlist` : `Add ${company} (${symbol}) to watchlist`}
    >
      {isInWatchlist ? 'Remove from Watchlist' : 'Add to Watchlist'}
    </button>
  );
}
