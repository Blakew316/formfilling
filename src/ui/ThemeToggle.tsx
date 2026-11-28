/** Switches between the light and dark appearance. */
import { useState } from 'react';
import { currentTheme, setTheme, type Theme } from '../state/theme';
import { Icon } from './Icons';

export function ThemeToggle() {
  const [theme, set] = useState<Theme>(currentTheme);
  const next: Theme = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      className="icon-button"
      aria-label={next === 'dark' ? 'Dark mode' : 'Light mode'}
      title={next === 'dark' ? 'Dark mode' : 'Light mode'}
      onClick={() => {
        setTheme(next);
        set(next);
      }}
    >
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
    </button>
  );
}
