import { create } from 'zustand';

export type EngineKind = 'stockfish' | 'kallpa' | 'uci';

export interface EngineCfg {
  id:      string;
  name:    string;
  kind:    EngineKind;
  version: string;
  elo:     number;
  threads: number;
  hash:    number;
  builtin: boolean;       // no se puede borrar
  path?:   string;        // ruta al .exe (motores UCI externos)
}

const DEFAULTS: EngineCfg[] = [
  { id: 'stockfish', name: 'Stockfish', kind: 'stockfish', version: '18', elo: 3635, threads: 1, hash: 256, builtin: true },
  { id: 'kallpa',    name: 'KallpaModulo (tesis)', kind: 'kallpa', version: 'C++ v8', elo: 0, threads: 1, hash: 16, builtin: true },
];

interface EnginesStore {
  engines:  EngineCfg[];
  activeId: string;
  load:      () => void;
  setActive: (id: string) => void;
  update:    (id: string, patch: Partial<EngineCfg>) => void;
  add:       (name: string, path: string) => string;
  remove:    (id: string) => void;
  active:    () => EngineCfg | undefined;
}

const LS = 'kallpa_engines';
function persist(s: { engines: EngineCfg[]; activeId: string }) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(LS, JSON.stringify(s)); } catch { /* noop */ }
}
function uid() { return 'eng' + Math.random().toString(36).slice(2, 9); }

export const useEnginesStore = create<EnginesStore>((set, get) => ({
  engines:  DEFAULTS,
  activeId: 'stockfish',

  load: () => {
    if (typeof window === 'undefined') return;
    try {
      const raw = JSON.parse(localStorage.getItem(LS) || 'null');
      if (raw && Array.isArray(raw.engines)) {
        const byId = new Map<string, EngineCfg>(raw.engines.map((e: EngineCfg) => [e.id, e]));
        const builtins = DEFAULTS.map((d) => {
          const p = byId.get(d.id);
          return { ...d, threads: p?.threads ?? d.threads, hash: p?.hash ?? d.hash, elo: p?.elo ?? d.elo };
        });
        const customs = raw.engines.filter((e: EngineCfg) => !DEFAULTS.some((d) => d.id === e.id));
        set({ engines: [...builtins, ...customs], activeId: raw.activeId || 'stockfish' });
      }
    } catch { /* noop */ }
  },

  setActive: (activeId) => { persist({ engines: get().engines, activeId }); set({ activeId }); },
  update: (id, patch) => set((s) => {
    const engines = s.engines.map((e) => e.id === id ? { ...e, ...patch } : e);
    persist({ engines, activeId: s.activeId });
    return { engines };
  }),
  add: (name, path) => {
    const id = uid();
    const eng: EngineCfg = { id, name: name || 'Motor UCI', kind: 'uci', version: 'UCI', elo: 0, threads: 1, hash: 256, builtin: false, path };
    set((s) => { const engines = [...s.engines, eng]; persist({ engines, activeId: s.activeId }); return { engines }; });
    return id;
  },
  remove: (id) => set((s) => {
    const eng = s.engines.find((e) => e.id === id);
    if (!eng || eng.builtin) return {};
    const engines = s.engines.filter((e) => e.id !== id);
    const activeId = s.activeId === id ? 'stockfish' : s.activeId;
    persist({ engines, activeId });
    return { engines, activeId };
  }),
  active: () => get().engines.find((e) => e.id === get().activeId),
}));
