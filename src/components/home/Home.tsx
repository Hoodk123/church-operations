import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowRight, UserCheck, UserPlus, Phone, Clock, GraduationCap, Droplets, CalendarCheck } from 'lucide-react';
import { daysSince } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { allOpenPeople, homeMetrics, volunteerOverview } from '@/lib/api/metrics';
import PageHeader from '@/components/layout/PageHeader';
import { useShellMember } from '@/components/layout/shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

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

export default function Home() {
  const member = useShellMember();
  const isAdmin = member?.role === 'Admin';
  const [people, setPeople] = useState<HomePerson[] | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [volunteers, setVolunteers] = useState<VolunteerWeek[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const [openPeople, countsData, volunteersData] = await Promise.all([
        allOpenPeople(),
        homeMetrics(),
        isAdmin ? volunteerOverview() : Promise.resolve({ items: [] }),
      ]);
      setPeople(openPeople.map((person) => ({
        id: person.id,
        first_name: person.firstName,
        last_name: person.lastName,
        follow_up_status: person.followUpStatus,
        date_registered: person.dateRegistered,
        last_contact_date: person.lastContactDate,
        assigned_to: person.assignedTo,
        needs_pastor: person.needsPastor,
      })));
      setCounts(countsData);
      setVolunteers(volunteersData.items.map((volunteer) => ({
        id: volunteer.id,
        full_name: volunteer.fullName,
        contacted_this_week: volunteer.contactedThisWeek,
      })));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load the dashboard.');
      setLoadError(true);
    }
  }, [isAdmin]);

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
    if (loadError) {
      return (
        <div className="flex flex-col gap-4">
          <PageHeader />
          <div className="flex flex-col items-center gap-3 py-12">
            <p role="alert" className="text-sm text-muted-foreground">
              The dashboard could not be loaded.
            </p>
            <Button variant="outline" onClick={() => void load()}>Retry</Button>
          </div>
        </div>
      );
    }
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
