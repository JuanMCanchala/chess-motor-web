import { Chess } from 'chess.js';

// Índice de aperturas en cliente desde un PGN: posición → jugadas con W/D/L.
export type DbIndex = Record<string, Record<string, { san: string; w: number; d: number; l: number }>>;

function posKey(fen: string): string {
  const p = fen.split(' ');
  return `${p[0]} ${p[1]} ${p[2]}`;
}

function splitGames(pgn: string): string[] {
  return pgn.split(/(?=\[Event\s)/).map((s) => s.trim()).filter(Boolean);
}

export function buildIndex(pgn: string, maxPly = 30): { index: DbIndex; games: number } {
  const index: DbIndex = {};
  let games = 0;
  for (const block of splitGames(pgn)) {
    const c = new Chess();
    try { c.loadPgn(block); } catch { continue; }
    const r = c.header()['Result'];
    const rv = r === '1-0' ? 2 : r === '0-1' ? 0 : r === '1/2-1/2' ? 1 : -1;
    const hist = c.history({ verbose: true });
    if (hist.length === 0) continue;
    let ply = 0;
    for (const m of hist) {
      if (ply >= maxPly) break;
      const before = (m.before as string);
      const key = posKey(before);
      const uci = m.lan as string;
      const bucket = (index[key] ||= {});
      const e = (bucket[uci] ||= { san: m.san, w: 0, d: 0, l: 0 });
      if (rv === 2) e.w++; else if (rv === 1) e.d++; else if (rv === 0) e.l++;
      ply++;
    }
    games++;
  }
  return { index, games };
}

export interface DbMove { uci: string; san: string; white: number; draws: number; black: number; }
export interface DbResult { white: number; draws: number; black: number; moves: DbMove[]; }

export function lookupDb(index: DbIndex, fen: string): DbResult {
  const moves: DbMove[] = Object.entries(index[posKey(fen)] || {})
    .map(([uci, s]) => ({ uci, san: s.san, white: s.w, draws: s.d, black: s.l }))
    .sort((a, b) => (b.white + b.draws + b.black) - (a.white + a.draws + a.black));
  return {
    white: moves.reduce((s, m) => s + m.white, 0),
    draws: moves.reduce((s, m) => s + m.draws, 0),
    black: moves.reduce((s, m) => s + m.black, 0),
    moves,
  };
}
