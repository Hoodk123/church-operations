import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Skeleton } from '@/components/ui/skeleton';
import { Empty, EmptyTitle } from '@/components/ui/empty';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import ScreenHeader from '@/components/layout/ScreenHeader';
import { useShellMember } from '@/components/layout/shell';
import { rlsErrorMessage } from '@/lib/rls-error';
import { daysSince } from '@/lib/dates';
import { categoryColors } from '../people/constants';
import type { Person } from '../people/columns';
import PersonDetailDrawer from '../people/PersonDetailDrawer';

interface TeamOption {
  id: string;
  full_name: string;
}

interface VolunteerOption extends TeamOption {
  assigned: number;
}

interface AttentionRow extends Omit<Person, 'assigned_to_name' | 'registered_by_name'> {
  assigned_to_name: { full_name: string } | null;
  registered_by_name: { full_name: string } | null;
}

function mapRow(row: AttentionRow): Person {
  return {
    ...row,
    assigned_to_name: row.assigned_to_name?.full_name ?? null,
    registered_by_name: row.registered_by_name?.full_name ?? null,
  };
}

function fetchAttentionPeople(supabase: SupabaseClient) {
  return supabase
    .from('people')
    .select(
      '*, assigned_to_name:team_members!people_assigned_to_fkey(full_name), registered_by_name:team_members!people_registered_by_fkey(full_name)'
    )
    .order('first_name', { ascending: true });
}

const GONE_QUIET_STATUSES = ['Contacted', 'Met', 'Ongoing'];

function formatShort(dateStr: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
    new Date(dateStr)
  );
}

