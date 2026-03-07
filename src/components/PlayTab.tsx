'use client';

import { useState, useCallback }       from 'react';
import { Chessboard }                  from 'react-chessboard';
import { Square }                      from 'react-chessboard/dist/chessboard/types';
import { wsCmd }                       from '@/lib/ws';
import { useGameStore }                from '@/store/gameStore';
import EvalBar                         from './EvalBar';
import MoveHistory                     from './MoveHistory';

// ── Mensajes de resultado ────────────────────────────────────────────────────
const RESULT_MSG: Record<string, string> = {
  checkmate_white_wins: '♔ Jaque mate — Blancas ganan',
  checkmate_black_wins: '♚ Jaque mate — Negras ganan',
  stalemate:            '½-½ Ahogado',
  draw_insufficient:    '½-½ Material insuficiente',
  draw_fifty:           '½-½ Regla de 50 movimientos',
  draw_repetition:      '½-½ Triple repetición',
};

// ── Interfaces del protocolo ─────────────────────────────────────────────────
interface MoveResult {
  ok: boolean; fen: string; san: string; move_uci: string;
  game_over: boolean; game_result: string | null;
}
interface EngineResult extends MoveResult {
  eval_cp: number;
  eval_info: { phase_value?: number };
}
interface LegalMovesResult {
  ok: boolean; dests: Record<string, string[]>;
}
interface UndoResult {
  ok: boolean; fen: string;
  move_history_san: string[]; move_history_uci: string[];
}

