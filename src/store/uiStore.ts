import { create } from 'zustand';

export type Theme = 'dark' | 'light';

export const BOARD_THEMES = {
  verde:   { light: '#eeeed2', dark: '#769656' },
  marron:  { light: '#f0d9b5', dark: '#b58863' },
  azul:    { light: '#dee3e6', dark: '#8ca2ad' },
  gris:    { light: '#dcdcdc', dark: '#8f8f8f' },
  madera:  { light: '#e8c99b', dark: '#9b6b43' },
  morado:  { light: '#e6e1f0', dark: '#9f90c0' },
} as const;

export type BoardTheme = keyof typeof BOARD_THEMES;

interface UiStore {
  theme:       Theme;
  boardTheme:  BoardTheme;
  sound:       boolean;
  coords:      boolean;
  setTheme:      (t: Theme) => void;
  toggleTheme:   () => void;
  setBoardTheme: (b: BoardTheme) => void;
  setSound:      (v: boolean) => void;
  setCoords:     (v: boolean) => void;
  hydrate:       () => void;
}

function applyTheme(t: Theme) {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('theme', t); } catch { /* noop */ }
  }
}
function save(k: string, v: string) {
  if (typeof window !== 'undefined') { try { localStorage.setItem(k, v); } catch { /* noop */ } }
}

// Defaults deterministas para SSR + primer render del cliente (evita mismatch de
// hidratación). Los valores persistidos se cargan en hydrate() tras montar.
export const useUiStore = create<UiStore>((set, get) => ({
  theme:      'dark',
  boardTheme: 'verde',
  sound:      true,
  coords:     true,

  setTheme: (theme) => { applyTheme(theme); set({ theme }); },
  toggleTheme: () => { const t = get().theme === 'dark' ? 'light' : 'dark'; applyTheme(t); set({ theme: t }); },
  setBoardTheme: (boardTheme) => { save('boardTheme', boardTheme); set({ boardTheme }); },
  setSound:  (sound)  => { save('sound', sound ? '1' : '0'); set({ sound }); },
  setCoords: (coords) => { save('coords', coords ? '1' : '0'); set({ coords }); },

  hydrate: () => {
    if (typeof window === 'undefined') return;
    try {
      const t = localStorage.getItem('theme') as Theme | null;
      const b = localStorage.getItem('boardTheme') as BoardTheme | null;
      const patch: Partial<UiStore> = {};
      if (t === 'dark' || t === 'light') { applyTheme(t); patch.theme = t; }
      if (b && b in BOARD_THEMES) patch.boardTheme = b;
      const snd = localStorage.getItem('sound'); if (snd !== null) patch.sound = snd === '1';
      const co  = localStorage.getItem('coords'); if (co !== null) patch.coords = co === '1';
      if (Object.keys(patch).length) set(patch);
    } catch { /* noop */ }
  },
}));

export function boardColors(b: BoardTheme) {
  return BOARD_THEMES[b] ?? BOARD_THEMES.verde;
}
