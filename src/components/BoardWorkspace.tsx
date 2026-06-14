'use client';

import { useEffect, useRef } from 'react';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { useTreeStore } from '@/store/treeStore';
import { useAnalysisStore } from '@/store/analysisStore';
import { wsStopAnalysis } from '@/lib/ws';
import { Icon } from './Icon';
import HomeTab from './HomeTab';
import AnalysisTab from './AnalysisTab';
import PlayTab from './PlayTab';

/**
 * Área "Tablero" con pestañas tipo navegador (estilo En Croissant).
 * Cada pestaña es un espacio independiente: home (launcher), análisis o partida.
 * Las pestañas de análisis conservan su propio árbol (snapshot por pestaña).
 */
export default function BoardWorkspace() {
  const tabs     = useWorkspaceStore((s) => s.tabs);
  const activeId = useWorkspaceStore((s) => s.activeId);
  const loadedRef = useRef<string | null>(null);
  const suppress  = useRef(false);

  // Inicializa al menos una pestaña
  useEffect(() => { useWorkspaceStore.getState().ensureOne(); }, []);

  // Al cambiar de pestaña: guarda el árbol de la saliente y carga el de la entrante
  useEffect(() => {
    if (!activeId) return;
    const w = useWorkspaceStore.getState();
    const prev = loadedRef.current;
    if (prev && prev !== activeId) {
      const prevTab = w.tabs.find((t) => t.id === prev);
      if (prevTab && prevTab.type === 'analysis') {
        w.saveSnap(prev, useTreeStore.getState().snapshot());
      }
    }
    const cur = w.active();
    if (cur && cur.type === 'analysis') {
      suppress.current = true;
      useTreeStore.getState().loadSnapshot(cur.snap);
      wsStopAnalysis();
      useAnalysisStore.getState().reset();
      requestAnimationFrame(() => { suppress.current = false; });
    }
    loadedRef.current = activeId;
  }, [activeId]);

  // Autosave del árbol de la pestaña de análisis activa
  useEffect(() => {
    const unsub = useTreeStore.subscribe(() => {
      if (suppress.current) return;
      const w = useWorkspaceStore.getState();
      const cur = w.active();
      if (cur && cur.type === 'analysis') w.saveSnap(cur.id, useTreeStore.getState().snapshot());
    });
    return () => { unsub(); };
  }, []);

  function switchTab(id: string) {
    if (id === activeId) return;
    useWorkspaceStore.getState().select(id);
  }
  function closeTab(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    useWorkspaceStore.getState().close(id);
  }

  const active = tabs.find((t) => t.id === activeId);

  return (
    <div className="flex flex-col h-full">
      {/* Barra de pestañas */}
      <div className="flex items-center gap-1 px-2 pt-1.5 border-b border-border bg-card">
        {tabs.map((t) => (
          <div key={t.id} onClick={() => switchTab(t.id)}
            className={`group flex items-center gap-2 pl-3 pr-2 py-2 rounded-t-lg text-sm cursor-pointer max-w-[200px]
              border-b-2 transition-colors -mb-px
              ${t.id === activeId ? 'bg-base border-accent text-fg' : 'border-transparent text-dim hover:text-fg hover:bg-hover'}`}>
            <span className="truncate">{t.title}</span>
            <button onClick={(e) => closeTab(t.id, e)}
              className={`shrink-0 rounded hover:bg-hover p-0.5 ${tabs.length > 1 ? 'opacity-60 hover:opacity-100' : 'opacity-0 pointer-events-none'}`}>
              <Icon name="x" size={12} />
            </button>
          </div>
        ))}
        <button onClick={() => useWorkspaceStore.getState().newTab()} title="Nueva pestaña"
          className="text-dim hover:text-fg hover:bg-hover rounded-lg p-1.5 ml-1">
          <Icon name="plus" size={16} />
        </button>
      </div>

      {/* Contenido de la pestaña activa */}
      <div className="flex-1 overflow-auto px-4 py-3">
        {active?.type === 'home'     && <HomeTab />}
        {active?.type === 'analysis' && <AnalysisTab />}
        {active?.type === 'play'     && <PlayTab />}
      </div>
    </div>
  );
}
