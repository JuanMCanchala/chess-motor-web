'use client';

import { useEffect, useRef } from 'react';

interface Props { moves: string[]; }

export default function MoveHistory({ moves }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [moves]);

  // Agrupar en pares
  const pairs: [string, string][] = [];
  for (let i = 0; i < moves.length; i += 2)
    pairs.push([moves[i] ?? '', moves[i + 1] ?? '']);

  if (pairs.length === 0)
    return (
      <div className="flex-1 flex items-center justify-center text-dim text-sm italic">
        Sin movimientos
      </div>
    );

  return (
    <div ref={ref} className="flex-1 overflow-y-auto pr-1">
      {pairs.map(([w, b], i) => (
        <div key={i} className="grid grid-cols-[1.5rem_1fr_1fr] gap-x-1 text-sm py-0.5">
          <span className="text-dim text-right text-xs leading-6">{i + 1}.</span>
          <span className={`px-1.5 py-0.5 rounded font-mono text-xs
            ${i * 2 === moves.length - 1 ? 'bg-accent text-base font-semibold' : 'hover:bg-hover'}`}>
            {w}
          </span>
          <span className={`px-1.5 py-0.5 rounded font-mono text-xs
            ${b && i * 2 + 1 === moves.length - 1 ? 'bg-accent text-base font-semibold' : 'hover:bg-hover'}`}>
            {b}
          </span>
        </div>
      ))}
    </div>
  );
}
