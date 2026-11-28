/**
 * End-to-end checks of the engine against a generated contract: detect the blanks,
 * decide whose they are, write values into the PDF, then read the result back with
 * the viewer library to confirm the ink landed where the blank was.
 */
import { describe, expect, it } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { ownerOf, planAutofill } from '../src/engine/autofill';
import { classifyBlank } from '../src/engine/classify';
import { detectFields } from '../src/engine/detect';
import { exportPdf } from '../src/engine/exportPdf';
import { EMPTY_PROFILE, formatDate, initialsOf, valueFor, type Profile } from '../src/engine/profile';
import type { Item } from '../src/engine/types';
import { extractDocument, hasSignatureSeal } from '../src/pdf/extract';
import { buildSampleContract } from '../src/sample/sampleContract';

const profile: Profile = {
  ...EMPTY_PROFILE,
  fullName: 'Avery Stone',
  company: 'Lakeside Trading LLC',
  title: 'Managing Member',
  email: 'avery@example.com',
  street: '12 Harbor Road',
  city: 'Austin',
  state: 'TX',
  zip: '78701',
};
const today = new Date(2026, 10, 25);

async function read(bytes: Uint8Array) {
  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  return extractDocument(pdfjs as never, doc as never, bytes);
}

describe('classifyBlank', () => {
  it.each([
    ['By:', '', 'signature'],
    ['Print Name:', '', 'fullName'],
    ['Reseller Name:', '', 'company'],
    ['ISO Name:', '', 'company'],
    ['ISV Legal Name:', '', 'company'],
    ['Partner:', '', 'company'],
    ['Title:', '', 'title'],
    ['executed by', ', its', 'fullName'],
    ['executed by ____, its', 'who represents', 'title'],
    ['and between', '(“RESELLER”), located at', 'company'],
    ['(“RESELLER”), located at', ',', 'address'],
    ['Attn:', '', 'fullName'],
    ['shall be construed as follows:', '', 'unknown'],
  ])('%s … %s is %s', (before, after, kind) => {
    expect(classifyBlank(before, after).kind).toBe(kind);
  });

  it('only suggests an effective date, never fills it unasked', () => {
    expect(classifyBlank('is effective as of', '. (the “Effective Date”)')).toMatchObject({ kind: 'date', confidence: 'suggest' });
    expect(classifyBlank('is made on', '(“Effective Date”)')).toMatchObject({ kind: 'date', confidence: 'suggest' });
  });
});

describe('profile values', () => {
  it('joins the address parts and skips missing ones', () => {
    expect(valueFor('address', profile, today)).toBe('12 Harbor Road, Austin, TX 78701');
    expect(valueFor('cityStateZip', { ...profile, state: '' }, today)).toBe('Austin 78701');
  });
  it('formats dates and initials', () => {
    expect(formatDate(today, 'long')).toBe('November 25, 2026');
    expect(formatDate(today, 'us')).toBe('11/25/2026');
    expect(initialsOf('mary-jane o’neil')).toBe('MJO');
  });
});

