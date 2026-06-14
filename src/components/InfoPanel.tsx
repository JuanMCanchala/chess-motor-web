'use client';

import { useState } from 'react';
import { useTreeStore } from '@/store/treeStore';
import { ecoForPath } from '@/lib/eco';
import { Icon } from './Icon';

function Chk({ label, v, set }: { label: string; v: boolean; set: (b: boolean) => void }) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-fg cursor-pointer select-none">
      <input type="checkbox" checked={v} onChange={(e) => set(e.target.checked)} />
      {label}
    </label>
  );
}

export default function InfoPanel({ fen }: { fen: string }) {
  const nodes     = useTreeStore((s) => s.nodes);     // re-render al cambiar el árbol
  const currentId = useTreeStore((s) => s.currentId);
  const [comments, setComments]     = useState(true);
  const [glyphs, setGlyphs]         = useState(true);
  const [variations, setVariations] = useState(true);

  const pgn = useTreeStore.getState().exportPgn({ comments, glyphs, variations });

  // Apertura (deepest ECO) por el camino actual
  const pathFens: string[] = [];
  { let id: string | null = currentId; while (id) { pathFens.unshift(nodes[id].fen); id = nodes[id].parentId; } }
  const opening = ecoForPath(pathFens);

  const copy = (t: string) => navigator.clipboard?.writeText(t);

  return (
    <div className="flex flex-col gap-3 text-sm">
      {opening && (
        <div>
          <span className="text-accent text-xs font-mono mr-2">{opening.eco}</span>
          <span className="text-fg">{opening.name}</span>
        </div>
      )}

      <div className="grid grid-cols-3 text-xs">
        <div><div className="text-fg font-semibold">BLANCAS</div><div className="text-dim">?</div></div>
        <div className="text-center"><div className="text-dim">Evento</div><div className="text-dim">?</div></div>
        <div className="text-right"><div className="text-fg font-semibold">NEGRAS</div><div className="text-dim">?</div></div>
      </div>

      <div>
        <label className="text-dim text-xs">FEN</label>
        <div className="flex gap-2">
          <input readOnly value={fen}
            className="flex-1 min-w-0 bg-base border border-border text-fg rounded-md px-2 py-1.5 text-xs font-mono" />
          <button onClick={() => copy(fen)} title="Copiar FEN"
            className="bg-hover text-fg rounded-md px-2 shrink-0"><Icon name="copy" size={14} /></button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-dim text-xs">PGN</span>
          <Chk label="Comentarios" v={comments} set={setComments} />
          <Chk label="Glifos" v={glyphs} set={setGlyphs} />
          <Chk label="Variantes" v={variations} set={setVariations} />
          <button onClick={() => copy(pgn)} title="Copiar PGN"
            className="ml-auto bg-hover text-fg rounded-md px-2 py-1"><Icon name="copy" size={14} /></button>
        </div>
        <pre className="bg-base border border-border rounded-md px-3 py-2 text-xs font-mono
                        text-fg-dim whitespace-pre-wrap break-words max-h-48 overflow-y-auto">{pgn}</pre>
      </div>
    </div>
  );
}
