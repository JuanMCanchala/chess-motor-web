'use client';

interface Props { evalCp: number | null; orientation: 'white' | 'black'; }

export default function EvalBar({ evalCp, orientation }: Props) {
  const cp  = evalCp === null ? 0 : (orientation === 'white' ? evalCp : -evalCp);
  const pct = 50 + 50 * Math.tanh(cp / 400);          // sigmoid 0-100
  const abs = (Math.abs(cp) / 100).toFixed(2);
  const label = cp > 0 ? `+${abs}` : cp < 0 ? `-${abs}` : '0.00';

  return (
    <div className="flex flex-col items-center self-stretch w-3.5 rounded overflow-hidden
                    border border-border bg-[#1e3a5f] relative" style={{ height: 480 }}>
      {/* Fill blanco desde abajo */}
      <div
        className="absolute bottom-0 w-full bg-slate-100 transition-all duration-500"
        style={{ height: `${pct}%` }}
      />
      <span className="absolute bottom-1 text-[9px] text-slate-600 rotate-180"
            style={{ writingMode: 'vertical-rl' }}>
        {label}
      </span>
    </div>
  );
}
