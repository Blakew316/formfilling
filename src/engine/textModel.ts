/**
 * Rebuilds readable lines from the viewer's loose text runs.
 *
 * Output is a list of segments: stretches of text on one visual line with no
 * column-sized gap inside. Each segment knows the horizontal extent of every
 * character, which is what lets detect.ts locate a blank inside a longer run.
 */
import type { CharWidthLookup, RawTextItem } from './types';

/** Horizontal gap (points) beyond which text on one line belongs to a different column. */
const COLUMN_GAP = 36;

export interface Segment {
  text: string;
  /** Left and right edge of each character in `text`. */
  x0: number[];
  x1: number[];
  left: number;
  right: number;
  baseline: number;
  fontSize: number;
  /** Index of the visual line; segments on the same line share it. */
  line: number;
}

/** Rough widths per 1000 units, used only for characters the font data does not cover. */
function fallbackWidth(ch: string): number {
  if (ch === ' ') return 278;
  if ("iljtfI.,:;'|!".includes(ch)) return 278;
  if ('mwMW@'.includes(ch)) return 833;
  if (ch >= 'A' && ch <= 'Z') return 667;
  return 520;
}

/** Splits one text run into per-character extents that sum exactly to the run's reported width. */
function charExtents(item: RawTextItem, lookup?: CharWidthLookup): { x0: number[]; x1: number[] } {
  const chars = item.str.split(""); // UTF-16 units, so indices line up with regex matches on the text
  const known = chars.map((ch) => lookup?.(item.fontName, ch));
  const sample = known.filter((w): w is number => typeof w === 'number' && w > 0);
  // Fallback widths assume 1000 units per em; rescale them to whatever unit this font reports.
  const unit = sample.length ? sample.reduce((a, b) => a + b, 0) / sample.length / 520 : 1;
  const widths = chars.map((ch, i) => known[i] ?? fallbackWidth(ch) * unit);
  const total = widths.reduce((a, b) => a + b, 0) || 1;
  const x0: number[] = [];
  const x1: number[] = [];
  let x = item.x;
  for (const w of widths) {
    const step = (w / total) * item.width;
    x0.push(x);
    x1.push(x + step);
    x += step;
  }
  return { x0, x1 };
}

/** Groups text runs into visual lines and column segments, in top-to-bottom, left-to-right order. */
export function buildSegments(items: RawTextItem[], lookup?: CharWidthLookup): Segment[] {
  const usable = items
    .filter((it) => it.str.trim() !== '' && it.width > 0)
    .sort((a, b) => a.y - b.y || a.x - b.x);

  const lines: RawTextItem[][] = [];
  for (const it of usable) {
    const last = lines[lines.length - 1];
    const tolerance = Math.max(2, it.fontSize * 0.25);
    if (last && Math.abs(last[0].y - it.y) <= tolerance) last.push(it);
    else lines.push([it]);
  }

  const segments: Segment[] = [];
  lines.forEach((line, lineIndex) => {
    line.sort((a, b) => a.x - b.x);
    let current: Segment | null = null;
    for (const it of line) {
      const { x0, x1 } = charExtents(it, lookup);
      const gap = current ? it.x - current.right : 0;
      if (!current || gap > COLUMN_GAP) {
        current = {
          text: '',
          x0: [],
          x1: [],
          left: it.x,
          right: it.x,
          baseline: it.y,
          fontSize: it.fontSize,
          line: lineIndex,
        };
        segments.push(current);
      } else if (gap > it.fontSize * 0.12 && !/\s$/.test(current.text) && !/^\s/.test(it.str)) {
        current.text += ' ';
        current.x0.push(current.right);
        current.x1.push(it.x);
      }
      current.text += it.str;
      current.x0.push(...x0);
      current.x1.push(...x1);
      current.right = Math.max(current.right, it.x + it.width);
      current.fontSize = Math.max(current.fontSize, it.fontSize);
    }
  });
  return segments;
}
