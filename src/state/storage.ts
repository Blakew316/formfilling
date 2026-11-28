/**
 * Remembers the signer's details and signatures in this browser only.
 * Reads and writes never throw: private windows and blocked storage just mean nothing is remembered.
 */
import { EMPTY_PROFILE, type Profile } from '../engine/profile';

export interface SavedInk {
  /** PNG data URL, trimmed to the ink. */
  src: string;
  /** Width divided by height. */
  aspect: number;
}

export interface Saved {
  profile: Profile;
  signature: SavedInk | null;
  initials: SavedInk | null;
}

const KEY = 'suitup.v1';
const LEGACY_KEY = 'formfill.v1';

export function loadSaved(): Saved {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY) ?? 'null') as Partial<Saved> | null;
    return {
      profile: { ...EMPTY_PROFILE, ...(raw?.profile ?? {}) },
      signature: raw?.signature ?? null,
      initials: raw?.initials ?? null,
    };
  } catch {
    return { profile: EMPTY_PROFILE, signature: null, initials: null };
  }
}

export function storeSaved(saved: Saved): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    // Storage full or unavailable: the session still works, it just will not be remembered.
  }
}

export function clearSaved(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}
