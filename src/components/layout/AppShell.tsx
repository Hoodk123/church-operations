import { useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { createClient } from '@/lib/supabase/client';
import { timeAgo } from '@/lib/time-ago';
import { ShellContext, type ShellMember } from './shell';
import Navbar from './Navbar';
import Sidebar from './Sidebar';
import BottomNav from './BottomNav';
import RecentActivityDrawer from './RecentActivityDrawer';

export default function AppShell() {
  const [member, setMember] = useState<ShellMember | null>(() => {
    try {
      const cached = localStorage.getItem('cached_team_member_profile');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const [lastUpdatedText, setLastUpdatedText] = useState('No data yet');
  const [activityOpen, setActivityOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const navigate = useNavigate();
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;
      if (!user) {
        navigate('/login');
        return;
      }

      try {
        const { data } = await supabase
          .from('team_members')
          .select('id, full_name, role')
          .eq('auth_user_id', user.id)
          .maybeSingle();

        if (data) {
          setMember(data);
          try {
            localStorage.setItem('cached_team_member_profile', JSON.stringify(data));
          } catch {
            // Ignore localStorage errors
          }
        }
      } catch {
        // Network error / offline - fallback to cached profile in state
      }

      try {
        const { data: latest } = await supabase
          .from('people')
          .select('updated_at')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latest) {
          setLastUpdatedText(`Updated ${timeAgo(latest.updated_at)}`);
        }
      } catch {
        // Network error / offline - leave default text
      }
    }
    load();
  }, [supabase, navigate]);

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
