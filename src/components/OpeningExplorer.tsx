'use client';

import { useEffect, useState, useRef } from 'react';
import { useDatabasesStore } from '@/store/databasesStore';
import { lookupDb } from '@/lib/openingIndex';

interface MoveRow {
  uci: string; san: string;
  white: number; draws: number; black: number;
  averageRating?: number;
}
interface ExplorerData {
  white: number; draws: number; black: number;
  moves: MoveRow[];
}

function pct(n: number, total: number) { return total ? Math.round((n / total) * 100) : 0; }
function fmtK(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(n >= 10_000 ? 0 : 1) + 'k';
  return String(n);
}

export default function OpeningExplorer({ fen, onPlay }: {
  fen: string; onPlay: (uci: string) => void;
}) {
  const dbs = useDatabasesStore((s) => s.dbs);
  const [source, setSource]   = useState<string>('masters');
  const [data, setData]       = useState<ExplorerData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [retry, setRetry]     = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const isOnline = source === 'masters' || source === 'lichess';

  useEffect(() => {
    setError(null);
    if (!isOnline) {
      const db = useDatabasesStore.getState().get(source);
      setData(db ? lookupDb(db.index, fen) : { white: 0, draws: 0, black: 0, moves: [] });
      setLoading(false);
      return;
    }
    const ac = new AbortController();
    abortRef.current?.abort();
    abortRef.current = ac;
    const url = `/api/explorer?source=${source}&fen=${encodeURIComponent(fen)}`;
    const t = setTimeout(() => {
      setLoading(true);
      fetch(url, { signal: ac.signal })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
        .then((j: ExplorerData & { error?: string }) => {
          if (j.error) throw new Error('upstream');
          setData(j); setLoading(false);
        })
        .catch((e) => { if (e.name !== 'AbortError') { setError('Sin conexión a Lichess'); setLoading(false); } });
    }, 250);
    return () => { clearTimeout(t); ac.abort(); };
  }, [fen, source, retry, isOnline]);

  const total = data ? data.white + data.draws + data.black : 0;
  const tabs: { id: string; label: string }[] = [
    { id: 'masters', label: 'Maestros' },
    { id: 'lichess', label: 'Online' },
    ...dbs.map((d) => ({ id: d.id, label: d.name })),
  ];

  return (
    <div className="bg-card border border-border rounded-lg flex flex-col min-h-0">
      <div className="flex items-center gap-1 px-3 py-1.5 bg-base border-b border-border flex-wrap">
        {tabs.map((s) => (
          <button key={s.id} onClick={() => setSource(s.id)}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors
              ${source === s.id ? 'bg-accent text-white' : 'text-dim hover:bg-hover'}`}>
            {s.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-dim">{loading ? '…' : total ? `${fmtK(total)} partidas` : ''}</span>
      </div>

      <div className="overflow-y-auto" style={{ maxHeight: 260 }}>
        {error && (
          <div className="px-3 py-3 text-dim text-xs flex items-center gap-2">
            {error}
            <button onClick={() => setRetry((r) => r + 1)} className="bg-hover text-fg px-2 py-0.5 rounded hover:opacity-80">Reintentar</button>
          </div>
        )}
        {!error && data && data.moves.length === 0 && (
          <div className="px-3 py-3 text-dim text-xs italic">Sin partidas en esta posición</div>
        )}
        {!error && data?.moves.map((m) => {
          const g = m.white + m.draws + m.black;
          return (
            <button key={m.uci} onClick={() => onPlay(m.uci)}
              className="w-full flex items-center gap-2 px-3 py-1.5 border-t border-border first:border-t-0 hover:bg-hover text-left">
              <span className="font-mono text-xs font-semibold text-fg w-12 shrink-0">{m.san}</span>
              <span className="text-xs text-dim w-14 shrink-0 text-right">{fmtK(g)}</span>
              <span className="flex-1 flex h-3.5 rounded overflow-hidden text-[9px] leading-[14px] text-center">
                <span className="bg-slate-100 text-slate-700" style={{ width: `${pct(m.white, g)}%` }}>{pct(m.white, g) >= 12 ? pct(m.white, g) + '%' : ''}</span>
                <span className="bg-slate-500 text-fg" style={{ width: `${pct(m.draws, g)}%` }}>{pct(m.draws, g) >= 12 ? pct(m.draws, g) + '%' : ''}</span>
                <span className="bg-slate-900 text-fg-dim" style={{ width: `${pct(m.black, g)}%` }}>{pct(m.black, g) >= 12 ? pct(m.black, g) + '%' : ''}</span>
              </span>
              <span className="text-[10px] text-dim w-9 shrink-0 text-right">{m.averageRating || ''}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
