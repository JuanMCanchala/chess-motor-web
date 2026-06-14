'use client';

import { useState, useEffect } from 'react';
import { useDatabasesStore } from '@/store/databasesStore';
import { Icon } from './Icon';
import { Button, Card, Input } from './ui';

const ONLINE = [
  { name: 'Lichess — Maestros', desc: 'Millones de partidas de maestros (online). En Análisis → Database → Maestros.' },
  { name: 'Lichess — Online', desc: 'Partidas online por rango de Elo. Análisis → Database → Online.' },
  { name: 'Mega Database 2026', desc: 'Tu base ChessBase (~11.7M) indexándose localmente; aparecerá al terminar.' },
];

export default function DatabasesTab() {
  const dbs = useDatabasesStore((s) => s.dbs);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [pgn, setPgn]   = useState('');
  const [msg, setMsg]   = useState('');

  useEffect(() => { useDatabasesStore.getState().load(); }, []);

  function create() {
    if (!pgn.trim()) { setMsg('Pega un PGN.'); return; }
    setMsg('Indexando…');
    setTimeout(() => {
      const r = useDatabasesStore.getState().add(name.trim() || 'Base local', pgn);
      if (r.ok) { setMsg(`Indexadas ${r.games} partidas.`); setPgn(''); setName(''); setOpen(false); }
      else setMsg('No se encontraron partidas válidas en el PGN.');
    }, 30);
  }

  return (
    <div className="max-w-5xl mx-auto">
      <h2 className="text-xl font-bold text-fg mb-4 flex items-center gap-2">
        <Icon name="database" size={18} /> Databases
      </h2>

      {/* Bases locales (importadas) */}
      {dbs.length > 0 && (
        <>
          <h3 className="text-accent text-sm font-semibold mb-2">Bases locales</h3>
          <div className="grid grid-cols-3 gap-3 mb-6">
            {dbs.map((d) => (
              <Card key={d.id} className="p-4 border-accent/40">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-fg truncate">{d.name}</div>
                  <button onClick={() => useDatabasesStore.getState().remove(d.id)} title="Borrar"
                    className="text-dim hover:text-danger"><Icon name="trash" size={14} /></button>
                </div>
                <div className="text-dim text-xs mt-2">{d.games.toLocaleString()} partidas · úsala en Análisis → Database</div>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Importar PGN */}
      {!open ? (
        <Button variant="primary" icon="plus" className="mb-6" onClick={() => { setOpen(true); setMsg(''); }}>
          Importar PGN como base
        </Button>
      ) : (
        <Card className="p-4 mb-6 flex flex-col gap-2 max-w-2xl">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre de la base…" />
          <textarea value={pgn} onChange={(e) => setPgn(e.target.value)} placeholder="Pega aquí el PGN (una o muchas partidas)…" rows={6}
            className="bg-base border border-border text-fg rounded-lg px-3 py-2 text-xs font-mono focus:border-accent outline-none resize-y" />
          <div className="flex items-center gap-3">
            <Button variant="primary" onClick={create}>Crear base</Button>
            <button onClick={() => setOpen(false)} className="text-dim text-sm hover:text-fg">Cancelar</button>
            {msg && <span className="text-xs text-dim">{msg}</span>}
          </div>
        </Card>
      )}

      {/* Fuentes online / Mega */}
      <h3 className="text-accent text-sm font-semibold mb-2">Fuentes</h3>
      <div className="grid grid-cols-3 gap-3">
        {ONLINE.map((d) => (
          <Card key={d.name} className="p-4">
            <div className="font-semibold text-fg">{d.name}</div>
            <p className="text-dim text-xs mt-2 leading-relaxed">{d.desc}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
