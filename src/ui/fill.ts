/**
 * Builds the items that sit on the page: text sized to its blank, and signatures resting on their line.
 * Shared by one-click filling, Auto-fill and free placement so all three look the same.
 */
import { formatDate, type Profile } from '../engine/profile';
import type { Field, ImageItem, Item, TextItem } from '../engine/types';
import { newId, type Tool } from '../state/editor';
import type { SavedInk } from '../state/storage';
import { baselineRatio, fitFontSize, textWidth } from './textMetrics';

const SIGNATURE_HEIGHT = 34;
const INITIALS_HEIGHT = 22;

export function textForField(field: Field, text: string): TextItem {
  const preferred = Math.min(12, Math.max(8, field.fontSize));
  const fontSize = text ? fitFontSize(text, field.rect.w - 4, preferred) : preferred;
  return {
    id: newId(),
    type: 'text',
    page: field.page,
    x: field.rect.x + 2,
    // One point of lift keeps descenders clear of the printed line.
    y: field.baseline - 1 - fontSize * baselineRatio(),
    fontSize,
    text,
    fieldId: field.id,
  };
}

export function inkForField(field: Field, ink: SavedInk, role: ImageItem['role']): ImageItem {
  let h = role === 'signature' ? SIGNATURE_HEIGHT : INITIALS_HEIGHT;
  let w = h * ink.aspect;
  const room = Math.max(field.rect.w * 1.1, 60);
  if (w > room) {
    w = room;
    h = w / ink.aspect;
  }
  return {
    id: newId(),
    type: 'image',
    page: field.page,
    x: field.rect.x + 2,
    // The lower fifth dips under the line, the way a pen signature crosses it.
    y: field.baseline + h * 0.2 - h,
    w,
    h,
    src: ink.src,
    role,
    fieldId: field.id,
  };
}

/** Creates the item for a placement tool, centred on the clicked point. Returns null when the tool needs ink that is not saved yet. */
export function itemForTool(
  tool: Tool,
  page: number,
  x: number,
  y: number,
  profile: Profile,
  ink: { signature: SavedInk | null; initials: SavedInk | null },
): Item | null {
  if (tool === 'check') return { id: newId(), type: 'check', page, x: x - 7, y: y - 7, size: 14 };
  if (tool === 'text' || tool === 'date') {
    const text = tool === 'date' ? formatDate(new Date(), profile.dateFormat) : '';
    const fontSize = 11;
    return { id: newId(), type: 'text', page, x: tool === 'date' ? x - textWidth(text, fontSize) / 2 : x, y: y - fontSize * 0.6, fontSize, text };
  }
  const saved = ink[tool];
  if (!saved) return null;
  const h = tool === 'signature' ? SIGNATURE_HEIGHT : INITIALS_HEIGHT;
  const w = h * saved.aspect;
  return { id: newId(), type: 'image', page, x: x - w / 2, y: y - h / 2, w, h, src: saved.src, role: tool };
}

/** Keeps an item's box inside its page. */
export function clampToPage<T extends { x: number; y: number }>(item: T, w: number, h: number, pageW: number, pageH: number): T {
  return { ...item, x: Math.min(Math.max(0, item.x), Math.max(0, pageW - w)), y: Math.min(Math.max(0, item.y), Math.max(0, pageH - h)) };
}
