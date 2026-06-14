'use client';

import { useEffect } from 'react';
import { wsConnect, wsCmd }  from '@/lib/ws';
import { useUiStore } from '@/store/uiStore';
import { useEnginesStore } from '@/store/enginesStore';
import { useDatabasesStore } from '@/store/databasesStore';

/** Monta la conexión WebSocket y carga las preferencias guardadas al arrancar. */
export default function WsProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    useUiStore.getState().hydrate();
    useEnginesStore.getState().load();
    useDatabasesStore.getState().load();
    wsConnect();
    // Si el motor activo persistido no es el default (stockfish), aplícalo
    const eng = useEnginesStore.getState().active();
    if (eng && eng.id !== 'stockfish') {
      wsCmd('set_engine', { id: eng.id, kind: eng.kind, path: eng.path, threads: eng.threads, hash: eng.hash });
    }
  }, []);
  return <>{children}</>;
}
