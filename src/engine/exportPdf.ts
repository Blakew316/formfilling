/**
 * Writes the placed text, signatures and form values into a copy of the PDF.
 *
 * Everything is drawn into the page content and the form is flattened, so the
 * result looks the same in every viewer and cannot be edited as loose annotations.
 * The whole file is rewritten, which means a cryptographic seal on the source
 * (DocuSign and similar) cannot survive; the dead signature field is removed so
 * the output does not present a broken seal. The UI warns about this up front.
 */
import {
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFName,
  PDFOptionList,
  PDFRadioGroup,
  PDFSignature,
  PDFTextField,
  StandardFonts,
  radians,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from '@cantoo/pdf-lib';
import { toUserSpace } from './geometry';
import type { Item, PageInfo, TextItem } from './types';

export interface RasterText {
  png: Uint8Array;
  /** Size in page units of the box the image should fill, measured from the text item's top-left. */
  width: number;
  height: number;
}

export interface ExportInput {
  bytes: Uint8Array;
  pages: PageInfo[];
  items: Item[];
  /** Values for the PDF's own form fields by field name; checkboxes use 'true' / ''. */
  formValues: Record<string, string>;
  /** Distance from a text item's top to its baseline, as a multiple of the font size. */
  baselineRatio: number;
  /** Renders text the built-in font cannot encode (non-Latin scripts). Without it such characters become '?'. */
  rasterizeText?: (item: TextItem) => Promise<RasterText | null>;
}

const INK = rgb(0.05, 0.05, 0.07);

function dataUrlBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function canEncode(font: PDFFont, text: string): boolean {
  try {
    font.encodeText(text);
    return true;
  } catch {
    return false;
  }
}

function applyFormValues(doc: PDFDocument, values: Record<string, string>): void {
  const form = doc.getForm();
  for (const [name, value] of Object.entries(values)) {
    const field = form.getFieldMaybe(name);
    try {
      if (field instanceof PDFTextField) field.setText(value || undefined);
      else if (field instanceof PDFCheckBox) value ? field.check() : field.uncheck();
      else if (field instanceof PDFRadioGroup) value ? field.select(value) : field.clear();
      else if (field instanceof PDFDropdown || field instanceof PDFOptionList) value ? field.select(value) : field.clear();
    } catch {
      // One unwritable field (rich text, bad option) must not sink the whole export.
    }
  }
}

/** Removes signature fields, which a full rewrite always invalidates, then bakes the remaining fields into the page. */
function settleForm(doc: PDFDocument): void {
  const form = doc.getForm();
  for (const field of form.getFields()) {
    if (field instanceof PDFSignature) {
      try {
        form.removeField(field);
      } catch {
        // Leaving a stale field is harmless compared with failing the download.
      }
    }
  }
  form.acroForm.dict.delete(PDFName.of('SigFlags'));
  doc.catalog.delete(PDFName.of('Perms'));
  if (form.getFields().length === 0) return;
  try {
    form.flatten();
  } catch {
    // Some forms lack appearance data pdf-lib can flatten; they stay filled but editable.
  }
}

async function drawItem(
  item: Item,
  page: PDFPage,
  info: PageInfo,
  font: PDFFont,
  images: Map<string, PDFImage>,
  input: ExportInput,
): Promise<void> {
  const doc = page.doc;
  const drawImage = async (src: string | Uint8Array, key: string, x: number, y: number, w: number, h: number) => {
    let image = images.get(key);
    if (!image) {
      image = await doc.embedPng(typeof src === 'string' ? dataUrlBytes(src) : src);
      images.set(key, image);
    }
    const at = toUserSpace(info.viewTransform, x, y + h);
    page.drawImage(image, { x: at.x, y: at.y, width: w * at.scale, height: h * at.scale, rotate: radians(at.angle) });
  };

  if (item.type === 'image') {
    await drawImage(item.src, item.src, item.x, item.y, item.w, item.h);
    return;
  }
  if (item.type === 'check') {
    const s = item.size;
    const points: [number, number][] = [
      [item.x + s * 0.14, item.y + s * 0.55],
      [item.x + s * 0.4, item.y + s * 0.82],
      [item.x + s * 0.88, item.y + s * 0.2],
    ];
    const user = points.map(([x, y]) => toUserSpace(info.viewTransform, x, y));
    for (let i = 0; i < 2; i++) {
      page.drawLine({
        start: { x: user[i].x, y: user[i].y },
        end: { x: user[i + 1].x, y: user[i + 1].y },
        thickness: s * 0.12 * user[i].scale,
        color: INK,
      });
    }
    return;
  }
  if (!item.text.trim()) return;
  if (!canEncode(font, item.text)) {
    const raster = await input.rasterizeText?.(item);
    if (raster) {
      await drawImage(raster.png, `text:${item.id}`, item.x, item.y, raster.width, raster.height);
      return;
    }
  }
  const text = [...item.text].map((ch) => (canEncode(font, ch) ? ch : '?')).join('');
  const at = toUserSpace(info.viewTransform, item.x, item.y + item.fontSize * input.baselineRatio);
  page.drawText(text, { x: at.x, y: at.y, size: item.fontSize * at.scale, font, color: INK, rotate: radians(at.angle) });
}

/**
 * Produces the finished PDF. Throws an Error with a readable message when the source cannot be
 * opened for writing (password-protected or damaged); callers show that message as is.
 */
export async function exportPdf(input: ExportInput): Promise<Uint8Array> {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(input.bytes, { updateMetadata: false });
  } catch (cause) {
    const encrypted = /encrypt/i.test(String(cause));
    throw new Error(
      encrypted
        ? 'This PDF is password-protected, so a filled copy cannot be saved from it.'
        : 'This PDF could not be prepared for download. The file may be damaged.',
      { cause },
    );
  }
  // Asking pdf-lib for the form creates one, so flat documents are left without.
  if (doc.catalog.has(PDFName.of('AcroForm'))) {
    applyFormValues(doc, input.formValues);
    settleForm(doc);
  }

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const images = new Map<string, PDFImage>();
  const pages = doc.getPages();
  for (const item of input.items) {
    const page = pages[item.page];
    const info = input.pages[item.page];
    if (page && info) await drawItem(item, page, info, font, images, input);
  }
  return doc.save();
}
