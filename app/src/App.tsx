import './styles/shell.css';
import { Sidebar } from './shell/Sidebar';
import { TopBar } from './shell/TopBar';
import { ChatLauncher } from './shell/ChatLauncher';
import { Placeholder } from './pages/Placeholder';
import { PlantOverview } from './overview/PlantOverview';
import { useRoute } from './store/route';

const TITLES = {
  assets: ['Assets', 'Asset register, history and procedures per unit.'],
  pm: ['PM Monitoring', 'Preventive maintenance due dates, overdue tasks and compliance.'],
  spares: ['Spare Readiness', 'Installed standby and stored spare readiness checks.'],
  incidents: ['Incidents', 'Incident reports — required before an asset is taken out of service.'],
} as const;

export default function App() {
  const route = useRoute();
  return (
    <div className="app">
      <TopBar />
      <Sidebar route={route} />
      <main className="app-main">
        {route === 'overview' ? <PlantOverview /> : <Placeholder title={TITLES[route as keyof typeof TITLES][0]} text={TITLES[route as keyof typeof TITLES][1]} />}
      </main>
      <ChatLauncher />
    </div>
  );
}
