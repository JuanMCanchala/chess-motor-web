'use client';

import { useEffect, useRef } from 'react';
import { useTreeStore, TreeNode } from '@/store/treeStore';

const NAG_COLOR: Record<string, string> = {
  '!!': 'text-emerald-400',
  '!':  'text-accent',
  '!?': 'text-sky-400',
  '?!': 'text-amber-400',
  '?':  'text-orange-400',
  '??': 'text-danger',
};

export default function MoveTree({ hideComments = false }: { hideComments?: boolean }) {
  const nodes     = useTreeStore((s) => s.nodes);
  const rootId    = useTreeStore((s) => s.rootId);
  const currentId = useTreeStore((s) => s.currentId);
  const goTo      = useTreeStore((s) => s.goTo);
  const ref       = useRef<HTMLDivElement>(null);

  // Auto-scroll a la jugada actual
  useEffect(() => {
    ref.current?.querySelector('[data-current="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [currentId]);

  const root = nodes[rootId];

  function MoveBtn({ n, withNumber }: { n: TreeNode; withNumber: boolean }) {
    const isCurrent = n.id === currentId;
    const prefix = n.isWhite ? `${n.moveNo}.` : withNumber ? `${n.moveNo}…` : '';
    return (
      <button
        data-current={isCurrent}
        onClick={() => goTo(n.id)}
        className={`px-1 py-0.5 rounded font-mono text-xs transition-colors
          ${isCurrent ? 'bg-accent text-white font-semibold' : 'hover:bg-hover text-fg'}`}
      >
        {prefix}{n.san}
        {n.nag && <span className={NAG_COLOR[n.nag] ?? 'text-dim'}>{n.nag}</span>}
      </button>
    );
  }

  // Renderiza el nodo `startId` y su continuación principal. Las alternativas a
  // una jugada (los demás hijos del padre) se emiten entre paréntesis justo
  // después de la jugada principal, al estilo ChessBase.
  function renderLine(startId: string, forceNumber: boolean): React.ReactNode[] {
    const out: React.ReactNode[] = [];
    let id: string | undefined = startId;
    let withNumber = forceNumber;

    while (id) {
      const n: TreeNode = nodes[id];
      out.push(<MoveBtn key={n.id} n={n} withNumber={withNumber} />);
      let forceNext = false;

      if (n.comment && !hideComments) {
        out.push(
          <span key={`c-${n.id}`} className="text-dim text-xs italic px-1 break-words">
            {n.comment}
          </span>,
        );
        forceNext = true; // tras un comentario, la siguiente recupera el número
      }

      // Alternativas a ESTA jugada = los otros hijos del padre (solo si n es el principal)
      const parent = n.parentId ? nodes[n.parentId] : null;
      const isMain = parent ? parent.children[0] === n.id : false;
      if (parent && isMain && parent.children.length > 1) {
        for (const alt of parent.children.slice(1)) {
          out.push(
            <span key={`v-${alt}`} className="text-dim mx-0.5 inline-flex flex-wrap items-baseline gap-0.5">
              ({renderLine(alt, true)})
            </span>,
          );
        }
        forceNext = true; // tras una variante, la principal recupera el número
      }

      withNumber = forceNext;
      id = n.children[0];
    }
    return out;
  }

  const hasMoves = root.children.length > 0;

  return (
    <div ref={ref} className="flex-1 overflow-y-auto leading-relaxed">
      {!hasMoves ? (
        <div className="h-full flex items-center justify-center text-dim text-sm italic">
          Mueve una pieza o importa un PGN
        </div>
      ) : (
        <div className="flex flex-wrap items-baseline gap-0.5">
          {renderLine(root.children[0], true)}
        </div>
      )}
    </div>
  );
}
