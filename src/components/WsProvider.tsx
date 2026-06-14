'use client';

import { useEffect, useState } from 'react';
import { ChessboardDnDProvider } from 'react-chessboard';
import { wsConnect, wsCmd }  from '@/lib/ws';
import { useUiStore } from '@/store/uiStore';
import { useEnginesStore } from '@/store/enginesStore';
import { useDatabasesStore } from '@/store/databasesStore';

/** Monta la conexión WebSocket y carga las preferencias guardadas al arrancar.
 *  ChessboardDnDProvider envuelve toda la app: un ÚNICO backend de arrastre
 *  compartido por todos los tableros (evita "dos HTML5 backends" al montar/
 *  desmontar tableros en pestañas y secciones). Se monta solo en cliente porque
 *  su backend HTML5 usa `window` (rompería el SSR). */
export default function WsProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
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

  if (!mounted) return <>{children}</>;   // SSR + primer paint: sin board visible aún
  return <ChessboardDnDProvider>{children}</ChessboardDnDProvider>;
}
