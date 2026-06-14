import { create } from 'zustand';

export type Tab = 'home' | 'analysis' | 'play' | 'study' | 'engines' | 'match' | 'databases' | 'files' | 'settings';

interface NavStore {
  tab:         Tab;
  playFromFen: string | null;     // pasar una posición a "Jugar"
  setTab:         (t: Tab) => void;
  setPlayFromFen: (f: string | null) => void;
}

export const useNavStore = create<NavStore>((set) => ({
  tab:         'home',
  playFromFen: null,
  setTab:         (tab) => set({ tab }),
  setPlayFromFen: (playFromFen) => set({ playFromFen }),
}));
