import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createClient } from '@/lib/supabase/client';
import { timeAgo } from '@/lib/time-ago';
import Navbar from '@/components/layout/Navbar';
import Sidebar from '@/components/layout/Sidebar';
import PageHeader from '@/components/layout/PageHeader';
import RecentActivityDrawer from '@/components/layout/RecentActivityDrawer';
import PeopleTable from '@/components/people/PeopleTable';

interface TeamMember {
  full_name: string;
  role: string;
}

export default function Dashboard() {
  const [member, setMember] = useState<TeamMember | null>(() => {
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
          .select('full_name, role')
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
    <div className="min-h-screen bg-background">
      <Navbar
        fullName={member.full_name}
        role={member.role}
        lastUpdatedText={lastUpdatedText}
        onActivityOpen={() => setActivityOpen(true)}
        onSidebarToggle={() => setSidebarCollapsed((c) => !c)}
      />
      <div className="flex">
        <Sidebar collapsed={sidebarCollapsed} />
        <main className="flex-1 px-4 py-8 overflow-x-hidden">
          <PageHeader />
          <PeopleTable />
        </main>
      </div>
      <RecentActivityDrawer
        open={activityOpen}
        onOpenChange={setActivityOpen}
      />
    </div>
  );
}
