import ecoData from '@/data/eco.json';

const ECO = ecoData as Record<string, string[]>;

function key(fen: string): string {
  const p = fen.split(' ');
  return `${p[0]} ${p[1]} ${p[2]}`;
}

export interface Opening { eco: string; name: string; }

export function ecoLookup(fen: string): Opening | null {
  const v = ECO[key(fen)];
  return v ? { eco: v[0], name: v[1] } : null;
}

/** Dado el camino de FENs (raíz→actual), la apertura conocida más profunda. */
export function ecoForPath(fens: string[]): Opening | null {
  for (let i = fens.length - 1; i >= 0; i--) {
    const v = ECO[key(fens[i])];
    if (v) return { eco: v[0], name: v[1] };
  }
  return null;
}
