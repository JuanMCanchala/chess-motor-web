import { create } from 'zustand';
import { TreeSnapshot } from './treeStore';
import { emptySnapshot } from './studyStore';

export interface BoardTab { id: string; title: string; snap: TreeSnapshot; }

interface BoardsStore {
  tabs:     BoardTab[];
  activeId: string;
  ensureOne:  (snap: TreeSnapshot) => void;
  add:        (snap: TreeSnapshot) => string;
  select:     (id: string) => void;
  close:      (id: string) => string | null;   // devuelve el id a cargar (o null)
  saveActive: (snap: TreeSnapshot) => void;
  rename:     (id: string, title: string) => void;
  active:     () => BoardTab | undefined;
}

let _n = 0;
function uid() { _n += 1; return 'b' + _n + Math.random().toString(36).slice(2, 5); }

export const useBoardsStore = create<BoardsStore>((set, get) => ({
  tabs: [],
  activeId: '',

  ensureOne: (snap) => {
    if (get().tabs.length === 0) {
      const id = uid();
      set({ tabs: [{ id, title: 'Tablero 1', snap }], activeId: id });
    }
  },

  add: (snap) => {
    const id = uid();
    set((s) => ({ tabs: [...s.tabs, { id, title: `Tablero ${s.tabs.length + 1}`, snap }], activeId: id }));
    return id;
  },

  select: (id) => set({ activeId: id }),

  close: (id) => {
    const { tabs, activeId } = get();
    if (tabs.length <= 1) return null;          // no cerrar la última
    const idx = tabs.findIndex((t) => t.id === id);
    const next = tabs.filter((t) => t.id !== id);
    let newActive = activeId;
    if (activeId === id) newActive = (next[idx] || next[idx - 1] || next[0]).id;
    set({ tabs: next, activeId: newActive });
    return newActive === activeId ? null : newActive;
  },

  saveActive: (snap) => set((s) => ({
    tabs: s.tabs.map((t) => t.id === s.activeId ? { ...t, snap } : t),
  })),

  rename: (id, title) => set((s) => ({ tabs: s.tabs.map((t) => t.id === id ? { ...t, title } : t) })),

  active: () => get().tabs.find((t) => t.id === get().activeId),
}));

export { emptySnapshot };
