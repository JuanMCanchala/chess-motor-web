import { create } from 'zustand';

export interface DepthEntry {
  depth:    number;
  score_cp: number;
  nodes:    number;
  pv:       string;
}

interface AnalysisStore {
  fen:        string;
  analyzing:  boolean;
  bestMove:   string | null;
  scoreCp:    number | null;
  depth:      number;
  pv:         string;
  depthTable: DepthEntry[];
  pvArrows:   [string, string, string][];  // [from, to, color]

  setFen:       (f: string) => void;
  setAnalyzing: (v: boolean) => void;
  addEntry:     (e: DepthEntry) => void;
  updateBest:   (move: string, score: number, depth: number, pv: string) => void;
  reset:        () => void;
}

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const useAnalysisStore = create<AnalysisStore>((set) => ({
  fen:        INITIAL_FEN,
  analyzing:  false,
  bestMove:   null,
  scoreCp:    null,
  depth:      0,
  pv:         '',
  depthTable: [],
  pvArrows:   [],

  setFen:       (fen)       => set({ fen }),
  setAnalyzing: (analyzing) => set({ analyzing }),

  addEntry: (entry) => set((s) => ({ depthTable: [...s.depthTable, entry] })),

  updateBest: (bestMove, scoreCp, depth, pv) => {
    const moves = pv.trim().split(' ').filter((m) => m.length >= 4);
    const pvArrows: [string, string, string][] = moves.slice(0, 2).map((m, i) => [
      m.slice(0, 2), m.slice(2, 4), i === 0 ? '#22c55e' : '#93c5fd',
    ]);
    set({ bestMove, scoreCp, depth, pv, pvArrows });
  },

  reset: () => set({
    analyzing: false, bestMove: null, scoreCp: null,
    depth: 0, pv: '', depthTable: [], pvArrows: [],
  }),
}));
