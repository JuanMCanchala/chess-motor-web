import { create } from 'zustand';
import { buildIndex, DbIndex } from '@/lib/openingIndex';

export interface LocalDb { id: string; name: string; games: number; index: DbIndex; }

interface DatabasesStore {
  dbs: LocalDb[];
  load:   () => void;
  add:    (name: string, pgn: string) => { ok: boolean; games: number };
  remove: (id: string) => void;
  get:    (id: string) => LocalDb | undefined;
}

const LS = 'kallpa_databases';
function persist(dbs: LocalDb[]) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(LS, JSON.stringify(dbs)); }
  catch { /* índice demasiado grande para localStorage: queda solo en memoria */ }
}
function uid() { return 'db' + Math.random().toString(36).slice(2, 9); }

export const useDatabasesStore = create<DatabasesStore>((set, get) => ({
  dbs: [],

  load: () => {
    if (typeof window === 'undefined') return;
    try {
      const raw = JSON.parse(localStorage.getItem(LS) || '[]');
      if (Array.isArray(raw)) set({ dbs: raw });
    } catch { /* noop */ }
  },

  add: (name, pgn) => {
    const { index, games } = buildIndex(pgn);
    if (games === 0) return { ok: false, games: 0 };
    const db: LocalDb = { id: uid(), name: name || `Base (${games})`, games, index };
    const dbs = [...get().dbs, db];
    persist(dbs);
    set({ dbs });
    return { ok: true, games };
  },

  remove: (id) => { const dbs = get().dbs.filter((d) => d.id !== id); persist(dbs); set({ dbs }); },
  get: (id) => get().dbs.find((d) => d.id === id),
}));
