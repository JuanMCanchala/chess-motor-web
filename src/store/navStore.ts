import { create } from 'zustand';

export type Tab = 'analysis' | 'play' | 'study' | 'engines' | 'databases' | 'files' | 'settings';

interface NavStore {
  tab:         Tab;
  playFromFen: string | null;     // pasar una posición a "Jugar"
  setTab:         (t: Tab) => void;
  setPlayFromFen: (f: string | null) => void;
}

export const useNavStore = create<NavStore>((set) => ({
  tab:         'analysis',
  playFromFen: null,
  setTab:         (tab) => set({ tab }),
  setPlayFromFen: (playFromFen) => set({ playFromFen }),
}));
