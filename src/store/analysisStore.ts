import { create } from 'zustand';

export interface EngineLine {
  multipv:  number;
  depth:    number;
  score_cp: number;
  nodes:    number;
  pv:       string;   // UCI: "e2e4 e7e5 …"
  pvSan:    string;   // SAN legible: "1.e4 e5 2.Nf3 …"
}

interface AnalysisStore {
  fen:       string;
  analyzing: boolean;
  lines:     EngineLine[];                  // ordenadas por multipv (1 = mejor)
  pvArrows:  [string, string, string][];    // [from, to, color]

  setFen:       (f: string) => void;
  setAnalyzing: (v: boolean) => void;
  updateLine:   (line: EngineLine) => void;
  reset:        () => void;
}

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// Color de la flecha según el ranking de la línea (#1 verde, #2 azul, #3 ámbar)
const ARROW_COLORS = ['#22c55e', '#3b82f6', '#f59e0b'];

export const useAnalysisStore = create<AnalysisStore>((set) => ({
  fen:        INITIAL_FEN,
  analyzing:  false,
  lines:      [],
  pvArrows:   [],

  setFen:       (fen)       => set({ fen }),
  setAnalyzing: (analyzing) => set({ analyzing }),

  updateLine: (line) => set((s) => {
    const lines = s.lines.filter((l) => l.multipv !== line.multipv);
    lines.push(line);
    lines.sort((a, b) => a.multipv - b.multipv);

    const pvArrows = lines
      .filter((l) => l.pv && l.pv.length >= 4)
      .map((l): [string, string, string] => {
        const first = l.pv.split(' ')[0];
        return [
          first.slice(0, 2),
          first.slice(2, 4),
          ARROW_COLORS[(l.multipv - 1) % ARROW_COLORS.length],
        ];
      });

    return { lines, pvArrows };
  }),

  reset: () => set({ analyzing: false, lines: [], pvArrows: [] }),
}));