export default function NeedsAttentionPage() {
  const supabase = createClient();
  const member = useShellMember();
  const isAdmin = member?.role === 'Admin';
  const bulkRef = useRef<HTMLDivElement | null>(null);

  const [people, setPeople] = useState<Person[] | null>(null);
  const [volunteers, setVolunteers] = useState<VolunteerOption[]>([]);
  const [target, setTarget] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assigning, setAssigning] = useState(false);
  const [detailPerson, setDetailPerson] = useState<Person | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    let active = false;

    async function load() {
      const { data, error } = await fetchAttentionPeople(supabase);
      if (active) return;
      if (error) {
        toast.error(rlsErrorMessage(error));
        setPeople([]);
        return;
      }
      setPeople((data ?? []).map((r) => mapRow(r as AttentionRow)));
    }

    async function loadVolunteers() {
      const { data, error } = await supabase.rpc('get_volunteer_overview');
      if (active) return;
      if (error || !data) {
        const fallback = await supabase
          .from('team_members')
          .select('id, full_name')
          .order('full_name', { ascending: true });
        if (active) return;
        if (!fallback.error && fallback.data) {
          setVolunteers(
            (fallback.data as TeamOption[]).map((t) => ({ ...t, assigned: 0 }))
          );
        }
        return;
      }
      const rows = (data as VolunteerOption[]).map((v) => ({
        id: v.id ?? (v as unknown as { team_member_id: string }).team_member_id,
        full_name: v.full_name,
        assigned: v.assigned ?? 0,
      }));
      setVolunteers(rows);
      const fewest = rows.reduce<VolunteerOption | null>(
        (best, v) => (best === null || v.assigned < best.assigned ? v : best),
        null
      );
      if (fewest) setTarget(fewest.id);
    }

    async function run() {
      await load();
      await loadVolunteers();
    }
    void run();
    return () => {
      active = true;
    };
  }, [supabase]);

  const refresh = async () => {
    const { data, error } = await fetchAttentionPeople(supabase);
    if (error) {
      toast.error(rlsErrorMessage(error));
      return;
    }
    setPeople((data ?? []).map((r) => mapRow(r as AttentionRow)));
  };

  const lists = useMemo(() => {
    const all = people ?? [];
    return {
      unassigned: all.filter((p) => !p.assigned_to),
      notStarted: all.filter(
        (p) =>
          p.follow_up_status === 'Not Started' &&
          (p.date_registered ? daysSince(p.date_registered) : 999) > 3
      ),
      goneQuiet: all.filter(
        (p) =>
          GONE_QUIET_STATUSES.includes(p.follow_up_status) &&
          (p.last_contact_date ? daysSince(p.last_contact_date) : -1) > 14
      ),
    };
  }, [people]);

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectOne(id: string) {
    setSelected(new Set([id]));
    bulkRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  async function assignSelected(teamId: string) {
    if (selected.size === 0 || !teamId) return;
    setAssigning(true);
    const { error } = await supabase
      .from('people')
      .update({ assigned_to: teamId })
      .in('id', [...selected]);
    setAssigning(false);
    if (error) {
      toast.error(rlsErrorMessage(error));
      return;
    }
    toast.success(
      `Assigned ${selected.size} ${selected.size === 1 ? 'person' : 'people'}`
    );
    setSelected(new Set());
    void refresh();
  }

  function openDetail(person: Person) {
    setDetailPerson(person);
    setDetailOpen(true);
  }

  function handleUpdated(updated: Person) {
    setPeople((prev) => (prev ? prev.map((p) => (p.id === updated.id ? updated : p)) : prev));
    setDetailPerson(updated);
  }

  function handleDeleted(id: string) {
    setPeople((prev) => (prev ? prev.filter((p) => p.id !== id) : prev));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setDetailOpen(false);
    setDetailPerson(null);
  }

  function renderRow(person: Person, reason: string) {
    return (
      <div key={person.id} className="flex items-center gap-2">
        {isAdmin && (
          <Checkbox
            checked={selected.has(person.id)}
            onCheckedChange={() => toggleSelected(person.id)}
            aria-label={`Select ${person.first_name} ${person.last_name}`}
            className="shrink-0"
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1 rounded-xl border bg-card p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={() => openDetail(person)}
                className="truncate text-sm font-medium hover:underline"
              >
                {person.first_name} {person.last_name}
              </button>
              <Badge variant="outline" className={categoryColors[person.category] ?? ''}>
                {person.category}
              </Badge>
            </div>
            {isAdmin && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => selectOne(person.id)}
              >
                {person.assigned_to ? 'Reassign…' : 'Assign…'}
              </Button>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">{reason}</p>
        </div>
      </div>
    );
  }

  const groups = [
    {
      key: 'unassigned',
      title: 'No volunteer yet',
      items: lists.unassigned,
      empty: 'Everyone is assigned to someone.',
      reason: (p: Person) =>
        `Unassigned${p.date_registered ? ` · registered ${formatShort(p.date_registered)}` : ''}`,
    },
    {
      key: 'notStarted',
      title: 'Not started for more than 3 days',
      items: lists.notStarted,
      empty: 'New registrations are being followed up on time.',
      reason: (p: Person) =>
        `${p.date_registered ? daysSince(p.date_registered) : 0} days, not started · ${
          p.assigned_to_name ?? 'Unassigned'
        }`,
    },
    {
      key: 'goneQuiet',
      title: 'Gone quiet, no contact in 14 days',
      items: lists.goneQuiet,
      empty: 'Nobody has gone quiet for 2 weeks.',
      reason: (p: Person) =>
        `${
          p.last_contact_date ? daysSince(p.last_contact_date) : 0
        } days since last contact · ${p.assigned_to_name ?? 'Unassigned'}`,
    },
  ];

  return (
    <div className="flex h-full flex-col gap-6">
      <ScreenHeader title="Needs Attention" sub="People who need a next step." />

      {isAdmin && selected.size > 0 && (
        <div
          ref={bulkRef}
          className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 shadow-sm"
        >
          <span className="text-sm font-medium tabular-nums">
            {selected.size} selected
          </span>
          <Select value={target} onValueChange={(v) => setTarget(v ?? '')}>
            <SelectTrigger
              className="h-9 min-w-44 flex-1"
              disabled={assigning}
              aria-label="Assign selected to"
            >
              <SelectValue placeholder="Assign to…" />
            </SelectTrigger>
            <SelectContent>
              {volunteers.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.full_name} ({v.assigned} {v.assigned === 1 ? 'person' : 'people'})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            disabled={assigning || !target}
            onClick={() => void assignSelected(target)}
          >
            {assigning && <Spinner />}
            Assign
          </Button>
          <Button type="button" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      )}

      {people === null ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <section key={group.key} className="space-y-2">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {group.title}{' '}
                <span className="tabular-nums">({group.items.length})</span>
              </h2>
              {group.items.length === 0 ? (
                <Empty className="py-6">
                  <EmptyTitle>{group.empty}</EmptyTitle>
                </Empty>
              ) : (
                <div className="flex flex-col gap-2">
                  {group.items.map((p) => renderRow(p, group.reason(p)))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      <PersonDetailDrawer
        person={detailPerson}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onUpdated={handleUpdated}
        onDeleted={handleDeleted}
      />
    </div>
  );
}