describe('sample contract', () => {
  it('finds every blank and names it', async () => {
    const ex = await read(await buildSampleContract());
    const { fields, blocks } = detectFields(ex.texts);
    const page1 = fields.filter((f) => f.page === 0).map((f) => f.kind);
    expect(page1).toEqual(['company', 'date', 'company', 'address', 'fullName', 'title']);
    const page2 = fields.filter((f) => f.page === 1).map((f) => f.kind).sort();
    expect(page2).toEqual(['company', 'company', 'date', 'date', 'fullName', 'signature', 'signature', 'title']);
    expect(blocks).toHaveLength(2);
    expect(fields.filter((f) => f.repeatKey)).toHaveLength(2);
  });

  it('auto-fills the signer’s side and leaves the pre-printed party alone', async () => {
    const ex = await read(await buildSampleContract());
    const { fields, blocks } = detectFields(ex.texts);
    const theirs = fields.filter((f) => ownerOf(f, blocks, profile) === 'other');
    expect(theirs.map((f) => f.kind).sort()).toEqual(['date', 'signature']);
    expect(theirs.every((f) => f.rect.x < 300)).toBe(true);

    const plan = planAutofill({ fields, blocks, profile, today, filled: new Set(), hasSignature: true, hasInitials: false });
    expect(plan.some((a) => theirs.includes(a.field))).toBe(false);
    expect(plan.filter((a) => a.type === 'image')).toHaveLength(1);
    expect(plan.find((a) => a.field.kind === 'date' && a.field.page === 0)).toBeUndefined();
    const texts = plan.flatMap((a) => (a.type === 'text' ? [a.text] : []));
    expect(texts).toContain('Lakeside Trading LLC');
    expect(texts).toContain('12 Harbor Road, Austin, TX 78701');
    expect(texts).toContain('November 25, 2026');
  });

  it('treats a block as the signer’s when the printed name is theirs', async () => {
    const ex = await read(await buildSampleContract());
    const { fields, blocks } = detectFields(ex.texts);
    const dana = { ...profile, fullName: 'Dana Whitfield' };
    const left = fields.find((f) => f.kind === 'signature' && f.rect.x < 300)!;
    expect(ownerOf(left, blocks, dana)).toBe('me');
  });

  it.each([0, 90, 180, 270] as const)('writes upright text at the chosen spot on a page rotated %i°', async (rotate) => {
    const source = await buildSampleContract({ rotate });
    const ex = await read(source);
    const baselineRatio = 0.9;
    const items: Item[] = [
      { id: 't', type: 'text', page: 1, x: 120, y: 300 - 11 * baselineRatio, fontSize: 11, text: 'Managing Member' },
      { id: 'c', type: 'check', page: 0, x: 100, y: 400, size: 12 },
    ];
    const out = await exportPdf({ bytes: source, pages: ex.pages, items, formValues: {}, baselineRatio });
    const written = (await read(out)).texts[1].items.find((it) => it.str === 'Managing Member')!;
    expect(written.x).toBeCloseTo(120, 0);
    expect(written.y).toBeCloseTo(300, 0);
  });

  it('puts text on the detected blank', async () => {
    const source = await buildSampleContract();
    const ex = await read(source);
    const target = detectFields(ex.texts).fields.find((f) => f.page === 1 && f.kind === 'title')!;
    expect(target.rect.x).toBeGreaterThan(350);
    expect(target.rect.x).toBeLessThan(362);
    expect(target.baseline).toBeCloseTo(250, 0);
  });

  it('substitutes characters the built-in font lacks instead of failing', async () => {
    const source = await buildSampleContract();
    const ex = await read(source);
    const items: Item[] = [{ id: 't', type: 'text', page: 0, x: 80, y: 500, fontSize: 11, text: 'Zoë 山田' }];
    const out = await exportPdf({ bytes: source, pages: ex.pages, items, formValues: {}, baselineRatio: 0.9 });
    expect((await read(out)).texts[0].items.some((it) => it.str.startsWith('Zoë ??'))).toBe(true);
  });
});

describe('form fields', () => {
  it('fills, flattens and reports widgets', async () => {
    const { PDFDocument } = await import('@cantoo/pdf-lib');
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 300]);
    const form = doc.getForm();
    form.createTextField('Full Name').addToPage(page, { x: 50, y: 200, width: 200, height: 20 });
    form.createCheckBox('agree').addToPage(page, { x: 50, y: 150, width: 14, height: 14 });
    const source = await doc.save();

    const ex = await read(source);
    expect(ex.widgets.map((w) => [w.type, w.kind])).toEqual([['text', 'fullName'], ['checkbox', 'unknown']]);
    expect(Math.abs(ex.widgets[0].rect.x - 50)).toBeLessThanOrEqual(1);
    expect(Math.abs(ex.widgets[0].rect.y - 80)).toBeLessThanOrEqual(1);

    const out = await exportPdf({
      bytes: source,
      pages: ex.pages,
      items: [],
      formValues: { 'Full Name': 'Avery Stone', agree: 'true' },
      baselineRatio: 0.9,
    });
    const after = await read(out);
    expect(after.widgets).toHaveLength(0);
    expect(after.texts[0].items.map((it) => it.str).join(' ')).toContain('Avery Stone');
    expect(hasSignatureSeal(out)).toBe(false);
  });
});
