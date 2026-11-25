/**
 * Chooses which detected blanks Auto-fill may complete without asking.
 *
 * The rule is "confident or nothing": a blank is filled only when its meaning is
 * clear and it does not sit in someone else's signature block. Everything else
 * stays a one-click suggestion in the UI. A signature on the counterparty's line
 * is a worse outcome than an empty blank.
 */
import { valueFor, type Profile } from './profile';
import type { Field, FormWidget, SignatureBlock } from './types';

export type Owner = 'me' | 'other' | 'unknown';

function same(a: string | undefined, b: string): boolean {
  return !!a && !!b.trim() && a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Says whose signature block a blank belongs to.
 * A block with a printed name, title or email is someone else's unless that name or email is the signer's own.
 * A block with nothing printed is the signer's only when it is the single such block on its page.
 */
export function ownerOf(field: Field, blocks: SignatureBlock[], profile: Profile): Owner {
  if (!field.blockId) return 'me';
  const block = blocks.find((b) => b.id === field.blockId);
  if (!block) return 'me';
  const { name, email, title } = block.facts;
  if (same(name, profile.fullName) || same(email, profile.email)) return 'me';
  if (name || email || title) return 'other';
  const openBlocks = blocks.filter((b) => b.page === block.page && !b.facts.name && !b.facts.email && !b.facts.title);
  return openBlocks.length === 1 ? 'me' : 'unknown';
}

export type FillAction =
  | { type: 'text'; field: Field; text: string }
  | { type: 'image'; field: Field; role: 'signature' | 'initials' };

export interface AutofillInput {
  fields: Field[];
  blocks: SignatureBlock[];
  profile: Profile;
  today: Date;
  /** Blanks that already hold something and must be left alone. */
  filled: Set<string>;
  hasSignature: boolean;
  hasInitials: boolean;
}

/** Lists the fills Auto-fill should make. Blanks the profile has no answer for are skipped, not filled with placeholders. */
export function planAutofill(input: AutofillInput): FillAction[] {
  const actions: FillAction[] = [];
  for (const field of input.fields) {
    if (field.confidence !== 'auto' || input.filled.has(field.id)) continue;
    if (ownerOf(field, input.blocks, input.profile) !== 'me') continue;
    if (field.kind === 'signature') {
      if (input.hasSignature) actions.push({ type: 'image', field, role: 'signature' });
    } else if (field.kind === 'initials') {
      if (input.hasInitials) actions.push({ type: 'image', field, role: 'initials' });
    } else {
      const text = valueFor(field.kind, input.profile, input.today);
      if (text) actions.push({ type: 'text', field, text });
    }
  }
  return actions;
}

/** Values for the PDF's own text form fields, keyed by field name. Fields that already have a value are kept. */
export function planFormFill(
  widgets: FormWidget[],
  current: Record<string, string>,
  profile: Profile,
  today: Date,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const w of widgets) {
    if (w.type !== 'text' || w.readOnly || w.kind === 'unknown') continue;
    if ((current[w.name] ?? w.value).trim()) continue;
    const text = valueFor(w.kind, profile, today);
    if (text) out[w.name] = text;
  }
  return out;
}
