import { create } from 'zustand';

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

interface GameStore {
  fen:              string;
  moveHistorySan:   string[];
  moveHistoryUci:   string[];
  playerColor:      'white' | 'black';
  timeLimit:        number;
  gameActive:       boolean;
  engineThinking:   boolean;
  evalCp:           number | null;
  gameResult:       string | null;
  lastMove:         [string, string] | null;

  setFen:           (f: string) => void;
  setMoveHistory:   (san: string[], uci: string[]) => void;
  pushMove:         (san: string, uci: string) => void;
  setPlayerColor:   (c: 'white' | 'black') => void;
  setTimeLimit:     (t: number) => void;
  setGameActive:    (v: boolean) => void;
  setEngineThinking:(v: boolean) => void;
  setEvalCp:        (v: number | null) => void;
  setGameResult:    (r: string | null) => void;
  setLastMove:      (lm: [string, string] | null) => void;
  reset:            () => void;
}

export const useGameStore = create<GameStore>((set) => ({
  fen:            INITIAL_FEN,
  moveHistorySan: [],
  moveHistoryUci: [],
  playerColor:    'white',
  timeLimit:      3,
  gameActive:     false,
  engineThinking: false,
  evalCp:         null,
  gameResult:     null,
  lastMove:       null,

  setFen:           (fen)          => set({ fen }),
  setMoveHistory:   (san, uci)     => set({ moveHistorySan: san, moveHistoryUci: uci }),
  pushMove:         (san, uci)     => set((s) => ({
    moveHistorySan: [...s.moveHistorySan, san],
    moveHistoryUci: [...s.moveHistoryUci, uci],
  })),
  setPlayerColor:   (playerColor)  => set({ playerColor }),
  setTimeLimit:     (timeLimit)    => set({ timeLimit }),
  setGameActive:    (gameActive)   => set({ gameActive }),
  setEngineThinking:(engineThinking) => set({ engineThinking }),
  setEvalCp:        (evalCp)       => set({ evalCp }),
  setGameResult:    (gameResult)   => set({ gameResult }),
  setLastMove:      (lastMove)     => set({ lastMove }),
  reset: () => set({
    fen: INITIAL_FEN, moveHistorySan: [], moveHistoryUci: [],
    gameActive: false, engineThinking: false,
    evalCp: null, gameResult: null, lastMove: null,
  }),
}));
