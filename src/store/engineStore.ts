import { create } from 'zustand';

export type AnalysisMode = 'time' | 'depth' | 'infinite';

interface EngineStore {
  multipv: number;          // 1–5 líneas
  mode:    AnalysisMode;
  timeSec: number;          // modo "time"
  depth:   number;          // modo "depth"
  patch:   (p: Partial<Pick<EngineStore, 'multipv' | 'mode' | 'timeSec' | 'depth'>>) => void;
}

export const useEngineStore = create<EngineStore>((set) => ({
  multipv: 3,
  mode:    'time',
  timeSec: 10,
  depth:   22,
  patch:   (p) => set(p),
}));
