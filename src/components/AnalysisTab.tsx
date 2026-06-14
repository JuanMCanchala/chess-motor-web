'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Chessboard }            from 'react-chessboard';
import { Square }                from 'react-chessboard/dist/chessboard/types';
import { Chess }                 from 'chess.js';
import { wsAnalyze, wsStopAnalysis, wsCmd } from '@/lib/ws';
import { useAnalysisStore }      from '@/store/analysisStore';
import { useTreeStore }          from '@/store/treeStore';
import { useEngineStore }        from '@/store/engineStore';
import { useUiStore, boardColors } from '@/store/uiStore';
import { useWorkspaceStore }     from '@/store/workspaceStore';
import { useNavStore }           from '@/store/navStore';
import { playMoveSound }         from '@/lib/sound';
import { Icon, IconName }        from './Icon';
import { Button, IconButton }    from './ui';
import MoveTree                  from './MoveTree';
import EvalGraph                 from './EvalGraph';
import EngineSettings            from './EngineSettings';
import OpeningExplorer           from './OpeningExplorer';
import Tablebase                 from './Tablebase';
import InfoPanel                 from './InfoPanel';

type SubTab = 'analysis' | 'database' | 'annotate' | 'info';
const SUBTABS: { id: SubTab; label: string; icon: IconName }[] = [
  { id: 'analysis', label: 'Análisis',  icon: 'play' },
  { id: 'database', label: 'Database',  icon: 'book' },
  { id: 'annotate', label: 'Annotate',  icon: 'flag' },
  { id: 'info',     label: 'Info',      icon: 'copy' },
];
const NAGS = ['!!', '!', '!?', '?!', '?', '??'];

function formatScore(cp: number | null): string {
  if (cp === null) return '—';
  if (Math.abs(cp) > 29000) {
    const m = Math.ceil((30000 - Math.abs(cp)) / 2);
    return (cp > 0 ? '+' : '−') + `M${m}`;
  }
  const v = (cp / 100).toFixed(2);
  return cp >= 0 ? `+${v}` : v;
}

