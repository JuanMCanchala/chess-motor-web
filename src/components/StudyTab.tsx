'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Chessboard }            from 'react-chessboard';
import { Square }                from 'react-chessboard/dist/chessboard/types';
import { wsAnalyze, wsStopAnalysis, wsCmd } from '@/lib/ws';
import { useAnalysisStore }      from '@/store/analysisStore';
import { useEngineStore }        from '@/store/engineStore';
import { useTreeStore }          from '@/store/treeStore';
import { useStudyStore }         from '@/store/studyStore';
import { useUiStore, boardColors } from '@/store/uiStore';
import { Icon }                  from './Icon';
import { Button, IconButton, Select } from './ui';
import MoveTree                  from './MoveTree';
import EvalGraph                 from './EvalGraph';
import EngineSettings            from './EngineSettings';

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

export default function StudyTab() {
  // estudio
  const studies   = useStudyStore((s) => s.studies);
  const studyId   = useStudyStore((s) => s.currentStudyId);
  const chapterId = useStudyStore((s) => s.currentChapterId);

  // árbol / tablero
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
  const bc        = boardColors(useUiStore((s) => s.boardTheme));

  const [gameAnalyzing, setGameAnalyzing] = useState(false);
  const [gameProg, setGameProg] = useState({ i: 0, n: 0 });

  const loadedRef = useRef<string | null>(null);
  const suppress  = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const study   = studies.find((s) => s.id === studyId);
  const chapters = study?.chapters ?? [];

  // Cargar estudios al montar
  useEffect(() => {
    if (useStudyStore.getState().studies.length === 0) useStudyStore.getState().load();
  }, []);

  // Cargar el capítulo seleccionado en el árbol (guardando el anterior)
  useEffect(() => {
    if (loadedRef.current && loadedRef.current !== chapterId) {
      useStudyStore.getState().saveChapter(loadedRef.current, useTreeStore.getState().snapshot());
    }
    const chap = useStudyStore.getState().currentChapter();
    if (!chap) { loadedRef.current = null; return; }
    suppress.current = true;
    useTreeStore.getState().loadSnapshot(chap.snap);
    loadedRef.current = chap.id;
    wsStopAnalysis();
    useAnalysisStore.getState().reset();
    requestAnimationFrame(() => { suppress.current = false; });
  }, [chapterId]);

  // Autosave (debounce) del capítulo en cada cambio del árbol
  useEffect(() => {
    const unsub = useTreeStore.subscribe(() => {
      if (suppress.current || !loadedRef.current) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        const id = loadedRef.current;
        if (id) useStudyStore.getState().saveChapter(id, useTreeStore.getState().snapshot());
      }, 400);
    });
    return () => { unsub(); if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, []);

  // Teclado
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
    return playUci(uci);
  }, [playUci]);

  // ── Motor ──────────────────────────────────────────────────────────────────
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

  // ── Anotaciones ──────────────────────────────────────────────────────────────
  function setNag(nag: string) {
    if (currentId === useTreeStore.getState().rootId) return;
    useTreeStore.getState().setNag(currentId, currentNode.nag === nag ? undefined : nag);
  }

  const lastMove: Record<string, React.CSSProperties> = {};
  if (currentUci) {
    lastMove[currentUci.slice(0, 2)] = { background: 'rgba(255,213,79,0.35)' };
    lastMove[currentUci.slice(2, 4)] = { background: 'rgba(255,213,79,0.45)' };
  }

  return (
    <div className="flex items-start gap-4 max-w-[1500px] mx-auto">

      {/* Col 1 — Capítulos */}
      <aside className="w-56 shrink-0 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Select value={studyId ?? ''} onChange={(e) => useStudyStore.getState().selectStudy(e.target.value)}
            className="flex-1 min-w-0">
            {studies.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <IconButton icon="plus" title="Nuevo estudio"
            onClick={() => { const n = prompt('Nombre del estudio:'); if (n) useStudyStore.getState().addStudy(n); }} />
        </div>

        <div className="bg-card border border-border rounded-lg overflow-hidden flex flex-col">
          <div className="px-3 py-1.5 bg-base text-dim text-xs flex items-center justify-between">
            <span>{chapters.length} capítulos</span>
            <button title="Borrar estudio"
              onClick={() => { if (study && confirm(`¿Borrar el estudio "${study.name}"?`)) useStudyStore.getState().deleteStudy(study.id); }}
              className="text-dim hover:text-danger"><Icon name="trash" size={13} /></button>
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: 420 }}>
            {chapters.map((c, i) => (
              <div key={c.id}
                className={`group flex items-center gap-2 px-3 py-2 border-t border-border first:border-t-0 cursor-pointer
                  ${c.id === chapterId ? 'bg-hover' : 'hover:bg-hover/50'}`}
                onClick={() => useStudyStore.getState().selectChapter(c.id)}>
                <span className="text-dim text-xs w-4">{i + 1}</span>
                <span className={`flex-1 text-sm truncate ${c.id === chapterId ? 'text-accent' : 'text-fg'}`}>{c.name}</span>
                <button title="Renombrar"
                  onClick={(e) => { e.stopPropagation(); const n = prompt('Nombre del capítulo:', c.name); if (n) useStudyStore.getState().renameChapter(c.id, n); }}
                  className="opacity-0 group-hover:opacity-100 text-dim hover:text-fg"><Icon name="settings" size={12} /></button>
                <button title="Borrar"
                  onClick={(e) => { e.stopPropagation(); if (chapters.length > 1 && confirm(`¿Borrar "${c.name}"?`)) useStudyStore.getState().deleteChapter(c.id); }}
                  className="opacity-0 group-hover:opacity-100 text-dim hover:text-danger"><Icon name="trash" size={12} /></button>
              </div>
            ))}
          </div>
          <button onClick={() => useStudyStore.getState().addChapter('')}
            className="px-3 py-2 border-t border-border text-accent text-sm text-left hover:bg-hover inline-flex items-center gap-1.5">
            <Icon name="plus" size={14} /> Añadir capítulo
          </button>
        </div>
      </aside>

      {/* Col 2 — Tablero */}
      <div className="shrink-0 flex flex-col gap-2">
        <Chessboard id="study-board" position={fen} boardWidth={440} boardOrientation={orientation}
          onPieceDrop={onDrop} customSquareStyles={lastMove}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          customArrows={pvArrows as any}
          customDarkSquareStyle={{ backgroundColor: bc.dark }}
          customLightSquareStyle={{ backgroundColor: bc.light }} animationDuration={150} />
        <div className="flex items-center gap-0.5 bg-card border border-border rounded-xl px-1.5 py-1">
          <IconButton icon="skip-back"     title="Inicio" onClick={goFirst} />
          <IconButton icon="chevron-left"  title="Anterior (←)" onClick={goPrev} />
          <IconButton icon="chevron-right" title="Siguiente (→)" onClick={goNext} />
          <IconButton icon="skip-forward"  title="Final" onClick={goLast} />
          <IconButton icon="rotate"        title="Voltear" onClick={flip} />
        </div>
        <EvalGraph />
      </div>

      {/* Col 3 — Anotación + motor + árbol */}
      <aside className="flex flex-col gap-3 flex-1 min-w-0" style={{ minHeight: 480 }}>
        {/* Anotación de jugada */}
        <div className="flex items-center gap-1 flex-wrap">
          {NAGS.map((g) => (
            <button key={g} onClick={() => setNag(g)}
              className={`font-mono text-sm px-2 py-1 rounded border transition-colors
                ${currentNode.nag === g ? 'bg-accent text-white border-accent' : 'border-border text-fg hover:bg-hover'}`}>
              {g}
            </button>
          ))}
        </div>

        {/* Comentario */}
        <textarea
          value={currentNode.comment ?? ''}
          onChange={(e) => useTreeStore.getState().setComment(currentId, e.target.value)}
          placeholder="Comentario de la jugada…"
          rows={2}
          className="bg-base border border-border text-fg rounded-lg px-3 py-2 text-sm
                     focus:border-accent outline-none resize-y" />

        {/* Motor */}
        <div className="flex items-center gap-2 flex-wrap">
          {!analyzing
            ? <Button variant="primary" icon="play" onClick={startAnalysis}>Analizar</Button>
            : <Button variant="danger" icon="stop" onClick={stopAnalysis}>Parar</Button>}
          <Button variant="subtle" icon="flag" onClick={analyzeGame} disabled={analyzing || gameAnalyzing}
            className="!px-3 !py-1.5 text-xs">
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

        {/* Árbol de jugadas + comentarios inline */}
        <div className="bg-card border border-border rounded-lg p-3 flex flex-col flex-1 min-h-0" style={{ maxHeight: 260 }}>
          <MoveTree />
        </div>
      </aside>
    </div>
  );
}
