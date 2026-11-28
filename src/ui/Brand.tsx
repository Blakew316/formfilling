/**
 * The Suit Up mark: a triangular arc reactor in gunmetal and gold with a lit core.
 * Vector, so it is sharp at any size. `glow` adds the slow breathing light used on the start screen.
 * public/brand/reactor.svg is the same drawing for the browser tab icon.
 */
import { useId } from 'react';

export function Logo({ size, glow = false }: { size: number; glow?: boolean }) {
  const id = useId().replace(/:/g, '');
  const metal = `metal-${id}`;
  const gold = `gold-${id}`;
  const core = `core-${id}`;
  return (
    <svg className={`logo${glow ? ' logo-glow' : ''}`} width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id={metal} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#525a66" />
          <stop offset=".4" stopColor="#2a3038" />
          <stop offset="1" stopColor="#111418" />
        </linearGradient>
        <linearGradient id={gold} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f6dc96" />
          <stop offset=".5" stopColor="#c99b3f" />
          <stop offset="1" stopColor="#8d6622" />
        </linearGradient>
        <radialGradient id={core} cx="50%" cy="40%" r="62%">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset=".3" stopColor="#e6fbff" />
          <stop offset=".7" stopColor="#7fe1ff" />
          <stop offset="1" stopColor="#1c9fd6" />
        </radialGradient>
      </defs>
      <path d="M10 16 L22 7 H78 L90 16 L88 32 L57 90 Q50 97 43 90 L12 32 Z" fill={`url(#${metal})`} stroke={`url(#${gold})`} strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M29 7 L34 11.5 H66 L71 7" fill="none" stroke={`url(#${gold})`} strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M44.5 8.6 H55.5 L54 11.5 H46 Z" fill="#0d1014" />
      <path d="M19.5 18.5 H80.5 L53 76.5 Q50 81 47 76.5 Z" fill="#0b0e12" />
      <path className="logo-core" d="M22 20.5 H78 L52.4 74 Q50 77.6 47.6 74 Z" fill={`url(#${core})`} />
      <g fill="#161a20">
        <path d="M37 26 H63 L61.6 29 H38.4 Z" />
        <path d="M34.8 30.6 L37.4 30.6 L48.2 53.4 L46.6 56.6 Z" />
        <path d="M65.2 30.6 L62.6 30.6 L51.8 53.4 L53.4 56.6 Z" />
      </g>
      <g stroke="#161a20" strokeWidth="2.4" strokeLinecap="round">
        <path d="M24.5 22.5 L33.6 27.6" />
        <path d="M75.5 22.5 L66.4 27.6" />
        <path d="M50 71 V60.5" />
      </g>
      <path d="M43.5 33 H56.5 L50 46 Z" fill="#ffffff" opacity=".9" />
    </svg>
  );
}

export function Wordmark() {
  return <span className="wordmark">Suit Up</span>;
}
