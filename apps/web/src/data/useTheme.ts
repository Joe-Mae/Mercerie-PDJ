import { useCallback, useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'mercerie:theme';
const THEME_COLORS: Record<Theme, string> = {
  dark: '#070d18',
  light: '#f6f2e9',
};

function readTheme(): Theme {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

let current = readTheme();
const listeners = new Set<() => void>();

function apply(theme: Theme): void {
  current = theme;
  document.documentElement.dataset['theme'] = theme;

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', THEME_COLORS[theme]);
  }

  for (const listener of listeners) {
    listener();
  }
}

apply(current);

window.addEventListener('storage', (event) => {
  if (event.key === STORAGE_KEY) {
    apply(event.newValue === 'light' ? 'light' : 'dark');
  }
});

export function useTheme(): {
  readonly theme: Theme;
  readonly toggle: () => void;
} {
  const [theme, setTheme] = useState(current);

  useEffect(() => {
    const update = () => {
      setTheme(current);
    };

    listeners.add(update);
    update();
    return () => {
      listeners.delete(update);
    };
  }, []);

  const toggle = useCallback(() => {
    const next: Theme = current === 'dark' ? 'light' : 'dark';
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Sans stockage local, le choix vaut jusqu’à la fermeture de l’application.
    }
    apply(next);
  }, []);

  return { theme, toggle };
}
