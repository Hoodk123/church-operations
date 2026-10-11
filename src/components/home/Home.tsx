import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowRight, UserCheck, UserPlus, Phone, Clock, GraduationCap, Droplets, CalendarCheck } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { rlsErrorMessage } from '@/lib/rls-error';
import { daysSince } from '@/lib/dates';
import { cn } from '@/lib/utils';
import PageHeader from '@/components/layout/PageHeader';
import { useShellMember } from '@/components/layout/shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface HomePerson {
  id: string;
  first_name: string;
  last_name: string;
  follow_up_status: string;
  date_registered: string | null;
  last_contact_date: string | null;
  assigned_to: string | null;
  needs_pastor: boolean;
}

interface VolunteerWeek {
  id: string;
  full_name: string;
  contacted_this_week: number;
}

interface Counts {
  attendanceToday: number;
  attendanceLastSunday: number;
  visitorsWeek: number;
  convertsWeek: number;
  contactedWeek: number;
  waitingM1: number;
  needBaptism: number;
}

const GONE_QUIET = ['Contacted', 'Met', 'Ongoing'];

function isoShift(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

function overdueDays(p: HomePerson): number {
  if (p.follow_up_status === 'Not Started') {
    return p.date_registered ? daysSince(p.date_registered) : 0;
  }
  return p.last_contact_date ? daysSince(p.last_contact_date) : 0;
}

function isOverdue(p: HomePerson): boolean {
  if (p.follow_up_status === 'Not Started') {
    return p.date_registered ? daysSince(p.date_registered) > 3 : false;
  }
  if (GONE_QUIET.includes(p.follow_up_status)) {
    return p.last_contact_date ? daysSince(p.last_contact_date) > 14 : false;
  }
  return false;
}

function fetchHomePeople(supabase: SupabaseClient) {
  return supabase
    .from('people')
    .select(
      'id, first_name, last_name, follow_up_status, date_registered, last_contact_date, assigned_to, needs_pastor'
    )
    .neq('follow_up_status', 'Completed');
}

function fetchCounts(supabase: SupabaseClient): Promise<Counts> {
  const today = isoShift(0);
  const dow = new Date().getDay();
  const weekStart = isoShift(-dow);
  const prevSunday = isoShift(-(dow === 0 ? 7 : dow));

  const head = { count: 'exact' as const, head: true };

  return Promise.all([
    supabase.from('attendance').select('*', head).eq('service_date', today),
    supabase.from('attendance').select('*', head).eq('service_date', prevSunday),
    supabase
      .from('people')
      .select('*', head)
      .eq('category', 'Visitor')
      .gte('date_registered', weekStart),
    supabase
      .from('people')
      .select('*', head)
      .eq('category', 'New Convert')
      .gte('date_registered', weekStart),
    supabase.from('contact_log').select('*', head).gte('contacted_at', weekStart),
    supabase
      .from('people')
      .select('*', head)
      .eq('needs_m1', true),
    supabase
      .from('people')
      .select('*', head)
      .eq('needs_baptism', true)
      .neq('baptism_status', 'Baptized'),
  ]).then(([todayRes, sundayRes, visitorsRes, convertsRes, contactedRes, m1Res, baptismRes]) => ({
    attendanceToday: todayRes.count ?? 0,
    attendanceLastSunday: sundayRes.count ?? 0,
    visitorsWeek: visitorsRes.count ?? 0,
    convertsWeek: convertsRes.count ?? 0,
    contactedWeek: contactedRes.count ?? 0,
    waitingM1: m1Res.count ?? 0,
    needBaptism: baptismRes.count ?? 0,
  }));
}

async function fetchVolunteers(
  supabase: SupabaseClient
): Promise<{ error: unknown; data: VolunteerWeek[] }> {
  const { data, error } = await supabase.rpc('get_volunteer_overview');
  if (error || !data) return { error, data: [] };
  const rows = (data as Record<string, unknown>[]).map((v) => ({
    id: String(v.team_member_id ?? v.id ?? ''),
    full_name: String(v.full_name ?? ''),
    contacted_this_week: Number(v.contacted_this_week ?? 0),
  }));
  return { error: null, data: rows };
}

export default function Home() {
  const supabase = createClient();
  const member = useShellMember();
  const isAdmin = member?.role === 'Admin';
  const [people, setPeople] = useState<HomePerson[] | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [volunteers, setVolunteers] = useState<VolunteerWeek[] | null>(null);

  const load = useCallback(async () => {
    const [peopleRes, countsData, volunteersRes] = await Promise.all([
      fetchHomePeople(supabase),
      fetchCounts(supabase),
      fetchVolunteers(supabase),
    ]);
    if (peopleRes.error) {
      toast.error(rlsErrorMessage(peopleRes.error));
      setPeople([]);
    } else {
      setPeople((peopleRes.data ?? []) as unknown as HomePerson[]);
    }
    setCounts(countsData);
    if (volunteersRes.error) toast.error(rlsErrorMessage(volunteersRes.error));
    setVolunteers(volunteersRes.data);
  }, [supabase]);

  useEffect(() => {
    async function run() {
      await load();
    }
    void run();
  }, [load]);

  const derived = useMemo(() => {
    const all = people ?? [];
    const waiting = all.filter((p) => !p.last_contact_date);
    const noVolunteer = waiting.filter((p) => !p.assigned_to);
    const unassigned = all.filter((p) => !p.assigned_to);
    const overdue = all.filter(isOverdue);
    const needsPastor = all.filter((p) => p.needs_pastor);

    const needsYou: { id: string; name: string; reason: string; href: string }[] = [];
    const seen = new Set<string>();
    const push = (p: HomePerson, reason: string, href: string) => {
      if (seen.has(p.id)) return;
      seen.add(p.id);
      needsYou.push({
        id: p.id,
        name: `${p.first_name} ${p.last_name}`,
        reason,
        href,
      });
    };

    unassigned
      .slice()
      .sort((a, b) => overdueDays(b) - overdueDays(a))
      .forEach((p) => push(p, 'No volunteer yet', '/needs-attention'));
    overdue
      .slice()
      .sort((a, b) => overdueDays(b) - overdueDays(a))
      .forEach((p) =>
        push(p, `${overdueDays(p)} days overdue`, '/needs-attention')
      );
    needsPastor.forEach((p) => push(p, 'Asked for the pastor', '/dashboard'));

    return {
      waitingCount: waiting.length,
      noVolunteerCount: noVolunteer.length,
      overdueCount: overdue.length,
      needsYou: needsYou.slice(0, 5),
      activeVolunteers: (volunteers ?? [])
        .slice()
        .sort((a, b) => b.contacted_this_week - a.contacted_this_week),
    };
  }, [people, volunteers]);

  if (people === null || counts === null) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const diff = counts.attendanceToday - counts.attendanceLastSunday;
  const diffLabel =
    diff === 0
      ? 'Same as last Sunday'
      : diff > 0
        ? `${diff} more than last Sunday`
        : `${Math.abs(diff)} fewer than last Sunday`;

  const tiles = [
    {
      label: 'Checked in today',
      value: counts.attendanceToday,
      sub: diffLabel,
      icon: UserCheck,
    },
    {
      label: 'New visitors',
      value: counts.visitorsWeek,
      sub: `${counts.convertsWeek} new converts`,
      icon: UserPlus,
    },
    {
      label: 'Waiting for first contact',
      value: derived.waitingCount,
      sub: `${derived.noVolunteerCount} have no volunteer`,
      icon: Phone,
    },
    {
      label: 'Overdue follow-ups',
      value: derived.overdueCount,
      sub: 'Open Attention',
      icon: Clock,
      href: '/needs-attention',
    },
    {
      label: 'Waiting for M1',
      value: counts.waitingM1,
      sub: 'Open the M1 class',
      icon: GraduationCap,
      href: '/m1',
    },
    {
      label: 'Need baptism',
      value: counts.needBaptism,
      sub: 'Open the baptism list',
      icon: Droplets,
      href: '/baptism',
    },
    {
      label: 'Contacted this week',
      value: counts.contactedWeek,
      sub: 'since Sunday',
      icon: CalendarCheck,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {tiles
          .filter((tile) => isAdmin || (tile.href !== '/m1' && tile.href !== '/baptism'))
          .map((tile) => {
          const inner = (
            <Card
              className={cn(
                'h-full',
                tile.href && 'transition-colors hover:bg-accent/50',
                tile.href === '/needs-attention' && derived.overdueCount > 0 && 'border-destructive/60'
              )}
            >
              <CardContent className="flex flex-col gap-1 pt-6">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <tile.icon className="size-4" />
                  <span className="text-xs font-medium">{tile.label}</span>
                </div>
                <span className="text-3xl font-heading font-medium tabular-nums">
                  {tile.value}
                </span>
                <span className="text-xs text-muted-foreground">{tile.sub}</span>
              </CardContent>
            </Card>
          );
          return tile.href ? (
            <Link key={tile.label} to={tile.href} className="block">
              {inner}
            </Link>
          ) : (
            <div key={tile.label}>{inner}</div>
          );
        })}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Needs you</CardTitle>
          </CardHeader>
          <CardContent>
            {derived.needsYou.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Nothing needs your attention.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {derived.needsYou.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-lg border p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{item.reason}</p>
                    </div>
                    <Link
                      to={item.href}
                      className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline"
                    >
                      Open
                      <ArrowRight className="size-3.5" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Volunteers this week</CardTitle>
          </CardHeader>
          <CardContent>
            {derived.activeVolunteers.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No volunteers yet.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {derived.activeVolunteers.map((v) => (
                  <li
                    key={v.id}
                    className="flex items-center justify-between gap-3 rounded-lg border p-3"
                  >
                    <span className="truncate text-sm font-medium">{v.full_name}</span>
                    <Badge variant="secondary" className="tabular-nums">
                      {v.contacted_this_week}{' '}
                      {v.contacted_this_week === 1 ? 'contact' : 'contacts'}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
