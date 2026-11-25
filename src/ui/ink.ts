/**
 * Turns a drawn or typed signature into a trimmed, transparent PNG.
 * The handwriting fonts are bundled with the site and loaded only when the Type tab is used.
 */
import type { SavedInk } from '../state/storage';

export interface InkStyle {
  id: string;
  family: string;
  load: () => Promise<unknown>;
  /** Multiplier that evens out how large each face looks at the same nominal size. */
  scale: number;
}

export const INK_STYLES: InkStyle[] = [
  { id: 'allura', family: 'Allura', load: () => import('@fontsource/allura/400.css'), scale: 1.15 },
  { id: 'delafield', family: 'Mrs Saint Delafield', load: () => import('@fontsource/mrs-saint-delafield/400.css'), scale: 1.25 },
  { id: 'caveat', family: 'Caveat', load: () => import('@fontsource/caveat/500.css'), scale: 1 },
  { id: 'homemade', family: 'Homemade Apple', load: () => import('@fontsource/homemade-apple/400.css'), scale: 0.72 },
];

export const INK_COLORS = [
  { id: 'black', value: '#111114', label: 'Black' },
  { id: 'blue', value: '#12338f', label: 'Blue' },
];

/** Resolves once every handwriting face can be drawn to a canvas. */
export async function loadInkFonts(): Promise<void> {
  await Promise.all(INK_STYLES.map((s) => s.load()));
  await Promise.all(INK_STYLES.map((s) => document.fonts.load(`48px "${s.family}"`, 'Signature')));
}

/** Crops a canvas to its non-transparent pixels. Returns null when nothing was drawn. */
export function trimToInk(canvas: HTMLCanvasElement): SavedInk | null {
  const c = canvas.getContext('2d')!;
  const { width, height } = canvas;
  const data = c.getImageData(0, 0, width, height).data;
  let top = height, left = width, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 12) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  if (right < left || bottom < top) return null;
  const pad = 6;
  left = Math.max(0, left - pad);
  top = Math.max(0, top - pad);
  right = Math.min(width - 1, right + pad);
  bottom = Math.min(height - 1, bottom + pad);
  const out = document.createElement('canvas');
  out.width = right - left + 1;
  out.height = bottom - top + 1;
  out.getContext('2d')!.drawImage(canvas, left, top, out.width, out.height, 0, 0, out.width, out.height);
  return { src: out.toDataURL('image/png'), aspect: out.width / out.height };
}

/** Renders a name in a handwriting face. The font must already be loaded (see loadInkFonts). */
export function typedInk(text: string, style: InkStyle, color: string): SavedInk | null {
  if (!text.trim()) return null;
  const size = 150 * style.scale;
  const font = `${size}px "${style.family}"`;
  const canvas = document.createElement('canvas');
  const c = canvas.getContext('2d')!;
  c.font = font;
  canvas.width = Math.ceil(c.measureText(text).width + size * 1.2);
  canvas.height = Math.ceil(size * 2.4);
  c.font = font;
  c.fillStyle = color;
  c.textBaseline = 'alphabetic';
  c.fillText(text, size * 0.5, size * 1.5);
  return trimToInk(canvas);
}
