'use client';

import { useUiStore, BOARD_THEMES, BoardTheme, Theme } from '@/store/uiStore';

function Toggle({ label, desc, v, set }: { label: string; desc?: string; v: boolean; set: (b: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border">
      <div>
        <div className="text-fg text-sm">{label}</div>
        {desc && <div className="text-dim text-xs">{desc}</div>}
      </div>
      <button onClick={() => set(!v)}
        className={`w-12 h-6 rounded-full relative transition-colors ${v ? 'bg-accent' : 'bg-hover'}`}>
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${v ? 'left-6' : 'left-0.5'}`} />
      </button>
    </div>
  );
}

function Select<T extends string>({ label, desc, value, set, options }: {
  label: string; desc?: string; value: T; set: (v: T) => void; options: { v: T; l: string }[];
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border">
      <div>
        <div className="text-fg text-sm">{label}</div>
        {desc && <div className="text-dim text-xs">{desc}</div>}
      </div>
      <select value={value} onChange={(e) => set(e.target.value as T)}
        className="bg-base border border-border text-fg rounded-md px-3 py-1.5 text-sm capitalize">
        {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </div>
  );
}

export default function SettingsTab() {
  const theme        = useUiStore((s) => s.theme);
  const setTheme     = useUiStore((s) => s.setTheme);
  const boardTheme   = useUiStore((s) => s.boardTheme);
  const setBoardTheme = useUiStore((s) => s.setBoardTheme);
  const sound        = useUiStore((s) => s.sound);
  const setSound     = useUiStore((s) => s.setSound);
  const coords       = useUiStore((s) => s.coords);
  const setCoords    = useUiStore((s) => s.setCoords);

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-xl font-bold text-fg mb-2">Configuración</h2>

      <h3 className="text-accent text-sm font-semibold mt-4 mb-1">Apariencia</h3>
      <Select<Theme> label="Tema" value={theme} set={setTheme}
        options={[{ v: 'dark', l: 'Oscuro' }, { v: 'light', l: 'Claro' }]} />
      <Select<BoardTheme> label="Color del tablero" value={boardTheme} set={setBoardTheme}
        options={(Object.keys(BOARD_THEMES) as BoardTheme[]).map((b) => ({ v: b, l: b }))} />

      <h3 className="text-accent text-sm font-semibold mt-6 mb-1">Tablero</h3>
      <Toggle label="Coordenadas" desc="Mostrar coordenadas en el tablero" v={coords} set={setCoords} />

      <h3 className="text-accent text-sm font-semibold mt-6 mb-1">Sonido</h3>
      <Toggle label="Sonido de jugada" desc="Reproducir un sonido al mover" v={sound} set={setSound} />
    </div>
  );
}
