import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api/client';
import { timeAgo } from '@/lib/time-ago';
import { ShellContext, type ShellMember } from './shell';
import Navbar from './Navbar';
import Sidebar from './Sidebar';
import BottomNav from './BottomNav';
import RecentActivityDrawer from './RecentActivityDrawer';

export default function AppShell() {
  const { member: ctxMember } = useAuth();
  // ShellUI shape stays snake_case; the API member is camelCase.
  const member: ShellMember | null = ctxMember
    ? { id: ctxMember.id, full_name: ctxMember.fullName, role: ctxMember.role }
    : null;
  const [lastUpdatedText, setLastUpdatedText] = useState('No data yet');
  const [activityOpen, setActivityOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    if (!member) return; // login gate above re-renders once /api/auth/me resolves

    let mounted = true;
    async function load() {
      try {
        const metrics = await api<{ lastPersonUpdatedAt: string | null }>('/api/metrics');
        if (mounted && metrics.lastPersonUpdatedAt) {
          setLastUpdatedText(`Updated ${timeAgo(metrics.lastPersonUpdatedAt)}`);
        }
      } catch {
        // offline — leave last text as is
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, [member?.id]);

  if (!member) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <ShellContext.Provider value={{ member }}>
      <div className="min-h-screen bg-background">
        <Navbar
          fullName={member.full_name}
          role={member.role}
          lastUpdatedText={lastUpdatedText}
          onActivityOpen={() => setActivityOpen(true)}
          onSidebarToggle={() => setSidebarCollapsed((c) => !c)}
        />
        <div className="flex">
          <Sidebar collapsed={sidebarCollapsed} role={member.role} />
          <main className="min-w-0 flex-1 overflow-x-hidden px-4 py-6 pb-24 md:pb-8 print:overflow-visible print:p-0">
            <Outlet />
          </main>
        </div>
        <BottomNav role={member.role} />
        <RecentActivityDrawer
          open={activityOpen}
          onOpenChange={setActivityOpen}
        />
      </div>
    </ShellContext.Provider>
  );
}
