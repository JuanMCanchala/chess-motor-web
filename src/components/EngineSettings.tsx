'use client';

import { useEngineStore, AnalysisMode } from '@/store/engineStore';

export default function EngineSettings() {
  const { multipv, mode, timeSec, depth, patch } = useEngineStore();

  return (
    <div className="flex items-center gap-2 flex-wrap text-xs text-dim">
      <label className="flex items-center gap-1">
        Líneas
        <select value={multipv} onChange={(e) => patch({ multipv: Number(e.target.value) })}
          className="bg-base border border-border text-fg rounded px-1.5 py-1">
          {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>

      <label className="flex items-center gap-1">
        Modo
        <select value={mode} onChange={(e) => patch({ mode: e.target.value as AnalysisMode })}
          className="bg-base border border-border text-fg rounded px-1.5 py-1">
          <option value="time">Tiempo</option>
          <option value="depth">Profundidad</option>
          <option value="infinite">Infinito</option>
        </select>
      </label>

      {mode === 'time' && (
        <select value={timeSec} onChange={(e) => patch({ timeSec: Number(e.target.value) })}
          className="bg-base border border-border text-fg rounded px-1.5 py-1">
          {[5, 10, 30, 60, 120].map((s) => <option key={s} value={s}>{s} s</option>)}
        </select>
      )}
      {mode === 'depth' && (
        <select value={depth} onChange={(e) => patch({ depth: Number(e.target.value) })}
          className="bg-base border border-border text-fg rounded px-1.5 py-1">
          {[16, 20, 24, 28, 32, 40].map((d) => <option key={d} value={d}>prof. {d}</option>)}
        </select>
      )}
    </div>
  );
}