function useBoardSize() {
  const [w, setW] = useState(440);
  useEffect(() => {
    const calc = () => setW(Math.max(320, Math.min(Math.floor(window.innerWidth * 0.44), Math.floor(window.innerHeight * 0.78))));
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, []);
  return w;
}

export default function AnalysisTab() {
  const fen         = useTreeStore((s) => s.nodes[s.currentId].fen);
  const currentId   = useTreeStore((s) => s.currentId);
  const currentNode = useTreeStore((s) => s.nodes[s.currentId]);
  const currentUci  = currentNode.uci;
  const orientation = useTreeStore((s) => s.orientation);
  const playUci     = useTreeStore((s) => s.playUci);
  const goPrev      = useTreeStore((s) => s.goPrev);
  const goNext      = useTreeStore((s) => s.goNext);
  const goFirst     = useTreeStore((s) => s.goFirst);
  const goLast      = useTreeStore((s) => s.goLast);
  const flip        = useTreeStore((s) => s.flip);

  const lines     = useAnalysisStore((s) => s.lines);
  const pvArrows  = useAnalysisStore((s) => s.pvArrows);
  const analyzing = useAnalysisStore((s) => s.analyzing);

  const bc      = boardColors(useUiStore((s) => s.boardTheme));
  const coords  = useUiStore((s) => s.coords);
  const boardW  = useBoardSize();

  const [subtab, setSubtab]   = useState<SubTab>('analysis');
  const [autoAnalyze, setAuto] = useState(false);
  const [hideComments, setHideComments] = useState(false);
  const [hideMoves, setHideMoves] = useState(false);
  const [gameAnalyzing, setGameAnalyzing] = useState(false);
  const [gameProg, setGameProg] = useState({ i: 0, n: 0 });
  const boardRef = useRef<HTMLDivElement>(null);

  const startAnalysis = useCallback(() => {
    const a = useAnalysisStore.getState();
    if (a.analyzing) return;
    a.reset(); a.setAnalyzing(true);
    const t = useTreeStore.getState();
    const eng = useEngineStore.getState();
    wsAnalyze(
      { fen: t.nodes[t.currentId].fen, multipv: eng.multipv,
        infinite: eng.mode === 'infinite', depth: eng.mode === 'depth' ? eng.depth : undefined,
        time_limit: eng.timeSec },
      (msg) => {
        const m = msg as { multipv: number; depth: number; score_cp: number; nodes: number; pv: string; pv_san?: string };
        useAnalysisStore.getState().updateLine({ multipv: m.multipv ?? 1, depth: m.depth, score_cp: m.score_cp, nodes: m.nodes, pv: m.pv, pvSan: m.pv_san ?? m.pv });
      },
      () => useAnalysisStore.getState().setAnalyzing(false),
    );
  }, []);

  function stopAnalysis() { wsStopAnalysis(); useAnalysisStore.getState().setAnalyzing(false); }

  useEffect(() => {
    wsStopAnalysis();
    useAnalysisStore.getState().reset();
    if (autoAnalyze) startAnalysis();
  }, [currentId, autoAnalyze, startAnalysis]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'Home') goFirst();
      else if (e.key === 'End') goLast();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goPrev, goNext, goFirst, goLast]);

  const onDrop = useCallback((from: Square, to: Square, piece: string): boolean => {
    let uci = from + to;
    if (piece[1]?.toLowerCase() === 'p' && (to[1] === '8' || to[1] === '1')) uci += 'q';
    const ok = playUci(uci);
    if (ok && useUiStore.getState().sound) playMoveSound();
    setSelectedSq(null);
    return ok;
  }, [playUci]);

  // Clic para mover (alternativa fiable al arrastre): 1er clic selecciona, 2º mueve
  const [selectedSq, setSelectedSq] = useState<Square | null>(null);
  const onSquareClick = useCallback((sq: Square) => {
    const f = useTreeStore.getState().nodes[useTreeStore.getState().currentId].fen;
    const c = new Chess(f);
    if (selectedSq) {
      const m = c.moves({ square: selectedSq, verbose: true }).find((x) => x.to === sq);
      if (m) {
        const ok = playUci(m.from + m.to + (m.promotion || ''));
        if (ok && useUiStore.getState().sound) playMoveSound();
        setSelectedSq(null);
        return;
      }
    }
    // seleccionar si hay pieza del lado a mover en esa casilla
    const piece = c.get(sq);
    setSelectedSq(piece && piece.color === c.turn() ? sq : null);
  }, [selectedSq, playUci]);

  async function analyzeGame() {
    if (gameAnalyzing) return;
    wsStopAnalysis(); useAnalysisStore.getState().setAnalyzing(false);
    const t = useTreeStore.getState();
    const line = t.mainline();
    if (line.length < 2) return;
    setGameAnalyzing(true); setGameProg({ i: 0, n: line.length });
    const evals: Record<string, number> = {};
    for (let i = 0; i < line.length; i++) {
      const r = await wsCmd<{ score_cp: number }>('eval_position', { fen: line[i].fen, movetime: 350 });
      evals[line[i].id] = r?.score_cp ?? 0;
      setGameProg({ i: i + 1, n: line.length });
    }
    for (const node of line) {
      let nag: string | undefined;
      if (node.parentId && node.parentId in evals) {
        const loss = node.isWhite ? evals[node.parentId] - evals[node.id] : evals[node.id] - evals[node.parentId];
        if (loss >= 300) nag = '??'; else if (loss >= 150) nag = '?'; else if (loss >= 90) nag = '?!';
      }
      t.setEval(node.id, evals[node.id], nag);
    }
    setGameAnalyzing(false);
  }

  function setNag(nag: string) {
    if (currentId === useTreeStore.getState().rootId) return;
    useTreeStore.getState().setNag(currentId, currentNode.nag === nag ? undefined : nag);
  }
  function loadFen(v: string) { if (v.trim() && !useTreeStore.getState().loadFen(v.trim())) alert('FEN inválido'); }
  function importPgn(v: string) { if (!useTreeStore.getState().loadPgn(v)) alert('PGN inválido'); }
  const copyFen = () => navigator.clipboard?.writeText(fen);
  const copyPgn = () => navigator.clipboard?.writeText(useTreeStore.getState().exportPgn({ comments: true, glyphs: true, variations: true }));

  async function savePng() {
    if (!boardRef.current) return;
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(boardRef.current, { backgroundColor: null, scale: 2 });
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = 'posicion.png';
      a.click();
    } catch { alert('No se pudo exportar el PNG'); }
  }
  function playFromHere() {
    useNavStore.getState().setPlayFromFen(fen);
    const w = useWorkspaceStore.getState();
    const id = w.newTab();
    w.setType(id, 'play', 'Partida');
  }

  const squareStyles: Record<string, React.CSSProperties> = {};
  if (currentUci) {
    squareStyles[currentUci.slice(0, 2)] = { background: 'rgba(255,213,79,0.35)' };
    squareStyles[currentUci.slice(2, 4)] = { background: 'rgba(255,213,79,0.45)' };
  }
  if (selectedSq) {
    squareStyles[selectedSq] = { background: 'rgba(34,197,94,0.35)' };
    try {
      const c = new Chess(fen);
      for (const m of c.moves({ square: selectedSq, verbose: true })) {
        squareStyles[m.to] = {
          background: 'radial-gradient(circle, rgba(34,197,94,0.55) 25%, transparent 26%)',
          borderRadius: '50%',
        };
      }
    } catch { /* noop */ }
  }

  return (
    <div className="flex flex-col h-full min-h-[600px]">
      <div className="flex items-start gap-5 flex-1 min-h-0">

        {/* Izquierda — Tablero */}
        <div className="shrink-0 flex flex-col gap-2" style={{ width: boardW }}>
          <div ref={boardRef}>
            <Chessboard id="analysis-board" position={fen} boardWidth={boardW} boardOrientation={orientation}
              onPieceDrop={onDrop} onSquareClick={onSquareClick} arePiecesDraggable
              customSquareStyles={squareStyles} showBoardNotation={coords}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              customArrows={pvArrows as any}
              customDarkSquareStyle={{ backgroundColor: bc.dark }}
              customLightSquareStyle={{ backgroundColor: bc.light }} animationDuration={150} />
          </div>
          <div className="flex items-center gap-0.5 bg-card border border-border rounded-xl px-1.5 py-1">
            <IconButton icon="skip-back"     title="Inicio" onClick={goFirst} />
            <IconButton icon="chevron-left"  title="Anterior (←)" onClick={goPrev} />
            <IconButton icon="chevron-right" title="Siguiente (→)" onClick={goNext} />
            <IconButton icon="skip-forward"  title="Final" onClick={goLast} />
            <IconButton icon="rotate"        title="Voltear" onClick={flip} />
            <div className="flex-1" />
            <IconButton icon="target"   title="Jugar desde aquí" onClick={playFromHere} />
            <IconButton icon="download" title="Guardar PNG" onClick={savePng} />
            <button onClick={copyFen} title="Copiar FEN" className="text-dim hover:text-fg hover:bg-hover rounded-lg px-2 py-1.5 text-xs font-semibold">FEN</button>
            <button onClick={copyPgn} title="Copiar PGN" className="text-dim hover:text-fg hover:bg-hover rounded-lg px-2 py-1.5 text-xs font-semibold">PGN</button>
          </div>
          <EvalGraph />
        </div>

        {/* Derecha — Panel con subtabs */}
        <div className="flex-1 min-w-0 flex flex-col gap-3 h-full">
          <div className="flex items-center border-b border-border">
            {SUBTABS.map((s) => (
              <button key={s.id} onClick={() => setSubtab(s.id)}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm border-b-2 -mb-px transition-colors
                  ${subtab === s.id ? 'border-accent text-accent' : 'border-transparent text-dim hover:text-fg'}`}>
                <Icon name={s.icon} size={14} /> {s.label}
              </button>
            ))}
          </div>

          <div className="overflow-y-auto pr-1" style={{ maxHeight: '40vh' }}>
            {subtab === 'analysis' && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  {!analyzing
                    ? <Button variant="primary" icon="play" onClick={startAnalysis}>Analizar</Button>
                    : <Button variant="danger" icon="stop" onClick={stopAnalysis}>Parar</Button>}
                  <label className="flex items-center gap-1.5 text-dim text-xs cursor-pointer">
                    <input type="checkbox" checked={autoAnalyze} onChange={(e) => setAuto(e.target.checked)} /> al mover
                  </label>
                  <Button variant="subtle" icon="flag" onClick={analyzeGame} disabled={analyzing || gameAnalyzing}>
                    {gameAnalyzing ? `Analizando ${gameProg.i}/${gameProg.n}` : 'Computer analysis'}
                  </Button>
                </div>
                <EngineSettings />
                {(lines.length > 0 || analyzing) && (
                  <div className="bg-card border border-border rounded-lg overflow-hidden">
                    {lines.length === 0 && analyzing && <div className="px-3 py-2 text-dim text-xs animate-pulse">Calculando…</div>}
                    {lines.map((l) => (
                      <button key={l.multipv} onClick={() => { const f = l.pv.split(' ')[0]; if (f) playUci(f); }}
                        className="w-full flex items-start gap-2 px-3 py-1.5 border-t border-border first:border-t-0 text-left hover:bg-hover">
                        <span className={`font-mono font-semibold text-sm w-14 shrink-0 ${l.score_cp >= 0 ? 'text-accent' : 'text-danger'}`}>{formatScore(l.score_cp)}</span>
                        <span className="font-mono text-xs text-fg-dim flex-1 break-words leading-relaxed">{l.pvSan || '…'}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {subtab === 'database' && (
              <div className="flex flex-col gap-3">
                <Tablebase fen={fen} onPlay={playUci} />
                <OpeningExplorer fen={fen} onPlay={playUci} />
              </div>
            )}

            {subtab === 'annotate' && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-1 flex-wrap">
                  {NAGS.map((g) => (
                    <button key={g} onClick={() => setNag(g)}
                      className={`font-mono text-sm px-2 py-1 rounded border transition-colors
                        ${currentNode.nag === g ? 'bg-accent text-white border-accent' : 'border-border text-fg hover:bg-hover'}`}>{g}</button>
                  ))}
                </div>
                <textarea value={currentNode.comment ?? ''}
                  onChange={(e) => useTreeStore.getState().setComment(currentId, e.target.value)}
                  placeholder="Comentario de la jugada…" rows={4}
                  className="bg-base border border-border text-fg rounded-md px-3 py-2 text-sm focus:border-accent outline-none resize-y" />
              </div>
            )}

            {subtab === 'info' && (
              <div className="flex flex-col gap-3">
                <InfoPanel fen={fen} />
                <input placeholder="Pegar FEN y Enter…"
                  onKeyDown={(e) => { if (e.key === 'Enter') { loadFen((e.target as HTMLInputElement).value); (e.target as HTMLInputElement).value = ''; } }}
                  className="bg-base border border-border text-fg rounded-md px-2 py-1.5 text-xs font-mono focus:border-accent outline-none" />
                <textarea placeholder="Pegar PGN y Ctrl+Enter para cargar…" rows={3}
                  onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) importPgn((e.target as HTMLTextAreaElement).value); }}
                  className="bg-base border border-border text-fg rounded-md px-3 py-2 text-xs font-mono focus:border-accent outline-none resize-y" />
              </div>
            )}
          </div>

          {/* Árbol de jugadas */}
          <div className="bg-card border border-border rounded-lg flex flex-col flex-1 min-h-0">
            <div className="flex items-center justify-between px-3 py-1.5 bg-base text-dim text-xs border-b border-border">
              <span>Movimientos</span>
              <div className="flex items-center gap-3">
                <button onClick={() => setHideMoves((v) => !v)} title="Ocultar jugadas" className="hover:text-fg">
                  <Icon name={hideMoves ? 'eyeOff' : 'eye'} size={14} />
                </button>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={hideComments} onChange={(e) => setHideComments(e.target.checked)} /> ocultar comentarios
                </label>
              </div>
            </div>
            <div className="p-3 flex-1 min-h-0 flex flex-col">
              <div className={`flex-1 min-h-0 flex flex-col ${hideMoves ? 'blur-sm select-none pointer-events-none' : ''}`}>
                <MoveTree hideComments={hideComments} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
