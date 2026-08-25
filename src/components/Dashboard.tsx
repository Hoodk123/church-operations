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
  const [member, setMember] = useState<TeamMember | null>(null);
  const [lastUpdatedText, setLastUpdatedText] = useState('No data yet');
  const [activityOpen, setActivityOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const navigate = useNavigate();
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate('/login'); return; }

      const { data } = await supabase
        .from('team_members')
        .select('full_name, role')
        .eq('auth_user_id', user.id)
        .single();

      setMember(data);

      const { data: latest } = await supabase
        .from('people')
        .select('updated_at')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latest) {
        setLastUpdatedText(`Updated ${timeAgo(latest.updated_at)}`);
      }
    }
    load();
  }, [supabase, navigate]);

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate('/login');
  }

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
        onLogout={handleLogout}
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
