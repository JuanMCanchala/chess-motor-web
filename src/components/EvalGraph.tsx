'use client';

import { useTreeStore } from '@/store/treeStore';

const W = 460;
const H = 64;
const CLAMP = 600;   // centipawns en el borde del gráfico

function toY(cp: number): number {
  let v = cp;
  if (Math.abs(v) > 29000) v = v > 0 ? CLAMP : -CLAMP;   // mate → extremo
  v = Math.max(-CLAMP, Math.min(CLAMP, v));
  return H * (1 - (v + CLAMP) / (2 * CLAMP));
}

export default function EvalGraph() {
  const nodes     = useTreeStore((s) => s.nodes);
  const rootId    = useTreeStore((s) => s.rootId);
  const currentId = useTreeStore((s) => s.currentId);
  const goTo      = useTreeStore((s) => s.goTo);

  // Mainline
  const line: typeof nodes[string][] = [];
  { let id: string | undefined = rootId; while (id) { line.push(nodes[id]); id = nodes[id].children[0]; } }

  const haveEval = line.some((n) => typeof n.evalCp === 'number');
  if (!haveEval || line.length < 2) return null;

  const n = line.length;
  const dx = n > 1 ? W / (n - 1) : W;
  const pts = line.map((node, i) => {
    const cp = typeof node.evalCp === 'number' ? node.evalCp : 0;
    return { x: i * dx, y: toY(cp), id: node.id, cp };
  });

  const area =
    `M0,${H} ` + pts.map((p) => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') +
    ` L${W},${H} Z`;
  const poly = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const curIdx = line.findIndex((node) => node.id === currentId);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}
         className="bg-base border border-border rounded-md block">
      {/* mitad inferior = ventaja negras */}
      <rect x="0" y={H / 2} width={W} height={H / 2} fill="#0b1220" />
      <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke="#334155" strokeWidth="1" />
      <path d={area} fill="rgba(226,232,240,0.18)" />
      <polyline points={poly} fill="none" stroke="#e2e8f0" strokeWidth="1.5" />
      {curIdx >= 0 && (
        <line x1={pts[curIdx].x} y1="0" x2={pts[curIdx].x} y2={H}
              stroke="#22c55e" strokeWidth="1.5" />
      )}
      {/* puntos clicables */}
      {pts.map((p) => (
        <circle key={p.id} cx={p.x} cy={p.y} r="5" fill="transparent"
                style={{ cursor: 'pointer' }} onClick={() => goTo(p.id)}>
          <title>{(p.cp / 100).toFixed(2)}</title>
        </circle>
      ))}
    </svg>
  );
}
