/**
 * Measures the font used for text placed on the document, so what is shown on screen
 * lands on the same baseline and takes the same width in the saved PDF.
 * The saved PDF uses Helvetica; the on-screen stack is Helvetica and its metric twins.
 */
export const DOC_FONT = 'Helvetica, Arial, "Liberation Sans", sans-serif';
export const DOC_LINE_HEIGHT = 1.2;

let context: CanvasRenderingContext2D | null = null;
function ctx(): CanvasRenderingContext2D {
  context ??= document.createElement('canvas').getContext('2d')!;
  return context;
}

let cachedRatio: number | null = null;

/** Distance from the top of a text box to its baseline, as a multiple of the font size. */
export function baselineRatio(): number {
  if (cachedRatio !== null) return cachedRatio;
  const c = ctx();
  c.font = `100px ${DOC_FONT}`;
  const m = c.measureText('Hg');
  const ascent = (m.fontBoundingBoxAscent || 90.5) / 100;
  const descent = (m.fontBoundingBoxDescent || 21.2) / 100;
  cachedRatio = (DOC_LINE_HEIGHT - (ascent + descent)) / 2 + ascent;
  return cachedRatio;
}

export function textWidth(text: string, fontSize: number): number {
  const c = ctx();
  c.font = `100px ${DOC_FONT}`;
  return (c.measureText(text).width / 100) * fontSize;
}

/** Smallest size text is ever shrunk to; below this, print on a contract stops being comfortably legible. */
export const MIN_FIT_SIZE = 8;

/** Largest size not above `preferred` at which the text fits `maxWidth`, floored at MIN_FIT_SIZE (so it may still overflow). */
export function fitFontSize(text: string, maxWidth: number, preferred: number): number {
  const natural = textWidth(text, preferred);
  if (natural <= maxWidth) return preferred;
  return Math.max(MIN_FIT_SIZE, Math.floor(((preferred * maxWidth) / natural) * 10) / 10);
}

/** True when the text cannot sit inside a blank of this width even at the smallest size. */
export function overflows(text: string, width: number): boolean {
  return textWidth(text, MIN_FIT_SIZE) > width + 2;
}

/** Draws text to a PNG for scripts the PDF's built-in font cannot encode. */
export async function rasterizeText(text: string, fontSize: number): Promise<{ png: Uint8Array; width: number; height: number }> {
  const scale = 4;
  const width = textWidth(text, fontSize) + 2;
  const height = fontSize * DOC_LINE_HEIGHT;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);
  const c = canvas.getContext('2d')!;
  c.scale(scale, scale);
  c.font = `${fontSize}px ${DOC_FONT}`;
  c.fillStyle = '#0d0d12';
  c.textBaseline = 'alphabetic';
  c.fillText(text, 0, fontSize * baselineRatio());
  const blob = await new Promise<Blob>((done) => canvas.toBlob((b) => done(b!), 'image/png'));
  return { png: new Uint8Array(await blob.arrayBuffer()), width, height };
}
