import './styles/shell.css';
import { Sidebar } from './shell/Sidebar';
import { TopBar } from './shell/TopBar';
import { ChatLauncher } from './shell/ChatLauncher';
import { Placeholder } from './pages/Placeholder';
import { PlantOverview } from './overview/PlantOverview';
import { useRoute } from './store/route';
import { Troubleshoot } from './pages/Troubleshoot';
import { Incidents } from './pages/Incidents';
import { RepairReplace } from './pages/RepairReplace';
import { Knowledge } from './pages/Knowledge';

const TITLES = {
  assets: ['Assets', 'Asset register, history and procedures per unit.'],
  pm: ['PM Monitoring', 'Preventive maintenance due dates, overdue tasks and compliance.'],
  spares: ['Spare Readiness', 'Installed standby and stored spare readiness checks.'],
} as const;

export default function App() {
  const route = useRoute();
  return (
    <div className="app">
      <TopBar />
      <Sidebar route={route} />
      <main className="app-main">
        {route === 'overview' ? <PlantOverview />
          : route === 'troubleshoot' ? <Troubleshoot />
            : route === 'incidents' ? <Incidents />
              : route === 'rr' ? <RepairReplace />
                : route === 'knowledge' ? <Knowledge />
                  : <Placeholder title={TITLES[route as keyof typeof TITLES][0]} text={TITLES[route as keyof typeof TITLES][1]} />}
      </main>
      <ChatLauncher />
    </div>
  );
}
