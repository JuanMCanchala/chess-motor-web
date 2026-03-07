'use client';

import { useState }             from 'react';
import { Chessboard }           from 'react-chessboard';
import { wsAnalyze, wsStopAnalysis } from '@/lib/ws';
import { useAnalysisStore }     from '@/store/analysisStore';

const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function formatScore(cp: number | null): string {
  if (cp === null) return '—';
  if (Math.abs(cp) > 29000) {
    const m = Math.ceil((30000 - Math.abs(cp)) / 2);
    return (cp > 0 ? '+' : '−') + `M${m}`;
  }
  const v = (cp / 100).toFixed(2);
  return cp >= 0 ? `+${v}` : v;
}

function fmtNodes(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(0) + 'K';
  return String(n);
}

export default function AnalysisTab() {
  const store = useAnalysisStore();
  const [fenInput, setFenInput] = useState(STARTING_FEN);
  const [analysisTime, setAnalysisTime] = useState(10);

  function loadFen() {
    const fen = fenInput.trim() || STARTING_FEN;
    try {
      store.setFen(fen);
      store.reset();
    } catch {
      alert('FEN inválido');
    }
  }

  function startAnalysis() {
    if (store.analyzing) return;
    store.reset();
    store.setAnalyzing(true);

    wsAnalyze(
      { fen: store.fen, time_limit: analysisTime },
      (msg) => {
        const m = msg as { depth: number; score_cp: number; nodes: number; pv: string };
        store.addEntry({ depth: m.depth, score_cp: m.score_cp, nodes: m.nodes, pv: m.pv });
        store.updateBest(m.pv?.split(' ')[0] ?? '', m.score_cp, m.depth, m.pv ?? '');
      },
      (msg) => {
        store.setAnalyzing(false);
        const m = msg as { best_move?: string; score_cp: number; depth: number; pv?: string };
        if (m.best_move) store.updateBest(m.best_move, m.score_cp, m.depth, m.pv ?? '');
      },
    );
  }

  function stopAnalysis() {
    wsStopAnalysis();
    store.setAnalyzing(false);
  }

  return (
    <div className="flex items-start gap-6 max-w-5xl mx-auto">

      {/* Board */}
      <div className="shrink-0">
        <Chessboard
          id="analysis-board"
          position={store.fen}
          boardWidth={480}
          arePiecesDraggable={false}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          customArrows={store.pvArrows as any}
          customDarkSquareStyle={{ backgroundColor: '#769656' }}
          customLightSquareStyle={{ backgroundColor: '#eeeed2' }}
        />
      </div>

      {/* Panel */}
      <aside className="flex flex-col gap-4 flex-1">

        {/* FEN input */}
        <div className="flex flex-col gap-1.5">
          <label className="text-dim text-xs">FEN</label>
          <input
            value={fenInput}
            onChange={(e) => setFenInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadFen()}
            className="bg-base border border-border text-slate-100 rounded-md px-3 py-1.5
                       text-sm font-mono focus:border-accent outline-none"
            placeholder="Posición o FEN…"
          />
          <button onClick={loadFen}
                  className="self-start bg-hover text-slate-100 px-3 py-1 rounded-md
                             text-sm hover:opacity-80 transition-opacity">
            Cargar
          </button>
        </div>

        {/* Controles de análisis */}
        <div className="flex items-center gap-3 flex-wrap">
          {!store.analyzing ? (
            <button onClick={startAnalysis}
                    className="bg-accent text-base font-semibold px-4 py-1.5 rounded-md
                               hover:opacity-90 transition-opacity text-sm">
              ▶ Analizar
            </button>
          ) : (
            <button onClick={stopAnalysis}
                    className="bg-danger text-white font-semibold px-4 py-1.5 rounded-md
                               hover:opacity-90 transition-opacity text-sm">
              ■ Parar
            </button>
          )}
          <label className="flex items-center gap-2 text-dim text-xs">
            Tiempo:
            <select
              value={analysisTime}
              onChange={(e) => setAnalysisTime(Number(e.target.value))}
              className="bg-base border border-border text-slate-100 rounded px-2 py-1 text-sm"
            >
              <option value={5}>5 s</option>
              <option value={10}>10 s</option>
              <option value={30}>30 s</option>
              <option value={60}>60 s</option>
            </select>
          </label>
        </div>

        {/* Best move box */}
        {(store.bestMove || store.analyzing) && (
          <div className="bg-card border border-accent rounded-lg p-4 flex flex-col gap-2">
            <Row label="Mejor jugada" value={store.bestMove
              ? `${store.bestMove.slice(0,2)} → ${store.bestMove.slice(2,4)}`
              : '…'} accent />
            <Row label="Evaluación" value={formatScore(store.scoreCp)} accent />
            <Row label="Profundidad"  value={store.depth ? String(store.depth) : '…'} />
            <div className="flex flex-col gap-0.5">
              <span className="text-dim text-xs">Línea</span>
              <span className="text-dim font-mono text-xs break-all leading-relaxed">
                {store.pv || '…'}
              </span>
            </div>
          </div>
        )}

        {/* Tabla de profundidades */}
        {store.depthTable.length > 0 && (
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-base">
                  <tr className="text-dim">
                    <th className="py-1.5 px-3 text-left">Prof.</th>
                    <th className="py-1.5 px-3 text-left">Score</th>
                    <th className="py-1.5 px-3 text-left">Nodos</th>
                    <th className="py-1.5 px-3 text-left">Línea</th>
                  </tr>
                </thead>
                <tbody>
                  {store.depthTable.map((row, i) => (
                    <tr key={i} className="border-t border-border hover:bg-hover">
                      <td className="py-1 px-3 text-accent font-mono">{row.depth}</td>
                      <td className="py-1 px-3 font-mono">{formatScore(row.score_cp)}</td>
                      <td className="py-1 px-3 font-mono text-dim">{fmtNodes(row.nodes)}</td>
                      <td className="py-1 px-3 font-mono text-dim truncate max-w-[180px]">
                        {row.pv}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </aside>
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-dim">{label}</span>
      <span className={`font-mono font-semibold ${accent ? 'text-accent' : 'text-slate-100'}`}>
        {value}
      </span>
    </div>
  );
}
