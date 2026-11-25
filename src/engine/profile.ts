/**
 * The signer's saved details and how they turn into text for each kind of blank.
 *
 * Storage of the profile is the UI's job (src/state/storage.ts); this file only
 * defines the shape and the formatting rules, so it can be tested without a browser.
 */
import type { FieldKind } from './types';

export type DateFormat = 'long' | 'us' | 'iso';

export interface Profile {
  fullName: string;
  company: string;
  title: string;
  email: string;
  phone: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  dateFormat: DateFormat;
}

export const EMPTY_PROFILE: Profile = {
  fullName: '',
  company: '',
  title: '',
  email: '',
  phone: '',
  street: '',
  city: '',
  state: '',
  zip: '',
  dateFormat: 'long',
};

/** Formats in the signer's local time zone, since "today" on a contract means their today. */
export function formatDate(date: Date, format: DateFormat): string {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  if (format === 'iso') return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  if (format === 'us') return `${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}/${y}`;
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function initialsOf(fullName: string): string {
  return fullName
    .split(/[\s-]+/)
    .filter((part) => /^\p{L}/u.test(part))
    .map((part) => part[0].toUpperCase())
    .join('');
}

function cityStateZip(p: Profile): string {
  const left = [p.city, p.state].filter(Boolean).join(', ');
  return [left, p.zip].filter(Boolean).join(' ');
}

/** Returns the text for a blank, or '' when the profile cannot answer it (signatures and initials are images, not text). */
export function valueFor(kind: FieldKind, profile: Profile, today: Date): string {
  switch (kind) {
    case 'fullName':
    case 'company':
    case 'title':
    case 'email':
    case 'phone':
    case 'street':
    case 'city':
    case 'state':
    case 'zip':
      return profile[kind].trim();
    case 'cityStateZip':
      return cityStateZip(profile);
    case 'address':
      return [profile.street.trim(), cityStateZip(profile)].filter(Boolean).join(', ');
    case 'date':
      return formatDate(today, profile.dateFormat);
    default:
      return '';
  }
}

/** Which profile field a typed value should be remembered under; undefined for kinds built from several fields. */
export function profileKeyFor(kind: FieldKind): keyof Omit<Profile, 'dateFormat'> | undefined {
  const direct: FieldKind[] = ['fullName', 'company', 'title', 'email', 'phone', 'street', 'city', 'state', 'zip'];
  return direct.includes(kind) ? (kind as keyof Omit<Profile, 'dateFormat'>) : undefined;
}
