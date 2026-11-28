/** Line icons drawn on a 20px grid with one stroke weight, so they sit evenly beside text. */
import type { ReactNode } from 'react';

const PATHS: Record<string, ReactNode> = {
  upload: <path d="M10 13V3.5m0 0L6.5 7M10 3.5 13.5 7M4 12.5v2A1.5 1.5 0 0 0 5.5 16h9a1.5 1.5 0 0 0 1.5-1.5v-2" />,
  download: <path d="M10 3.5V13m0 0-3.5-3.5M10 13l3.5-3.5M4 12.5v2A1.5 1.5 0 0 0 5.5 16h9a1.5 1.5 0 0 0 1.5-1.5v-2" />,
  signature: <path d="M3 14.5c2.2-4.6 3.8-7 5-7 1.6 0-.6 6 1 6s2-3.6 3.4-3.6c1 0 .6 2.2 1.6 2.2.8 0 1.4-.7 3-1.1M3 17h14" />,
  initials: <path d="M4 14.5 6.8 6h.9l2.8 8.5M5.1 11.5h4.3M13 6v8.5M13 6h1.6a2.2 2.2 0 0 1 0 4.4H13m1.6 0L17 14.5" />,
  text: <path d="M5 5.5h10M10 5.5v10M8 15.5h4" />,
  calendar: <path d="M4.5 6.5A1.5 1.5 0 0 1 6 5h8a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 14 16H6a1.5 1.5 0 0 1-1.5-1.5v-8zM4.5 9h11M7.5 3.5v3M12.5 3.5v3" />,
  check: <path d="m4.5 10.5 3.5 3.5 7.5-8" />,
  undo: <path d="M7 5 3.5 8.5 7 12M3.5 8.5h8a4 4 0 0 1 0 8H9" />,
  redo: <path d="m13 5 3.5 3.5L13 12M16.5 8.5h-8a4 4 0 0 0 0 8H11" />,
  plus: <path d="M10 4.5v11M4.5 10h11" />,
  minus: <path d="M4.5 10h11" />,
  close: <path d="m5.5 5.5 9 9M14.5 5.5l-9 9" />,
  lock: <path d="M6 9V7a4 4 0 0 1 8 0v2M5.5 9h9A1.5 1.5 0 0 1 16 10.5v5A1.5 1.5 0 0 1 14.5 17h-9A1.5 1.5 0 0 1 4 15.5v-5A1.5 1.5 0 0 1 5.5 9z" />,
  panel: <path d="M4 5.500A1.500 1.500 0 0 1 5.500 4h9A1.500 1.500 0 0 1 16 5.500v9A1.500 1.500 0 0 1 14.500 16h-9A1.500 1.500 0 0 1 4 14.500v-9zM12 4v12" />,
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}