export default function PlayTab() {
  const store = useGameStore();

  // Movimientos legales: { e2: ['e3','e4'], ... }
  const [dests, setDests] = useState<Record<string, string[]>>({});
  // Resaltado de casillas con puntos
  const [selectedSq, setSelectedSq] = useState<Square | null>(null);

  // ── helpers ──────────────────────────────────────────────────────────────

  async function fetchDests() {
    const r = await wsCmd<LegalMovesResult>('get_all_legal_moves');
    if (r.ok) setDests(r.dests);
  }

  async function engineMove() {
    store.setEngineThinking(true);
    const r = await wsCmd<EngineResult>('engine_move');
    store.setEngineThinking(false);
    if (!r.ok) return;

    const from = r.move_uci.slice(0, 2) as Square;
    const to   = r.move_uci.slice(2, 4) as Square;
    store.pushMove(r.san, r.move_uci);
    store.setFen(r.fen);
    store.setLastMove([from, to]);
    store.setEvalCp(r.eval_cp);

    if (r.game_over) { store.setGameActive(false); store.setGameResult(r.game_result); return; }
    await fetchDests();
  }

  // ── Inicio de partida ─────────────────────────────────────────────────────

  async function startGame() {
    const colorSel = (document.getElementById('sel-color') as HTMLSelectElement).value;
    const timeSel  = Number((document.getElementById('sel-time') as HTMLSelectElement).value);

    const color: 'white' | 'black' =
      colorSel === 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : colorSel as 'white' | 'black';

    store.reset();
    store.setPlayerColor(color);
    store.setTimeLimit(timeSel);

    const r = await wsCmd<{ ok: boolean; fen: string }>('new_game', {
      player_color: color,
      time_limit:   timeSel,
    });
    if (!r.ok) { alert('Error al iniciar la partida'); return; }

    store.setFen(r.fen);
    store.setGameActive(true);

    if (color === 'black') {
      await engineMove();
    } else {
      await fetchDests();
    }
  }

  // ── Movimiento del jugador ────────────────────────────────────────────────

  // onPieceDrop debe ser síncrono: acepta optimisticamente y valida en background
  const onDrop = useCallback((from: Square, to: Square, piece: string): boolean => {
    if (!store.gameActive || store.engineThinking) return false;

    let moveUci = from + to;
    const isPromo = piece[1].toLowerCase() === 'p' &&
      ((piece[0] === 'w' && to[1] === '8') || (piece[0] === 'b' && to[1] === '1'));
    if (isPromo) moveUci += 'q';

    setSelectedSq(null);

    // Validar con el motor en background
    void (async () => {
      const r = await wsCmd<MoveResult>('make_move', { move_uci: moveUci });
      if (!r.ok) {
        // Movimiento ilegal: revertir posición al FEN actual
        store.setFen(store.fen);
        await fetchDests();
        return;
      }
      store.pushMove(r.san, r.move_uci);
      store.setFen(r.fen);
      store.setLastMove([from, to]);

      if (r.game_over) {
        store.setGameActive(false);
        store.setGameResult(r.game_result);
        setDests({});
        return;
      }
      await engineMove();
    })();

    return true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.gameActive, store.engineThinking, store.fen]);

  // ── Click en casilla (resaltar destinos) ──────────────────────────────────

  const onSquareClick = useCallback((sq: Square) => {
    if (!store.gameActive || store.engineThinking) return;
    setSelectedSq((prev) => prev === sq ? null : sq);
  }, [store.gameActive, store.engineThinking]);

  // Estilo de puntos para movimientos legales
  const customSquareStyles: Record<string, React.CSSProperties> = {};
  if (selectedSq && dests[selectedSq]) {
    dests[selectedSq].forEach((dest) => {
      customSquareStyles[dest] = {
        background: 'radial-gradient(circle, rgba(34,197,94,0.6) 26%, transparent 26%)',
        borderRadius: '50%',
      };
    });
    customSquareStyles[selectedSq] = { background: 'rgba(34,197,94,0.25)' };
  }

  // ── Undo ──────────────────────────────────────────────────────────────────

  async function undoMove() {
    if (!store.gameActive || store.engineThinking) return;
    const r = await wsCmd<UndoResult>('undo');
    if (!r.ok) return;
    store.setMoveHistory(r.move_history_san, r.move_history_uci);
    store.setFen(r.fen);
    store.setLastMove(null);
    store.setEvalCp(null);
    await fetchDests();
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const isGamePhase = store.gameActive || store.gameResult !== null;

  return (
    <div className="flex items-start gap-4 max-w-4xl mx-auto">

      {/* Eval Bar */}
      <EvalBar evalCp={store.evalCp} orientation={store.playerColor} />

      {/* Board */}
      <div className="shrink-0">
        <Chessboard
          id="play-board"
          position={store.fen}
          boardWidth={480}
          boardOrientation={store.playerColor}
          onPieceDrop={onDrop}
          onSquareClick={onSquareClick}
          customSquareStyles={customSquareStyles}
          customDarkSquareStyle={{ backgroundColor: '#769656' }}
          customLightSquareStyle={{ backgroundColor: '#eeeed2' }}
          animationDuration={200}
          arePiecesDraggable={store.gameActive && !store.engineThinking}
        />
      </div>

      {/* Sidebar */}
      <aside className="flex flex-col gap-3" style={{ width: 240, height: 480 }}>

        {/* Settings / pre-juego */}
        {!isGamePhase && (
          <div className="bg-card border border-border rounded-lg p-4 flex flex-col gap-3">
            <h3 className="text-accent font-semibold text-sm">Nueva partida</h3>

            <label className="flex flex-col gap-1 text-dim text-xs">
              Color
              <select id="sel-color" className="bg-base border border-border text-slate-100
                                                rounded-md px-2 py-1.5 text-sm">
                <option value="white">Blancas</option>
                <option value="black">Negras</option>
                <option value="random">Aleatorio</option>
              </select>
            </label>

            <label className="flex flex-col gap-1 text-dim text-xs">
              Tiempo del motor
              <select id="sel-time" className="bg-base border border-border text-slate-100
                                               rounded-md px-2 py-1.5 text-sm">
                <option value="0.5">0.5 s (fácil)</option>
                <option value="1">1 s</option>
                <option value="3">3 s</option>
                <option value="5">5 s</option>
                <option value="10">10 s (difícil)</option>
              </select>
            </label>

            <button onClick={startGame}
                    className="w-full bg-accent text-base font-semibold py-2 rounded-md
                               hover:opacity-90 transition-opacity">
              ▶ Iniciar
            </button>
          </div>
        )}

        {/* Historial de movimientos */}
        {isGamePhase && (
          <div className="bg-card border border-border rounded-lg p-3 flex flex-col gap-2 flex-1 min-h-0">
            <MoveHistory moves={store.moveHistorySan} />

            {/* Indicador de pensamiento */}
            {store.engineThinking && (
              <p className="text-accent text-xs animate-pulse">Motor pensando…</p>
            )}
          </div>
        )}

        {/* Controles */}
        {isGamePhase && (
          <div className="flex flex-col gap-2">
            {store.gameResult && (
              <div className="bg-card border border-accent rounded-lg px-3 py-2 text-center
                              text-accent font-semibold text-sm">
                {RESULT_MSG[store.gameResult] ?? 'Partida terminada'}
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={undoMove} disabled={store.engineThinking || !store.gameActive}
                      className="flex-1 bg-hover text-slate-100 py-1.5 rounded-md text-sm
                                 hover:opacity-80 disabled:opacity-40 transition-opacity">
                ↩ Deshacer
              </button>
              <button
                onClick={() => { store.setGameActive(false); store.setGameResult('resigned'); }}
                disabled={!store.gameActive}
                className="flex-1 bg-danger text-white py-1.5 rounded-md text-sm
                           hover:opacity-80 disabled:opacity-40 transition-opacity">
                ✕ Rendirse
              </button>
            </div>

            <button onClick={() => { store.reset(); setDests({}); setSelectedSq(null); }}
                    className="w-full bg-hover text-slate-100 py-1.5 rounded-md text-sm
                               hover:opacity-80 transition-opacity">
              + Nueva partida
            </button>
          </div>
        )}

      </aside>
    </div>
  );
}
