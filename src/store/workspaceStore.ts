import { create } from 'zustand';
import { TreeSnapshot } from './treeStore';
import { emptySnapshot } from './studyStore';

export type TabType = 'home' | 'analysis' | 'play';

export interface WTab {
  id:    string;
  type:  TabType;
  title: string;
  snap:  TreeSnapshot;     // estado del árbol (análisis); home/play también lo guardan inerte
  fen?:  string;           // para "jugar desde aquí"
}

interface WorkspaceStore {
  tabs:     WTab[];
  activeId: string;
  ensureOne:   () => void;
  active:      () => WTab | undefined;
  newTab:      () => string;                              // nueva pestaña "home"
  select:      (id: string) => void;
  close:       (id: string) => void;
  rename:      (id: string, title: string) => void;
  setType:     (id: string, type: TabType, title?: string, fen?: string) => void;
  saveSnap:    (id: string, snap: TreeSnapshot) => void;
}

let _n = 0;
function uid() { _n += 1; return 'w' + _n + Math.random().toString(36).slice(2, 5); }

const TITLES: Record<TabType, string> = { home: 'Nueva pestaña', analysis: 'Análisis', play: 'Partida' };

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  tabs: [],
  activeId: '',

  ensureOne: () => {
    if (get().tabs.length === 0) {
      const id = uid();
      set({ tabs: [{ id, type: 'home', title: TITLES.home, snap: emptySnapshot() }], activeId: id });
    }
  },

  active: () => get().tabs.find((t) => t.id === get().activeId),

  newTab: () => {
    const id = uid();
    set((s) => ({ tabs: [...s.tabs, { id, type: 'home', title: TITLES.home, snap: emptySnapshot() }], activeId: id }));
    return id;
  },

  select: (id) => set({ activeId: id }),

  close: (id) => set((s) => {
    if (s.tabs.length <= 1) return {};               // nunca cerrar la última
    const idx = s.tabs.findIndex((t) => t.id === id);
    const tabs = s.tabs.filter((t) => t.id !== id);
    let activeId = s.activeId;
    if (s.activeId === id) activeId = (tabs[idx] || tabs[idx - 1] || tabs[0]).id;
    return { tabs, activeId };
  }),

  rename: (id, title) => set((s) => ({ tabs: s.tabs.map((t) => t.id === id ? { ...t, title } : t) })),

  setType: (id, type, title, fen) => set((s) => ({
    tabs: s.tabs.map((t) => t.id === id ? { ...t, type, title: title ?? TITLES[type], fen } : t),
  })),

  saveSnap: (id, snap) => set((s) => ({ tabs: s.tabs.map((t) => t.id === id ? { ...t, snap } : t) })),
}));
