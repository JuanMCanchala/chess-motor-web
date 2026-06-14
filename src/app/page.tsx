'use client';

import HomeTab        from '@/components/HomeTab';
import PlayTab        from '@/components/PlayTab';
import AnalysisTab    from '@/components/AnalysisTab';
import StudyTab       from '@/components/StudyTab';
import SettingsTab    from '@/components/SettingsTab';
import EnginesTab     from '@/components/EnginesTab';
import MatchTab       from '@/components/MatchTab';
import DatabasesTab   from '@/components/DatabasesTab';
import FilesTab       from '@/components/FilesTab';
import WsProvider     from '@/components/WsProvider';
import { useWsStatus } from '@/lib/ws';
import { useUiStore } from '@/store/uiStore';
import { useStudyStore } from '@/store/studyStore';
import { useNavStore, Tab } from '@/store/navStore';
import { Icon, IconName } from '@/components/Icon';

const NAV: { tab: Tab; icon: IconName; label: string }[] = [
  { tab: 'home',      icon: 'home',     label: 'Inicio' },
  { tab: 'analysis',  icon: 'grid',     label: 'Análisis' },
  { tab: 'play',      icon: 'play',     label: 'Jugar' },
  { tab: 'study',     icon: 'book',     label: 'Estudio' },
  { tab: 'engines',   icon: 'cpu',      label: 'Engines' },
  { tab: 'match',     icon: 'target',   label: 'Match' },
  { tab: 'databases', icon: 'database', label: 'Databases' },
  { tab: 'files',     icon: 'folder',   label: 'Files' },
];

export default function Home() {
  const tab    = useNavStore((s) => s.tab);
  const setTab = useNavStore((s) => s.setTab);

  function openStudy(id: string) {
    useStudyStore.getState().selectStudy(id);
    setTab('study');
  }

  return (
    <WsProvider>
      <div className="flex flex-col h-screen">
        <TopBar />
        <div className="flex flex-1 min-h-0">
          <Sidebar tab={tab} onTab={setTab} />
          <main className="flex-1 overflow-auto px-4 py-3">
            {tab === 'home'      && <HomeTab />}
            {tab === 'analysis'  && <AnalysisTab />}
            {tab === 'play'      && <PlayTab />}
            {tab === 'study'     && <StudyTab />}
            {tab === 'engines'   && <EnginesTab />}
            {tab === 'match'     && <MatchTab />}
            {tab === 'databases' && <DatabasesTab />}
            {tab === 'files'     && <FilesTab onOpenStudy={openStudy} />}
            {tab === 'settings'  && <SettingsTab />}
          </main>
        </div>
      </div>
    </WsProvider>
  );
}

function Sidebar({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  const Item = ({ t, icon, label }: { t: Tab; icon: IconName; label: string }) => (
    <button onClick={() => onTab(t)} title={label}
      className={`w-11 h-11 flex items-center justify-center rounded-lg transition-colors
        ${tab === t ? 'bg-accent text-white' : 'text-dim hover:bg-hover hover:text-fg'}`}>
      <Icon name={icon} size={20} />
    </button>
  );
  return (
    <nav className="w-14 shrink-0 bg-card border-r border-border flex flex-col items-center gap-1 py-3">
      {NAV.map((n) => <Item key={n.tab} t={n.tab} icon={n.icon} label={n.label} />)}
      <div className="flex-1" />
      <Item t="settings" icon="settings" label="Config" />
    </nav>
  );
}

function TopBar() {
  const { status } = useWsStatus();
  const theme       = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);

  const dotColor: Record<string, string> = {
    connected: 'bg-green-500 shadow-[0_0_6px_#22c55e]',
    disconnected: 'bg-danger', connecting: 'bg-amber-400',
  };
  const dotLabel: Record<string, string> = {
    connected: 'Conectado', disconnected: 'Desconectado', connecting: 'Conectando…',
  };

  return (
    <header className="shrink-0 flex items-center gap-4 px-4 py-2 bg-card border-b border-border">
      <div className="text-base font-bold tracking-tight">
        <span className="text-accent text-lg">K</span>allpa
      </div>
      <div className="flex-1" />
      <button onClick={toggleTheme} title="Tema claro/oscuro"
        className="text-fg hover:bg-hover rounded-md p-1.5 flex items-center">
        <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
      </button>
      <div className="flex items-center gap-2 text-xs text-dim">
        <span className={`w-2 h-2 rounded-full ${dotColor[status] ?? 'bg-dim'}`} />
        {dotLabel[status] ?? status}
      </div>
    </header>
  );
}
