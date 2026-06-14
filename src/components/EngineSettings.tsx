'use client';

import { useEngineStore, AnalysisMode } from '@/store/engineStore';
import { Segmented, Select } from './ui';

export default function EngineSettings() {
  const { multipv, mode, timeSec, depth, patch } = useEngineStore();

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-dim text-xs">Líneas</span>
        <Segmented<string> size="sm" value={String(multipv)}
          onChange={(v) => patch({ multipv: Number(v) })}
          options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))} />
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-dim text-xs">Modo</span>
        <Segmented<AnalysisMode> size="sm" value={mode}
          onChange={(v) => patch({ mode: v })}
          options={[
            { value: 'time', label: 'Tiempo' },
            { value: 'depth', label: 'Profundidad' },
            { value: 'infinite', label: 'Infinito' },
          ]} />
      </div>

      {mode === 'time' && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-dim text-xs">Segundos</span>
          <Select value={timeSec} onChange={(e) => patch({ timeSec: Number(e.target.value) })} className="py-1.5">
            {[5, 10, 30, 60, 120].map((s) => <option key={s} value={s}>{s} s</option>)}
          </Select>
        </div>
      )}
      {mode === 'depth' && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-dim text-xs">Profundidad</span>
          <Select value={depth} onChange={(e) => patch({ depth: Number(e.target.value) })} className="py-1.5">
            {[16, 20, 24, 28, 32, 40].map((d) => <option key={d} value={d}>{d}</option>)}
          </Select>
        </div>
      )}
    </div>
  );
}
