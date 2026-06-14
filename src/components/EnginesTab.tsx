'use client';

import { useState } from 'react';
import { wsCmd } from '@/lib/ws';
import { useEnginesStore, EngineCfg } from '@/store/enginesStore';
import { Icon } from './Icon';

function NumberField({ label, value, set, min = 1, max = 1024 }: {
  label: string; value: number; set: (n: number) => void; min?: number; max?: number;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-dim">
      {label}
      <input type="number" value={value} min={min} max={max}
        onChange={(e) => set(Math.max(min, Math.min(max, Number(e.target.value) || min)))}
        className="bg-base border border-border text-fg rounded-md px-2 py-1.5 text-sm" />
    </label>
  );
}

export default function EnginesTab() {
  const engines  = useEnginesStore((s) => s.engines);
  const activeId = useEnginesStore((s) => s.activeId);
  const update   = useEnginesStore((s) => s.update);
  const setActive = useEnginesStore((s) => s.setActive);
  const [selId, setSelId] = useState(activeId);
  const [busy, setBusy]   = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPath, setNewPath] = useState('');

  const sel = engines.find((e) => e.id === selId) ?? engines[0];

  async function activate(e: EngineCfg) {
    setBusy(true);
    const r = await wsCmd<{ ok: boolean; error?: string }>('set_engine',
      { kind: e.kind, path: e.path, threads: e.threads, hash: e.hash });
    setBusy(false);
    if (r && r.ok === false) { alert('No se pudo iniciar el motor: ' + (r.error || '')); return; }
    setActive(e.id);
  }

  function addEngine() {
    if (!newPath.trim()) { alert('Indica la ruta al .exe del motor UCI'); return; }
    const id = useEnginesStore.getState().add(newName.trim() || 'Motor UCI', newPath.trim());
    setSelId(id); setAdding(false); setNewName(''); setNewPath('');
  }

  return (
    <div className="max-w-5xl mx-auto">
      <h2 className="text-xl font-bold text-fg mb-4 flex items-center gap-2"><Icon name="cpu" size={18} /> Engines</h2>

      <div className="flex gap-5 items-start">
        {/* Tarjetas */}
        <div className="grid grid-cols-1 gap-3 w-72 shrink-0">
          {engines.map((e) => (
            <button key={e.id} onClick={() => setSelId(e.id)}
              className={`text-left rounded-lg border p-4 transition-colors
                ${selId === e.id ? 'border-accent bg-card' : 'border-border bg-card hover:border-dim'}`}>
              <div className="flex items-center justify-between">
                <div className="font-semibold text-fg truncate">{e.name}</div>
                {e.id === activeId && <span className="text-[10px] bg-accent text-white px-1.5 py-0.5 rounded">ACTIVO</span>}
              </div>
              <div className="flex gap-6 mt-2 text-xs">
                <div><div className="text-dim">ELO</div><div className="text-fg font-mono">{e.elo || '—'}</div></div>
                <div><div className="text-dim">Tipo</div><div className="text-fg font-mono uppercase">{e.kind}</div></div>
              </div>
            </button>
          ))}
          <button onClick={() => setAdding(true)}
            className="rounded-lg border border-dashed border-border p-4 text-center text-dim text-sm hover:border-accent hover:text-fg">
            <Icon name="plus" size={16} className="mx-auto mb-1" /> Add New
            <div className="text-[10px] mt-1">añadir motor UCI</div>
          </button>
        </div>

        {/* Panel derecho */}
        <div className="flex-1 bg-card border border-border rounded-lg p-5">
          {adding ? (
            <div className="flex flex-col gap-3 max-w-lg">
              <h3 className="text-fg font-semibold">Añadir motor UCI</h3>
              <label className="flex flex-col gap-1 text-xs text-dim">Nombre
                <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="p.ej. Komodo, Leela, módulo HCE…"
                  className="bg-base border border-border text-fg rounded-md px-2 py-1.5 text-sm" /></label>
              <label className="flex flex-col gap-1 text-xs text-dim">Ruta al ejecutable (.exe)
                <input value={newPath} onChange={(e) => setNewPath(e.target.value)} placeholder="C:\\ruta\\al\\motor.exe"
                  className="bg-base border border-border text-fg rounded-md px-2 py-1.5 text-sm font-mono" /></label>
              <p className="text-xs text-dim">Cualquier motor compatible con UCI (incluidos los módulos UCI de tu tesis que usa cutechess).</p>
              <div className="flex gap-3">
                <button onClick={addEngine} className="bg-accent text-white px-4 py-1.5 rounded-md text-sm hover:opacity-90">Añadir</button>
                <button onClick={() => setAdding(false)} className="text-dim text-sm hover:text-fg">Cancelar</button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-fg font-semibold">{sel.name}</div>
                  <div className="text-dim text-xs uppercase">{sel.kind}</div>
                </div>
                <div className="flex items-center gap-2">
                  {!sel.builtin && (
                    <button onClick={() => { useEnginesStore.getState().remove(sel.id); setSelId('stockfish'); }}
                      className="text-danger text-sm inline-flex items-center gap-1 hover:opacity-80"><Icon name="trash" size={14} /> Quitar</button>
                  )}
                  {sel.id === activeId
                    ? <span className="text-accent text-sm">Motor activo</span>
                    : <button onClick={() => activate(sel)} disabled={busy}
                        className="bg-accent text-white px-4 py-1.5 rounded-md text-sm hover:opacity-90 disabled:opacity-50">
                        {busy ? 'Cambiando…' : 'Activar este motor'}</button>}
                </div>
              </div>

              {sel.kind === 'kallpa' ? (
                <div className="text-sm text-dim">
                  <p>Tu motor de tesis <b className="text-fg">KallpaModulo</b> (protocolo propio JSON, no UCI).</p>
                  <p className="mt-2">Al activarlo, Jugar y Análisis usan tu motor en vez de Stockfish.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {sel.kind === 'uci' && (
                    <label className="col-span-2 flex flex-col gap-1 text-xs text-dim">Ruta (.exe)
                      <input value={sel.path ?? ''} onChange={(e) => update(sel.id, { path: e.target.value })}
                        className="bg-base border border-border text-fg rounded-md px-2 py-1.5 text-sm font-mono" /></label>
                  )}
                  <NumberField label="Hilos (Threads)" value={sel.threads} set={(n) => update(sel.id, { threads: n })} min={1} max={32} />
                  <NumberField label="Hash (MB)" value={sel.hash} set={(n) => update(sel.id, { hash: n })} min={16} max={8192} />
                  <p className="col-span-2 text-xs text-dim">MultiPV y modo se ajustan en Análisis. Cambiar opciones requiere reactivar el motor.</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
