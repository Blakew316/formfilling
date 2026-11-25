/**
 * Shared data shapes for the detection and export engine.
 *
 * Every coordinate here is in "page units": PDF points measured from the page's
 * top-left corner as it is displayed (rotation already applied, y grows downward).
 * The engine never touches the DOM or pdf.js, so these types are also what the
 * tests build by hand. The pdf.js glue that produces them lives in src/pdf/.
 */

/** Affine transform in PDF order: x' = a*x + c*y + e, y' = b*x + d*y + f. */
export type Matrix = [number, number, number, number, number, number];

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PageInfo {
  index: number;
  width: number;
  height: number;
  /** Maps PDF user space to page units; captured from the viewer so export and display always agree. */
  viewTransform: Matrix;
}

/** One run of text as the viewer reports it; `y` is the baseline. */
export interface RawTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  fontName: string;
}

/** Advance width of one character in a given font, in any unit that is consistent per font. */
export type CharWidthLookup = (fontName: string, ch: string) => number | undefined;

export type FieldKind =
  | 'fullName'
  | 'company'
  | 'title'
  | 'email'
  | 'phone'
  | 'address'
  | 'street'
  | 'city'
  | 'state'
  | 'zip'
  | 'cityStateZip'
  | 'date'
  | 'signature'
  | 'initials'
  | 'unknown';

/** `auto` is filled by Auto-fill, `suggest` is a guess the person accepts with one click, `none` has no guess. */
export type Confidence = 'auto' | 'suggest' | 'none';

/** Details already printed in a signature block, used to tell whose block it is. */
export interface BlockFacts {
  name?: string;
  email?: string;
  title?: string;
}

export interface SignatureBlock {
  id: string;
  page: number;
  facts: BlockFacts;
}

/** A blank on a flat page that can take text or a signature. */
export interface Field {
  id: string;
  page: number;
  rect: Rect;
  baseline: number;
  fontSize: number;
  kind: FieldKind;
  /** Short human label such as "Name" or "Company"; empty when nothing nearby names the blank. */
  label: string;
  confidence: Confidence;
  source: 'underscore' | 'label';
  blockId?: string;
  /** Shared by blanks that sit at the same spot on several pages, such as a running header. */
  repeatKey?: string;
}

export type WidgetType = 'text' | 'checkbox' | 'radio' | 'select';

/** An interactive form field that the PDF itself defines. */
export interface FormWidget {
  id: string;
  page: number;
  rect: Rect;
  name: string;
  type: WidgetType;
  kind: FieldKind;
  label: string;
  value: string;
  /** For checkboxes and radio buttons: the value this particular widget stands for. */
  exportValue?: string;
  options?: { value: string; label: string }[];
  multiline?: boolean;
  maxLength?: number;
  readOnly?: boolean;
  fontSize?: number;
}

export interface TextItem {
  id: string;
  type: 'text';
  page: number;
  x: number;
  /** Top of the text box; the baseline is derived from the font metrics. */
  y: number;
  fontSize: number;
  text: string;
  fieldId?: string;
}

export interface ImageItem {
  id: string;
  type: 'image';
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** PNG data URL. */
  src: string;
  role: 'signature' | 'initials';
  fieldId?: string;
}

export interface CheckItem {
  id: string;
  type: 'check';
  page: number;
  x: number;
  y: number;
  size: number;
  fieldId?: string;
}

export type Item = TextItem | ImageItem | CheckItem;

export interface Detection {
  fields: Field[];
  blocks: SignatureBlock[];
}
