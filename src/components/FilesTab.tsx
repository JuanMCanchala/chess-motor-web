'use client';

import { useEffect, useState } from 'react';
import { useStudyStore } from '@/store/studyStore';
import { useTreeStore } from '@/store/treeStore';
import { useNavStore } from '@/store/navStore';
import { Icon } from './Icon';

export default function FilesTab({ onOpenStudy }: { onOpenStudy: (id: string) => void }) {
  const studies = useStudyStore((s) => s.studies);
  const [importing, setImporting] = useState(false);
  const [pgn, setPgn] = useState('');

  useEffect(() => {
    if (useStudyStore.getState().studies.length === 0) useStudyStore.getState().load();
  }, []);

  function createRepertoire() {
    const n = prompt('Nombre del repertorio/estudio:');
    if (n) useStudyStore.getState().addStudy(n);
  }

  function openPgn() {
    if (!pgn.trim()) return;
    if (!useTreeStore.getState().loadPgn(pgn)) { alert('PGN inválido'); return; }
    setPgn(''); setImporting(false);
    useNavStore.getState().setTab('analysis');
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-fg flex items-center gap-2"><Icon name="folder" size={18} /> Files</h2>
        <div className="flex gap-2">
          <button onClick={() => setImporting((v) => !v)}
            className="bg-hover text-fg px-3 py-1.5 rounded-md text-sm inline-flex items-center gap-1.5 hover:opacity-80">
            <Icon name="download" size={14} /> Importar PGN
          </button>
          <button onClick={createRepertoire}
            className="bg-accent text-white px-3 py-1.5 rounded-md text-sm inline-flex items-center gap-1.5 hover:opacity-90">
            <Icon name="plus" size={14} /> Crear repertorio
          </button>
        </div>
      </div>

      {importing && (
        <div className="bg-card border border-border rounded-lg p-3 mb-4 flex flex-col gap-2 max-w-2xl">
          <textarea value={pgn} onChange={(e) => setPgn(e.target.value)} placeholder="Pega un PGN para abrirlo en Análisis…" rows={5}
            className="bg-base border border-border text-fg rounded-md px-3 py-2 text-xs font-mono focus:border-accent outline-none resize-y" />
          <button onClick={openPgn} className="self-start bg-accent text-white px-3 py-1.5 rounded-md text-sm">Abrir en Análisis</button>
        </div>
      )}

      <div className="flex gap-2 mb-3">
        {['Game', 'Repertoire', 'Tournament', 'Puzzle', 'Other'].map((t) => (
          <span key={t} className={`px-3 py-1 rounded-full text-xs border ${t === 'Repertoire' ? 'border-accent text-accent' : 'border-border text-dim'}`}>{t}</span>
        ))}
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="grid grid-cols-[1fr_140px_120px] px-3 py-2 bg-base text-dim text-xs font-semibold">
          <span>Nombre</span><span>Tipo</span><span>Capítulos</span>
        </div>
        {studies.length === 0 ? (
          <div className="px-3 py-10 text-center text-dim text-sm">Sin archivos — crea un repertorio o importa un PGN</div>
        ) : studies.map((s) => (
          <button key={s.id} onClick={() => onOpenStudy(s.id)}
            className="w-full grid grid-cols-[1fr_140px_120px] px-3 py-2.5 border-t border-border text-left hover:bg-hover items-center">
            <span className="text-fg text-sm flex items-center gap-2"><Icon name="book" size={14} /> {s.name}</span>
            <span className="text-dim text-xs">Repertoire</span>
            <span className="text-dim text-xs">{s.chapters.length}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
