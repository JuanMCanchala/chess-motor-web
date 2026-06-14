'use client';

import { useState, useCallback, useEffect } from 'react';
import { Chessboard }                  from 'react-chessboard';
import { Square }                      from 'react-chessboard/dist/chessboard/types';
import { wsCmd }                       from '@/lib/ws';
import { useGameStore }                from '@/store/gameStore';
import { useNavStore }                 from '@/store/navStore';
import { useUiStore, boardColors }     from '@/store/uiStore';
import { Icon }                        from './Icon';
import { Button, Card, Segmented, Select } from './ui';
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

  const bc = boardColors(useUiStore((s) => s.boardTheme));

  // Config de nueva partida (controlado)
  const [colorSel, setColorSel] = useState<'white' | 'black' | 'random'>('white');
  const [timeSel, setTimeSel]   = useState('3');
  const [eloSel, setEloSel]     = useState('0');

  // Movimientos legales: { e2: ['e3','e4'], ... }
  const [dests, setDests] = useState<Record<string, string[]>>({});
  // Resaltado de casillas con puntos
  const [selectedSq, setSelectedSq] = useState<Square | null>(null);

  // ── helpers ──────────────────────────────────────────────────────────────

  async function fetchDests() {
    const r = await wsCmd<LegalMovesResult>('get_all_legal_moves');
    if (r.ok) setDests(r.dests);
  }

  // "Jugar desde aquí" — arranca una partida desde una FEN traída del Análisis
  useEffect(() => {
    const f = useNavStore.getState().playFromFen;
    if (!f) return;
    useNavStore.getState().setPlayFromFen(null);
    void (async () => {
      const color: 'white' | 'black' = f.split(' ')[1] === 'b' ? 'black' : 'white';
      store.reset();
      store.setPlayerColor(color);
      store.setTimeLimit(3);
      const r = await wsCmd<{ ok: boolean; fen: string }>('new_game', { player_color: color, time_limit: 3, fen: f });
      if (!r.ok) { alert('No se pudo iniciar desde esa posición'); return; }
      store.setFen(r.fen);
      store.setGameActive(true);
      await fetchDests();
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const color: 'white' | 'black' =
      colorSel === 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : colorSel;
    const timeNum = Number(timeSel);

    store.reset();
    store.setPlayerColor(color);
    store.setTimeLimit(timeNum);

    const r = await wsCmd<{ ok: boolean; fen: string }>('new_game', {
      player_color: color,
      time_limit:   timeNum,
      elo:          Number(eloSel),
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
          customDarkSquareStyle={{ backgroundColor: bc.dark }}
          customLightSquareStyle={{ backgroundColor: bc.light }}
          animationDuration={200}
          arePiecesDraggable={store.gameActive && !store.engineThinking}
        />
      </div>

      {/* Sidebar */}
      <aside className="flex flex-col gap-3" style={{ width: 240, height: 480 }}>

        {/* Settings / pre-juego */}
        {!isGamePhase && (
          <Card className="p-4 flex flex-col gap-4">
            <h3 className="text-fg font-semibold text-center">Nueva partida</h3>

            <div className="flex flex-col gap-1.5">
              <span className="text-dim text-xs">Juegas con</span>
              <Segmented<'white' | 'black' | 'random'>
                value={colorSel} onChange={setColorSel} size="sm" className="w-full [&>button]:flex-1"
                options={[
                  { value: 'white', label: 'Blancas' },
                  { value: 'black', label: 'Negras' },
                  { value: 'random', label: 'Aleatorio' },
                ]} />
            </div>

            <label className="flex flex-col gap-1.5 text-dim text-xs">
              Tiempo del motor
              <Select value={timeSel} onChange={(e) => setTimeSel(e.target.value)}>
                <option value="0.5">0.5 s (fácil)</option>
                <option value="1">1 s</option>
                <option value="3">3 s</option>
                <option value="5">5 s</option>
                <option value="10">10 s (difícil)</option>
              </Select>
            </label>

            <label className="flex flex-col gap-1.5 text-dim text-xs">
              Fuerza (sparring)
              <Select value={eloSel} onChange={(e) => setEloSel(e.target.value)}>
                <option value="0">Máxima</option>
                <option value="1320">≈1320</option>
                <option value="1600">≈1600</option>
                <option value="2000">≈2000</option>
                <option value="2400">≈2400</option>
                <option value="2800">≈2800</option>
              </Select>
            </label>

            <Button variant="primary" icon="play" className="w-full" onClick={startGame}>Iniciar</Button>
          </Card>
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
              <Button variant="subtle" icon="undo" className="flex-1" onClick={undoMove}
                disabled={store.engineThinking || !store.gameActive}>Deshacer</Button>
              <Button variant="danger" icon="x" className="flex-1" disabled={!store.gameActive}
                onClick={() => { store.setGameActive(false); store.setGameResult('resigned'); }}>Rendirse</Button>
            </div>
            <Button variant="subtle" icon="plus" className="w-full"
              onClick={() => { store.reset(); setDests({}); setSelectedSq(null); }}>Nueva partida</Button>
          </div>
        )}

      </aside>
    </div>
  );
}
