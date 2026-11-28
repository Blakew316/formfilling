/**
 * The Suit Up mark: two lapels forming a V around a tie. Vector, so it is sharp at any size.
 * The lapels take the text colour (dark on light, light on dark); the tie is the accent.
 */
import { useId } from 'react';

export function Logo({ size }: { size: number }) {
  const tie = `tie-${useId().replace(/:/g, '')}`;
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id={tie} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5fd6f8" />
          <stop offset="1" stopColor="#0a8fc2" />
        </linearGradient>
      </defs>
      <path d="M9 5H20.5L32 38.5V57Z" fill="currentColor" />
      <path d="M55 5H43.5L32 38.5V57Z" fill="currentColor" />
      <path d="M29.2 7H34.8L33.6 12.2H30.4Z" fill={`url(#${tie})`} />
      <path d="M30.3 13.6H33.7L35 26.5L32 30.5L29 26.5Z" fill={`url(#${tie})`} />
    </svg>
  );
}

export function Wordmark() {
  return <span className="wordmark">Suit Up</span>;
}
