/**
 * Turns a pdf.js document into the plain data the engine works on.
 *
 * This is the only place that knows pdf.js object shapes. It takes the pdf.js
 * module as an argument so the same code runs in the browser build and in the
 * Node build used by the tests.
 */
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { classifyBlank } from '../engine/classify';
import type { PageText } from '../engine/detect';
import { applyMatrix } from '../engine/geometry';
import type { CharWidthLookup, FormWidget, Matrix, PageInfo, RawTextItem } from '../engine/types';

type PdfJs = typeof import('pdfjs-dist');

export interface ExtractedDocument {
  pages: PageInfo[];
  texts: PageText[];
  widgets: FormWidget[];
  /** True when the file carries a cryptographic signature (for example a DocuSign seal). */
  hasDigitalSignature: boolean;
}

/** Reads real glyph widths out of the page's drawing commands, so blanks inside a longer run can be located exactly. */
async function glyphWidths(pdfjs: PdfJs, page: PDFPageProxy): Promise<CharWidthLookup> {
  const table = new Map<string, Map<string, number>>();
  try {
    const ops = await page.getOperatorList();
    const stack: string[] = [];
    let font = '';
    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i];
      const args = ops.argsArray[i];
      if (fn === pdfjs.OPS.save) stack.push(font);
      else if (fn === pdfjs.OPS.restore) font = stack.pop() ?? font;
      else if (fn === pdfjs.OPS.setFont) font = String(args[0]);
      else if (fn === pdfjs.OPS.showText) {
        let widths = table.get(font);
        if (!widths) table.set(font, (widths = new Map()));
        for (const glyph of args[0] as unknown[]) {
          const g = glyph as { unicode?: string; width?: number } | null;
          if (g && typeof g === 'object' && typeof g.unicode === 'string' && typeof g.width === 'number') {
            widths.set(g.unicode, g.width);
          }
        }
      }
    }
  } catch {
    // Width data is an accuracy improvement only; detection falls back to estimates.
  }
  return (fontName, ch) => table.get(fontName)?.get(ch);
}

async function extractText(pdfjs: PdfJs, page: PDFPageProxy, transform: Matrix): Promise<RawTextItem[]> {
  const content = await page.getTextContent();
  const items: RawTextItem[] = [];
  for (const it of content.items) {
    if (!('str' in it) || !it.str) continue;
    const m = pdfjs.Util.transform(transform, it.transform) as number[];
    // Text that is not upright on the displayed page cannot be a blank someone types on.
    if (Math.abs(m[1]) > 0.01 || Math.abs(m[2]) > 0.01 || m[0] <= 0) continue;
    items.push({
      str: it.str,
      x: m[4],
      y: m[5],
      width: it.width,
      fontSize: Math.hypot(m[2], m[3]),
      fontName: it.fontName,
    });
  }
  return items;
}

interface WidgetAnnotation {
  subtype?: string;
  fieldType?: string;
  fieldName?: string;
  fieldValue?: unknown;
  rect: number[];
  alternativeText?: string;
  checkBox?: boolean;
  radioButton?: boolean;
  pushButton?: boolean;
  exportValue?: string;
  buttonValue?: string;
  options?: { exportValue: string; displayValue: string }[];
  multiLine?: boolean;
  maxLen?: number;
  readOnly?: boolean;
  hidden?: boolean;
  defaultAppearanceData?: { fontSize?: number };
}

function toWidget(a: WidgetAnnotation, pageIndex: number, n: number, rect: number[]): FormWidget | null {
  if (!a.fieldName || a.hidden || a.pushButton) return null;
  const type = a.fieldType === 'Tx' ? 'text' : a.fieldType === 'Ch' ? 'select' : a.checkBox ? 'checkbox' : a.radioButton ? 'radio' : null;
  if (!type) return null;
  const hint = a.alternativeText || a.fieldName.split('.').pop()!.replace(/\[\d+\]/g, '').replace(/[_-]+/g, ' ');
  const c = classifyBlank(hint.replace(/([a-z])([A-Z])/g, '$1 $2'), '');
  const raw = Array.isArray(a.fieldValue) ? a.fieldValue[0] : a.fieldValue;
  return {
    id: `p${pageIndex}-w${n}`,
    page: pageIndex,
    rect: { x: rect[0], y: rect[1], w: rect[2] - rect[0], h: rect[3] - rect[1] },
    name: a.fieldName,
    type,
    kind: type === 'text' ? c.kind : 'unknown',
    label: a.alternativeText || '',
    value: typeof raw === 'string' ? raw : '',
    exportValue: a.exportValue ?? a.buttonValue,
    options: a.options?.map((o) => ({ value: o.exportValue, label: o.displayValue })),
    multiline: a.multiLine,
    maxLength: a.maxLen || undefined,
    readOnly: a.readOnly,
    fontSize: a.defaultAppearanceData?.fontSize || undefined,
  };
}

/** True when the raw file contains a signature dictionary, which is how DocuSign and similar tools seal a PDF. */
export function hasSignatureSeal(bytes: Uint8Array): boolean {
  const needle = [0x2f, 0x42, 0x79, 0x74, 0x65, 0x52, 0x61, 0x6e, 0x67, 0x65]; // "/ByteRange"
  outer: for (let i = bytes.length - needle.length; i >= 0; i--) {
    for (let j = 0; j < needle.length; j++) if (bytes[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

/** Collects page geometry, text and form widgets for every page. Reads pages one at a time to keep memory flat. */
export async function extractDocument(pdfjs: PdfJs, doc: PDFDocumentProxy, bytes?: Uint8Array): Promise<ExtractedDocument> {
  const out: ExtractedDocument = { pages: [], texts: [], widgets: [], hasDigitalSignature: bytes ? hasSignatureSeal(bytes) : false };
  for (let i = 0; i < doc.numPages; i++) {
    const page = await doc.getPage(i + 1);
    const viewport = page.getViewport({ scale: 1 });
    const transform = viewport.transform as Matrix;
    out.pages.push({ index: i, width: viewport.width, height: viewport.height, viewTransform: transform });

    const items = await extractText(pdfjs, page, transform);
    const needsWidths = items.some((it) => /_{3,}/.test(it.str) && /[^_\s]/.test(it.str));
    out.texts.push({
      width: viewport.width,
      height: viewport.height,
      items,
      charWidth: needsWidths ? await glyphWidths(pdfjs, page) : undefined,
    });

    const annotations = (await page.getAnnotations()) as WidgetAnnotation[];
    for (const a of annotations) {
      if (a.subtype !== 'Widget') continue;
      if (a.fieldType === 'Sig') continue;
      const [x1, y1] = applyMatrix(transform, a.rect[0], a.rect[1]);
      const [x2, y2] = applyMatrix(transform, a.rect[2], a.rect[3]);
      const rect = [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)];
      const widget = toWidget(a, i, out.widgets.length, rect);
      if (widget) out.widgets.push(widget);
    }
    page.cleanup();
  }
  return out;
}
