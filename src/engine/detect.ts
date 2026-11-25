/**
 * Finds the blanks on flat (non-interactive) pages and works out what each wants.
 *
 * Two kinds of blank are recognised: runs of underscores, and a known label
 * followed by empty space ("Date:" with nothing after it). Lines drawn as
 * vector graphics are not read, so an unlabelled drawn rule is not detected.
 * Input comes from src/pdf/extract.ts; results feed autofill.ts and the UI.
 */
import { classifyBlank, kindLabel } from './classify';
import { buildSegments } from './textModel';
import type { CharWidthLookup, Detection, Field, FieldKind, RawTextItem, SignatureBlock } from './types';

export interface PageText {
  width: number;
  height: number;
  items: RawTextItem[];
  charWidth?: CharWidthLookup;
}

interface Fact {
  kind: FieldKind;
  value: string;
  column: number;
  baseline: number;
}

interface Candidate extends Field {
  column: number;
  prose: boolean;
  partyTerm?: string;
  before: string;
  /** True when the label came from a separate cell to the left rather than the blank's own text. */
  fromRow: boolean;
}

const MIN_FREE_SPACE = 60;
const BLOCK_KINDS: FieldKind[] = ['signature', 'fullName', 'title', 'date', 'email', 'company'];

function detectPage(page: PageText, pageIndex: number): { fields: Candidate[]; facts: Fact[] } {
  const segments = buildSegments(page.items, page.charWidth);
  const textRight = Math.min(
    page.width - 36,
    Math.max(page.width - 72, ...segments.map((s) => s.right)),
  );
  const fields: Candidate[] = [];
  const facts: Fact[] = [];
  let n = 0;

  segments.forEach((seg, i) => {
    const prev = segments[i - 1];
    const next = segments[i + 1];
    const leftNeighbour = prev && prev.line === seg.line ? prev : undefined;
    const rightNeighbour = next && next.line === seg.line ? next : undefined;
    const lineAbove = !leftNeighbour && prev && seg.baseline - prev.baseline < seg.fontSize * 2 ? prev.text : '';
    const lineBelow = !rightNeighbour && next && next.baseline - seg.baseline < seg.fontSize * 2 ? next.text : '';

    const runs = [...seg.text.matchAll(/_{3,}/g)];
    runs.forEach((run, r) => {
      const start = run.index;
      const end = start + run[0].length;
      const labelStart = r > 0 ? runs[r - 1].index + runs[r - 1][0].length : 0;
      const afterEnd = r < runs.length - 1 ? runs[r + 1].index : seg.text.length;
      let before = seg.text.slice(labelStart, start);
      const own = before.trim();
      const fromRow = !own && labelStart === 0 && !!leftNeighbour;
      if (fromRow) before = leftNeighbour!.text;
      else if (labelStart === 0) before = `${lineAbove} ${before}`;
      let after = seg.text.slice(end, afterEnd);
      if (afterEnd === seg.text.length && !after.trim()) after = lineBelow;
      const c = classifyBlank(before, after);
      const x = seg.x0[start];
      fields.push({
        id: `p${pageIndex}-f${n++}`,
        page: pageIndex,
        rect: { x, y: seg.baseline - seg.fontSize * 0.95, w: seg.x1[end - 1] - x, h: seg.fontSize * 1.25 },
        baseline: seg.baseline,
        fontSize: seg.fontSize,
        kind: c.kind,
        label: c.label,
        confidence: c.confidence,
        source: 'underscore',
        column: seg.left,
        prose: c.prose,
        partyTerm: c.partyTerm,
        before: fromRow ? before.trim() : own,
        fromRow,
      });
    });

    // A label with a value already printed after it tells us whose signature block this is.
    const printed = /^\s*([A-Za-z][A-Za-z -]{1,20})\s*:\s*([^_\s][^_]*)$/.exec(seg.text);
    if (printed) {
      const kind = classifyBlank(`${printed[1]}:`, '').kind;
      if (kind !== 'unknown') facts.push({ kind, value: printed[2].trim(), column: seg.left, baseline: seg.baseline });
    }

    // Label followed by nothing: either a value sits in the next column, or it is a blank.
    const lastRun = runs[runs.length - 1];
    const tail = seg.text.slice(lastRun ? lastRun.index + lastRun[0].length : 0);
    const trailing = /^\s*([A-Za-z][A-Za-z./-]*(?: [A-Za-z./-]+){0,2}):\s*$/.exec(tail);
    if (!trailing || rightNeighbour?.text.startsWith('_')) return;
    const c = classifyBlank(`${trailing[1]}:`, '');
    if (c.kind === 'unknown') return;
    const limit = rightNeighbour ? rightNeighbour.left : textRight;
    const free = limit - seg.right;
    if (free < MIN_FREE_SPACE) {
      if (rightNeighbour && !rightNeighbour.text.includes('_')) {
        facts.push({ kind: c.kind, value: rightNeighbour.text.trim(), column: seg.left, baseline: seg.baseline });
      }
      return;
    }
    fields.push({
      id: `p${pageIndex}-f${n++}`,
      page: pageIndex,
      rect: {
        x: seg.right + 4,
        y: seg.baseline - seg.fontSize * 0.95,
        w: Math.min(free - 10, 180),
        h: seg.fontSize * 1.25,
      },
      baseline: seg.baseline,
      fontSize: seg.fontSize,
      kind: c.kind,
      label: c.label,
      confidence: c.confidence,
      source: 'label',
      column: seg.left,
      prose: false,
      before: trailing[1],
      fromRow: false,
    });
  });

  return { fields, facts };
}

