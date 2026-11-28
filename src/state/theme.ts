/**
 * Light / dark appearance. Light is the default; the choice is remembered per browser.
 * index.html applies the saved theme before first paint so there is no flash.
 */
export type Theme = 'light' | 'dark';

const KEY = 'suitup.theme';

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function setTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Not remembered, but still applied for this visit.
  }
}
