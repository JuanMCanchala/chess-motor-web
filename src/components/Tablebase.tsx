'use client';

import { useEffect, useState, useRef } from 'react';
import { Icon } from './Icon';

interface TbMove { uci: string; san: string; category: string; dtz: number | null; dtm: number | null; }
interface TbData { category: string; dtz: number | null; moves: TbMove[]; }

function countPieces(fen: string): number {
  let c = 0;
  for (const ch of fen.split(' ')[0]) if (/[a-zA-Z]/.test(ch)) c++;
  return c;
}

// Categoría desde la perspectiva del jugador que mueve (la API la da para la
// posición resultante, i.e. del rival → la invertimos).
const INVERT: Record<string, string> = {
  win: 'loss', loss: 'win', draw: 'draw',
  'cursed-win': 'blessed-loss', 'blessed-loss': 'cursed-win',
  'maybe-win': 'maybe-loss', 'maybe-loss': 'maybe-win',
};
const LABEL: Record<string, string> = {
  win: 'Gana', loss: 'Pierde', draw: 'Tablas',
  'cursed-win': 'Gana (regla 50)', 'blessed-loss': 'Pierde (regla 50)',
  'maybe-win': 'Gana', 'maybe-loss': 'Pierde',
};
const COLOR: Record<string, string> = {
  win: 'text-accent', loss: 'text-danger', draw: 'text-fg-dim',
  'cursed-win': 'text-accent', 'blessed-loss': 'text-danger',
  'maybe-win': 'text-accent', 'maybe-loss': 'text-danger',
};

export default function Tablebase({ fen, onPlay }: { fen: string; onPlay: (uci: string) => void }) {
  const [data, setData]       = useState<TbData | null>(null);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const enabled = countPieces(fen) <= 7;

  useEffect(() => {
    if (!enabled) { setData(null); return; }
    const ac = new AbortController();
    abortRef.current?.abort();
    abortRef.current = ac;
    const t = setTimeout(() => {
      setLoading(true);
      fetch(`https://tablebase.lichess.ovh/standard?fen=${encodeURIComponent(fen)}`, { signal: ac.signal })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
        .then((j: TbData) => { setData(j); setLoading(false); })
        .catch((e) => { if (e.name !== 'AbortError') setLoading(false); });
    }, 250);
    return () => { clearTimeout(t); ac.abort(); };
  }, [fen, enabled]);

  if (!enabled) return null;

  return (
    <div className="bg-card border border-accent/40 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-base text-dim text-xs">
        <span className="inline-flex items-center gap-1.5"><Icon name="flag" size={12} /> Tablebase (Syzygy)</span>
        {data && (
          <span className={`font-semibold ${COLOR[data.category] ?? 'text-dim'}`}>
            {loading ? '…' : LABEL[data.category] ?? '—'}
          </span>
        )}
      </div>
      <div className="overflow-y-auto" style={{ maxHeight: 150 }}>
        {data?.moves?.slice(0, 8).map((m) => {
          const cat = INVERT[m.category] ?? m.category;
          return (
            <button key={m.uci} onClick={() => onPlay(m.uci)}
              className="w-full flex items-center gap-2 px-3 py-1.5 border-t border-border
                         first:border-t-0 hover:bg-hover text-left">
              <span className="font-mono text-xs font-semibold text-fg w-12">{m.san}</span>
              <span className={`text-xs font-medium w-24 ${COLOR[cat] ?? 'text-dim'}`}>{LABEL[cat] ?? cat}</span>
              {m.dtz != null && <span className="text-[10px] text-dim ml-auto">DTZ {Math.abs(m.dtz)}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
