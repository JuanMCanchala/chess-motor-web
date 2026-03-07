'use client';

import { useEffect } from 'react';
import { wsConnect }  from '@/lib/ws';

/** Monta la conexión WebSocket una vez al arrancar la app. */
export default function WsProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => { wsConnect(); }, []);
  return <>{children}</>;
}