function setKind(f: Candidate, kind: FieldKind, confidence: Candidate['confidence']): void {
  f.kind = kind;
  f.label = kindLabel(kind);
  f.confidence = confidence;
}

/** Names the unlabelled blanks whose meaning comes from their position: party headers and address stacks. */
function inferFromLayout(fields: Candidate[]): void {
  const unknown = fields.filter((f) => f.kind === 'unknown');
  for (const f of unknown) {
    const sigBelow = fields.some(
      (s) =>
        s.kind === 'signature' &&
        Math.abs(s.column - f.rect.x) < 20 &&
        s.baseline > f.baseline &&
        s.baseline - f.baseline < 48,
    );
    if (sigBelow) setKind(f, 'company', 'auto');
  }
  // A labelled row followed by bare blanks directly beneath it is a postal address block.
  for (const first of fields) {
    if (!first.fromRow || first.source !== 'underscore' || first.prose) continue;
    const stack = [first];
    for (;;) {
      const last = stack[stack.length - 1];
      const below = fields.find(
        (f) =>
          f.kind === 'unknown' &&
          !f.before &&
          Math.abs(f.rect.x - last.rect.x) < 3 &&
          f.baseline > last.baseline &&
          f.baseline - last.baseline < last.fontSize * 2,
      );
      if (!below) break;
      stack.push(below);
    }
    const plan: FieldKind[] | undefined =
      stack.length === 3 ? ['company', 'street', 'cityStateZip'] : stack.length === 2 ? ['company', 'address'] : undefined;
    plan?.forEach((kind, i) => setKind(stack[i], kind, 'auto'));
  }
}

/** Groups form-style rows under each signature line and records what is already printed there. */
function buildBlocks(fields: Candidate[], facts: Fact[], pageIndex: number): SignatureBlock[] {
  const blocks: SignatureBlock[] = [];
  const rows = fields.filter((f) => !f.prose && BLOCK_KINDS.includes(f.kind));
  const signatures = rows.filter((f) => f.kind === 'signature').sort((a, b) => a.baseline - b.baseline);
  signatures.forEach((sig, i) => {
    const sameColumn = (column: number) => Math.abs(column - sig.column) < 24;
    const nextSig = signatures.find((s, j) => j > i && sameColumn(s.column));
    const bottom = Math.min(nextSig ? nextSig.baseline - 30 : Infinity, sig.baseline + 200);
    const inBlock = (baseline: number) => baseline > sig.baseline - 48 && baseline < bottom;
    const id = `p${pageIndex}-b${i}`;
    const block: SignatureBlock = { id, page: pageIndex, facts: {} };
    for (const row of rows) {
      const column = row.source === 'underscore' && !row.before ? row.rect.x : row.column;
      if (sameColumn(column) && inBlock(row.baseline) && !row.blockId) row.blockId = id;
    }
    for (const fact of facts) {
      if (!sameColumn(fact.column) || !inBlock(fact.baseline)) continue;
      if (fact.kind === 'fullName') block.facts.name = fact.value;
      if (fact.kind === 'email') block.facts.email = fact.value;
      if (fact.kind === 'title') block.facts.title = fact.value;
    }
    blocks.push(block);
  });
  return blocks;
}

/**
 * Detects every fillable blank in a flat document.
 * When the text defines more than one blank party (a template with two sides to fill in),
 * guesses read from prose are downgraded to suggestions, since either side could be the signer.
 */
export function detectFields(pages: PageText[]): Detection {
  const all: Candidate[] = [];
  const blocks: SignatureBlock[] = [];
  pages.forEach((page, pageIndex) => {
    const { fields, facts } = detectPage(page, pageIndex);
    inferFromLayout(fields);
    blocks.push(...buildBlocks(fields, facts, pageIndex));
    all.push(...fields);
  });

  const parties = new Set(all.map((f) => f.partyTerm).filter(Boolean));
  if (parties.size > 1) {
    for (const f of all) if (f.prose && f.confidence === 'auto') f.confidence = 'suggest';
  }

  // Blanks that recur at the same spot across pages are one running header or footer.
  const groups = new Map<string, Candidate[]>();
  for (const f of all) {
    const key = `${Math.round(f.rect.x)}|${Math.round(f.baseline)}|${f.source}`;
    groups.set(key, [...(groups.get(key) ?? []), f]);
  }
  for (const [key, group] of groups) {
    if (new Set(group.map((f) => f.page)).size < 2) continue;
    for (const f of group) {
      f.repeatKey = key;
      if (f.kind === 'unknown' && parties.size === 1) setKind(f, 'company', 'suggest');
    }
  }

  const fields: Field[] = all.map(({ column: _c, prose: _p, partyTerm: _t, before: _b, fromRow: _r, ...field }) => field);
  return { fields, blocks };
}
