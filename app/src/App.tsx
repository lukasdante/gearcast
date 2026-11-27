import './styles/shell.css';
import { Sidebar } from './shell/Sidebar';
import { TopBar } from './shell/TopBar';
import { ChatLauncher } from './shell/ChatLauncher';
import { DialogHost } from './shell/Modal';
import { Placeholder } from './pages/Placeholder';
import { PmMonitoring } from './pages/PmMonitoring';
import { Dashboard } from './pages/Dashboard';
import { Splash } from './shell/Splash';
import { Assets } from './pages/Assets';
import { SpareReadiness } from './pages/SpareReadiness';
import { PlantOverview } from './overview/PlantOverview';
import { useRoute } from './store/route';
import { Troubleshoot } from './pages/Troubleshoot';
import { Incidents } from './pages/Incidents';
import { RepairReplace } from './pages/RepairReplace';
import { Knowledge } from './pages/Knowledge';
import { Login } from './pages/Login';
import { useEffect } from 'react';
import { useAuth } from './store/authStore';
import { syncAssignments } from './api/assignments';
import { syncPlants } from './api/plants';
import { ScanHost } from './qr/ScanHost';
import { Labels } from './qr/Labels';

const TITLES = {
  assets: ['Assets', 'Asset register, history and procedures per unit.'],
  pm: ['PM Monitoring', 'Preventive maintenance due dates, overdue tasks and compliance.'],
  spares: ['Spare Readiness', 'Installed standby and stored spare readiness checks.'],
} as const;

export default function App() {
  const route = useRoute();
  const { user, ready, load } = useAuth();
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (user) { syncAssignments(); syncPlants(); } }, [user]);
  if (!ready) return null;
  if (!user) return <Login />;
  return (
    <div className="app">
      <TopBar />
      <Sidebar route={route} />
      <main className="app-main">
        {route === 'dashboard' ? <Dashboard />
          : route === 'overview' ? <PlantOverview />
          : route === 'troubleshoot' ? <Troubleshoot />
            : route === 'incidents' ? <Incidents />
              : route === 'rr' ? <RepairReplace />
                : route === 'knowledge' ? <Knowledge />
                  : route === 'pm' ? <PmMonitoring />
                    : route === 'assets' ? <Assets />
                    : route === 'spares' ? <SpareReadiness />
                    : route === 'labels' ? <Labels />
                  : <Placeholder title={TITLES[route as keyof typeof TITLES][0]} text={TITLES[route as keyof typeof TITLES][1]} />}
      </main>
      <ChatLauncher />
      <Splash />
      <ScanHost />
      <DialogHost />
    </div>
  );
}
