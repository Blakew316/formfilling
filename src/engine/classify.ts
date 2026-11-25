/**
 * Decides what a blank is asking for from the words around it.
 *
 * Pure text rules, no geometry. `classifyBlank` is used both for blanks on flat
 * pages and for form widgets (where the "label" is the field's tooltip or name).
 */
import type { Confidence, FieldKind } from './types';

export interface Classification {
  kind: FieldKind;
  confidence: Confidence;
  /** Short label for the UI. */
  label: string;
  /** True when the rule read running prose rather than a form-style label. */
  prose: boolean;
  /** The defined term when the blank is followed by one, e.g. RESELLER in `____ ("RESELLER")`. */
  partyTerm?: string;
}

const DISPLAY: Record<FieldKind, string> = {
  fullName: 'Name',
  company: 'Company',
  title: 'Title',
  email: 'Email',
  phone: 'Phone',
  address: 'Address',
  street: 'Street',
  city: 'City',
  state: 'State',
  zip: 'ZIP',
  cityStateZip: 'City, State ZIP',
  date: 'Date',
  signature: 'Signature',
  initials: 'Initials',
  unknown: '',
};

export function kindLabel(kind: FieldKind): string {
  return DISPLAY[kind];
}

const COMPANY_WORDS =
  'company|business|legal|entity|reseller|merchant|organi[sz]ation|firm|corporate|corporation|dba|vendor|distributor|partner|employer|contractor|supplier|licensee';

/** Matches a short form-style label such as "Print Name" or "Reseller Name". */
function classifyLabel(raw: string): FieldKind {
  const label = raw
    .toLowerCase()
    .replace(/[_:*.\s]+$/g, '')
    .replace(/^[\s(*]+/, '')
    .trim();
  if (!label || label.length > 40) return 'unknown';
  if (/\binitial/.test(label)) return 'initials';
  if (/\b(signature|sign here|signed|signatory)\b/.test(label) || /^(x|by)$/.test(label)) return 'signature';
  if (/e-?mail/.test(label)) return 'email';
  if (/\b(phone|telephone|tel|mobile|cell)\b/.test(label)) return 'phone';
  if (/\bfax\b/.test(label)) return 'unknown';
  if (/\bcity\b.*\b(state|st)\b/.test(label)) return 'cityStateZip';
  if (/\bcity\b/.test(label)) return 'city';
  if (/\b(zip|postal)\b/.test(label)) return 'zip';
  if (/^state\b|\bstate$/.test(label)) return 'state';
  if (/\bstreet\b|address line 1/.test(label)) return 'street';
  if (/\baddress\b/.test(label)) return 'address';
  if (/\b(date|dated)\b/.test(label)) return 'date';
  if (/\b(print(ed)? name|full name|your name|signer|attn|attention)\b/.test(label)) return 'fullName';
  if (new RegExp(`\\b(${COMPANY_WORDS})\\b`).test(label)) return 'company';
  if (/\bname$/.test(label)) return 'fullName';
  if (/\b(title|position)$/.test(label) || label === 'its') return 'title';
  return 'unknown';
}

const DEFINED_TERM = /^\s*\(\s*(?:the\s+)?[“"'‘]\s*([A-Za-z][A-Za-z .&-]{1,40}?)\s*[”"'’]/;

/**
 * Classifies a blank from the text just before it (`before`) and just after it (`after`).
 * Effective-date blanks are only ever suggested, because that date is a negotiated term
 * rather than something the signer's saved details can answer.
 */
export function classifyBlank(before: string, after: string): Classification {
  const pre = before.replace(/\s+/g, ' ').trimEnd();
  const lower = pre.toLowerCase();
  const make = (kind: FieldKind, confidence: Confidence, prose: boolean, partyTerm?: string): Classification => ({
    kind,
    confidence: kind === 'unknown' ? 'none' : confidence,
    label: DISPLAY[kind],
    prose,
    partyTerm,
  });

  const term = DEFINED_TERM.exec(after)?.[1];
  if (term) {
    if (/date/i.test(term)) return make('date', 'suggest', true);
    if (!/^[“"'‘_]/.test(after.trim().slice(1))) return make('company', 'auto', true, term.toUpperCase());
  }
  // The full legal name, directly followed by a quoted short-name blank.
  if (/^\s*\(\s*[“"'‘]\s*$/.test(after)) return make('company', 'auto', true);
  // A short name in quotes right after the party's full name: ____ ("____" or "RESELLER").
  if (/\(\s*[“"'‘]$/.test(pre) && /^\s*[”"'’]\s*or\b/i.test(after)) {
    const role = /or\s*[“"'‘]\s*([A-Za-z ]{2,30}?)\s*[”"'’]/i.exec(after)?.[1];
    return make('company', 'auto', true, role?.toUpperCase());
  }
  if (/\b(located at|address (of|is)|offices? at|place of business at|residing at)$/.test(lower)) {
    return make('address', 'auto', true);
  }
  if (/\b(executed|represented|signed) by$/.test(lower)) return make('fullName', 'auto', true);
  if (/[,\s]its$/.test(lower) && pre.length > 5) return make('title', 'auto', true);
  if (/\b(effective as of|effective on|made on|made as of|dated as of|dated|entered into on|entered into as of|as of)$/.test(lower)) {
    return make('date', 'suggest', true);
  }
  if (/\bbetween$/.test(lower)) return make('company', 'auto', true);

  // Form-style label: the last few words before the blank, usually ending in a colon.
  const tail = pre.split(/(?<=[.;,)])\s+/).pop() ?? pre;
  const kind = classifyLabel(tail);
  if (kind !== 'unknown') return make(kind, 'auto', false);

  if (/\band$/.test(lower) && /^\s*(are|is|entered|have|has|hereby|agree)\b/i.test(after)) {
    return make('company', 'suggest', true);
  }
  return make('unknown', 'none', false);
}
