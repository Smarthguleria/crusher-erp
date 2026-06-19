'use client';

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';

type Theme = 'light' | 'dark';

interface ThemeCtx {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

const STORAGE_KEY = 'crusher_theme';

// Inline script injected into <head> so the correct theme is applied BEFORE first
// paint — prevents a white flash on dark-mode reload. Kept tiny and dependency-free.
export const themeBootScript = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}');if(!t){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('light');

  // Sync React state with whatever the boot script already applied to <html>.
  useEffect(() => {
    const current = (document.documentElement.getAttribute('data-theme') as Theme) || 'light';
    setThemeState(current);
  }, []);

  const apply = useCallback((t: Theme) => {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem(STORAGE_KEY, t); } catch {}
    setThemeState(t);
  }, []);

  const toggle = useCallback(() => {
    apply(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  }, [apply]);

  return <Ctx.Provider value={{ theme, toggle, setTheme: apply }}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
