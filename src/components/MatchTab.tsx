'use client';

import { useState, useEffect, useRef } from 'react';
import { Icon } from './Icon';
import { Button, Card, Select } from './ui';

interface Module { id: string; name: string; available: boolean; }
interface MatchState {
  running: boolean;
  total: number; played: number;
  a: number; d: number; b: number;       // victorias A, tablas, victorias B
  nameA: string; nameB: string;
  last: string;
  elo?: number; eloErr?: number;
  log: string[];
}

const INIT: MatchState = { running: false, total: 0, played: 0, a: 0, d: 0, b: 0, nameA: 'A', nameB: 'B', last: '', log: [] };

export default function MatchTab() {
  const [modules, setModules] = useState<Module[]>([]);
  const [a, setA] = useState('stockfish');
  const [b, setB] = useState('hce');
  const [games, setGames] = useState(20);
  const [st, setSt] = useState('1');
  const [conc, setConc] = useState(2);
  const [m, setM] = useState<MatchState>(INIT);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    fetch('/api/match/modules').then((r) => r.json()).then((j) => {
      setModules(j.modules || []);
      const avail = (j.modules || []).filter((x: Module) => x.available);
      if (avail[0]) setA(avail[0].id);
      if (avail[1]) setB(avail[1].id);
    }).catch(() => {});
    return () => esRef.current?.close();
  }, []);

  function start() {
    if (a === b) { alert('Elige dos módulos distintos'); return; }
    setM({ ...INIT, running: true });
    const url = `/api/match/run?a=${a}&b=${b}&games=${games}&st=${st}&concurrency=${conc}`;
    const es = new EventSource(url);
    esRef.current = es;
    es.onmessage = (e) => {
      const ev = JSON.parse(e.data);
      setM((prev) => {
        const next = { ...prev };
        if (ev.type === 'info') {
          if (ev.total) next.total = ev.total;
          if (ev.nameA) next.nameA = ev.nameA;
          if (ev.nameB) next.nameB = ev.nameB;
          if (ev.message) next.log = [...prev.log, ev.message].slice(-6);
          if (typeof ev.elo === 'number') { next.elo = ev.elo; next.eloErr = ev.eloErr; }
        } else if (ev.type === 'game') {
          next.a = ev.w; next.d = ev.d; next.b = ev.l; next.played = ev.played;
          next.last = ev.outcome === 'a' ? `Gana ${prev.nameA}` : ev.outcome === 'b' ? `Gana ${prev.nameB}` : 'Tablas';
        } else if (ev.type === 'done') {
          next.running = false;
          next.log = [...prev.log, `Match terminado (${ev.w}-${ev.d}-${ev.l})`].slice(-6);
        } else if (ev.type === 'error') {
          next.running = false;
          next.log = [...prev.log, 'Error: ' + ev.message].slice(-6);
        }
        return next;
      });
      if (ev.type === 'done' || ev.type === 'error') es.close();
    };
    es.onerror = () => { es.close(); setM((p) => ({ ...p, running: false })); };
  }

  function stop() { esRef.current?.close(); setM((p) => ({ ...p, running: false })); }

  const total = m.a + m.d + m.b;
  const scoreA = (m.a + m.d / 2).toFixed(1);
  const scoreB = (m.b + m.d / 2).toFixed(1);
  const pctA = total ? (m.a / total) * 100 : 50;
  const pctD = total ? (m.d / total) * 100 : 0;

  const Sel = ({ value, set }: { value: string; set: (v: string) => void }) => (
    <Select value={value} onChange={(e) => set(e.target.value)} disabled={m.running}>
      {modules.map((mod) => <option key={mod.id} value={mod.id} disabled={!mod.available}>
        {mod.name}{mod.available ? '' : ' (no disponible)'}
      </option>)}
    </Select>
  );

  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-xl font-bold text-fg mb-1 flex items-center gap-2"><Icon name="cpu" size={18} /> Match de módulos</h2>
      <p className="text-dim text-sm mb-5">Enfrenta dos motores/módulos UCI (vía cutechess) y observa el marcador en vivo.</p>

      <Card className="p-4 flex flex-col gap-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-dim">Módulo A<Sel value={a} set={setA} /></label>
          <span className="text-dim pb-2 font-bold">vs</span>
          <label className="flex flex-col gap-1 text-xs text-dim">Módulo B<Sel value={b} set={setB} /></label>
        </div>

        <div className="flex items-end gap-3 flex-wrap">
          <label className="flex flex-col gap-1 text-xs text-dim">Partidas
            <input type="number" value={games} min={2} max={1000} disabled={m.running}
              onChange={(e) => setGames(Math.max(2, Math.min(1000, +e.target.value || 2)))}
              className="bg-base border border-border text-fg rounded-lg px-3 py-2 text-sm w-24 outline-none focus:border-accent" /></label>
          <label className="flex flex-col gap-1 text-xs text-dim">Seg/jugada
            <Select value={st} onChange={(e) => setSt(e.target.value)} disabled={m.running}>
              {['0.1', '0.5', '1', '2', '5'].map((s) => <option key={s} value={s}>{s}s</option>)}
            </Select></label>
          <label className="flex flex-col gap-1 text-xs text-dim">Concurrencia
            <Select value={conc} onChange={(e) => setConc(+e.target.value)} disabled={m.running}>
              {[1, 2, 4, 6, 8].map((c) => <option key={c} value={c}>{c}</option>)}
            </Select></label>
          <div className="flex-1" />
          {!m.running
            ? <Button variant="primary" icon="play" className="px-5 py-2.5" onClick={start}>Iniciar match</Button>
            : <Button variant="danger" icon="stop" className="px-5 py-2.5" onClick={stop}>Parar</Button>}
        </div>
      </Card>

      {/* Marcador */}
      {(m.running || total > 0) && (
        <Card className="p-4 mt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-fg font-semibold">{m.nameA}</span>
            <span className="text-dim text-xs">{m.played}{m.total ? ` / ${m.total}` : ''} partidas{m.running ? ' · jugando…' : ''}</span>
            <span className="text-fg font-semibold">{m.nameB}</span>
          </div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-accent text-2xl font-mono font-bold">{scoreA}</span>
            <span className="text-dim text-sm">{m.a}W · {m.d}T · {m.b}L</span>
            <span className="text-2xl font-mono font-bold text-fg">{scoreB}</span>
          </div>
          {/* Barra W/D/L */}
          <div className="flex h-4 rounded overflow-hidden text-[10px] leading-4 text-center mb-2">
            <span className="bg-accent text-white" style={{ width: `${pctA}%` }}>{pctA >= 10 ? Math.round(pctA) + '%' : ''}</span>
            <span className="bg-slate-500 text-white" style={{ width: `${pctD}%` }}>{pctD >= 10 ? Math.round(pctD) + '%' : ''}</span>
            <span className="bg-slate-800 text-fg-dim" style={{ width: `${100 - pctA - pctD}%` }} />
          </div>
          {typeof m.elo === 'number' && (
            <div className="text-sm text-dim">Elo Δ ({m.nameA} − {m.nameB}): <span className="text-fg font-mono">{m.elo > 0 ? '+' : ''}{m.elo} ± {m.eloErr}</span></div>
          )}
          {m.last && <div className="text-xs text-dim mt-1">Última: {m.last}</div>}
        </Card>
      )}

      {m.log.length > 0 && (
        <div className="bg-base border border-border rounded-lg p-3 mt-4 text-xs text-dim font-mono flex flex-col gap-0.5">
          {m.log.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}
    </div>
  );
}
