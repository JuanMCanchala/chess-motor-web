'use client';

import { useEffect } from 'react';
import { useNavStore } from '@/store/navStore';
import { useStudyStore } from '@/store/studyStore';
import { Icon, IconName } from './Icon';
import { Button, Card } from './ui';

interface Action {
  icon: IconName; title: string; desc: string; cta: string;
  onClick: () => void;
}

export default function HomeTab() {
  const studies = useStudyStore((s) => s.studies);

  useEffect(() => {
    if (useStudyStore.getState().studies.length === 0) useStudyStore.getState().load();
  }, []);

  const actions: Action[] = [
    { icon: 'play', title: 'Jugar', desc: 'Juega contra un motor o un amigo', cta: 'Jugar',
      onClick: () => useNavStore.getState().setTab('play') },
    { icon: 'grid', title: 'Tablero de análisis', desc: 'Analiza una partida o posición', cta: 'Abrir',
      onClick: () => useNavStore.getState().setTab('analysis') },
    { icon: 'target', title: 'Nuevo repertorio', desc: 'Construye y practica tus aperturas', cta: 'Crear',
      onClick: () => { const n = prompt('Nombre del repertorio:'); if (n) { useStudyStore.getState().addStudy(n); useNavStore.getState().setTab('study'); } } },
    { icon: 'download', title: 'Importar partida', desc: 'Importa una partida desde un PGN', cta: 'Importar',
      onClick: () => useNavStore.getState().setTab('files') },
    { icon: 'cpu', title: 'Match de módulos', desc: 'Enfrenta dos motores y mide su fuerza', cta: 'Match',
      onClick: () => useNavStore.getState().setTab('match') },
  ];

  function openStudy(id: string) {
    useStudyStore.getState().selectStudy(id);
    useNavStore.getState().setTab('study');
  }

  return (
    <div className="max-w-[1400px] mx-auto px-2 py-2">
      {/* Tarjetas de acción */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        {actions.map((a) => (
          <Card key={a.title} className="p-5 flex flex-col items-center text-center gap-2">
            <div className="w-14 h-14 rounded-2xl bg-base flex items-center justify-center text-accent mb-1">
              <Icon name={a.icon} size={28} />
            </div>
            <h3 className="text-fg font-semibold">{a.title}</h3>
            <p className="text-dim text-xs leading-relaxed flex-1">{a.desc}</p>
            <Button variant="primary" className="w-full mt-2" onClick={a.onClick}>{a.cta}</Button>
          </Card>
        ))}
      </div>

      {/* Archivos recientes */}
      <h2 className="text-fg font-bold text-lg mt-8 mb-3">Archivos recientes</h2>
      <Card className="p-4 min-h-[200px]">
        {studies.length === 0 ? (
          <div className="h-[180px] flex flex-col items-center justify-center text-dim gap-2">
            <Icon name="clock" size={36} />
            <span className="text-sm">No hay archivos recientes</span>
          </div>
        ) : (
          <div className="flex flex-col">
            {studies.map((s) => (
              <button key={s.id} onClick={() => openStudy(s.id)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-hover text-left transition-colors">
                <Icon name="book" size={16} className="text-accent" />
                <span className="text-fg text-sm flex-1">{s.name}</span>
                <span className="text-dim text-xs">{s.chapters.length} capítulos</span>
              </button>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
