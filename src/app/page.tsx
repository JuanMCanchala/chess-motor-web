'use client';

import { useState }   from 'react';
import PlayTab        from '@/components/PlayTab';
import AnalysisTab    from '@/components/AnalysisTab';
import WsProvider     from '@/components/WsProvider';
import { useWsStatus } from '@/lib/ws';

type Tab = 'play' | 'analysis';

export default function Home() {
  const [tab, setTab] = useState<Tab>('play');

  return (
    <WsProvider>
      <Header tab={tab} onTab={setTab} />
      <main className="p-5">
        {tab === 'play'     && <PlayTab />}
        {tab === 'analysis' && <AnalysisTab />}
      </main>
    </WsProvider>
  );
}

function Header({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  const { status } = useWsStatus();

  const dotColor: Record<string, string> = {
    connected:    'bg-accent shadow-[0_0_6px_#22c55e]',
    disconnected: 'bg-danger',
    connecting:   'bg-amber-400',
  };
  const dotLabel: Record<string, string> = {
    connected: 'Conectado', disconnected: 'Desconectado', connecting: 'Conectando…',
  };

  return (
    <header className="sticky top-0 z-50 flex items-center gap-6 px-6 py-2.5
                       bg-card border-b border-border">
      <div className="text-lg font-bold tracking-tight">
        <span className="text-accent text-xl">K</span>allpaModulo
        <span className="ml-2 text-xs text-dim bg-hover px-1.5 py-0.5 rounded">C++ v8</span>
      </div>

      <nav className="flex gap-1 ml-auto">
        {(['play', 'analysis'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => onTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors
              ${tab === t
                ? 'bg-accent text-base'
                : 'text-dim hover:bg-hover hover:text-slate-100'}`}
          >
            {t === 'play' ? 'Jugar' : 'Análisis'}
          </button>
        ))}
      </nav>

      <div className="flex items-center gap-2 text-xs text-dim">
        <span className={`w-2 h-2 rounded-full ${dotColor[status] ?? 'bg-dim'}`} />
        {dotLabel[status] ?? status}
      </div>
    </header>
  );
}
