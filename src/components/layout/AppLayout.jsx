import BackgroundWork from './BackgroundWork';
import Sidebar from './Sidebar';
import { useState, useEffect } from 'react';
import { useWorkspace } from '@/lib/WorkspaceContext';

export default function AppLayout() {
  const { db } = useWorkspace();
  const [stats, setStats] = useState({ agentCount: 0, activeSessions: 0 });

  useEffect(() => {
    if (!db) return;
    const loadStats = async () => {
      try {
        const [agents, sessions] = await Promise.all([
          db.Agent.list(),
          db.Session.filter({ status: 'round1' }),
        ]);
        setStats({ agentCount: agents.length, activeSessions: sessions.length });
      } catch (e) {}
    };
    loadStats();
    const timer=setInterval(loadStats,60000);return()=>clearInterval(timer);
  }, [db]);

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: 'var(--wr-bg-primary)' }}>
      <Sidebar stats={stats} />
      <main className="flex-1 ml-56 min-h-screen overflow-auto">
        <BackgroundWork />
      </main>
    </div>
  );
}
