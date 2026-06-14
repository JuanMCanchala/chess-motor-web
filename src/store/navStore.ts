import { create } from 'zustand';

// Secciones del sidebar. El área 'board' contiene las pestañas tipo navegador
// (home/análisis/partida); el resto son páginas completas.
export type Tab = 'board' | 'study' | 'engines' | 'match' | 'databases' | 'files' | 'settings';

interface NavStore {
  tab:         Tab;
  playFromFen: string | null;     // pasar una posición a "Jugar"
  setTab:         (t: Tab) => void;
  setPlayFromFen: (f: string | null) => void;
}

export const useNavStore = create<NavStore>((set) => ({
  tab:         'board',
  playFromFen: null,
  setTab:         (tab) => set({ tab }),
  setPlayFromFen: (playFromFen) => set({ playFromFen }),
}));
