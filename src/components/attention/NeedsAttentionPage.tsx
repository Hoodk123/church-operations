import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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

export default function NeedsAttentionPage() {
  const supabase = createClient();
  const member = useShellMember();
  const isAdmin = member?.role === 'Admin';

  const [people, setPeople] = useState<Person[] | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamOption[]>([]);
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
    async function loadTeam() {
      const { data, error } = await supabase
        .from('team_members')
        .select('id, full_name')
        .order('full_name', { ascending: true });
      if (active) return;
      if (!error && data) setTeamMembers(data);
    }
    load();
    loadTeam();
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
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function assignSelected(teamId: string) {
    if (selected.size === 0) return;
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
    toast.success(`Assigned ${selected.size} ${selected.size === 1 ? 'person' : 'people'}`);
    setSelected(new Set());
    void refresh();
  }

  function openDetail(person: Person) {
    setDetailPerson(person);
    setDetailOpen(true);
  }

  function handleUpdated(updated: Person) {
    setPeople((prev) =>
      prev ? prev.map((p) => (p.id === updated.id ? updated : p)) : prev
    );
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

  return (
    <div className="flex h-full flex-col gap-6">
      <ScreenHeader title="Needs Attention" sub="People who need a next step." />

      {people === null ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          <section className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Unassigned <span className="tabular-nums">({lists.unassigned.length})</span>
              </h2>
              {isAdmin && selected.size > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {selected.size} selected
                  </span>
                  <Select value="" onValueChange={(v) => v && void assignSelected(v)}>
                    <SelectTrigger
                      className="h-9"
                      disabled={assigning}
                      aria-label="Assign selected to"
                    >
                      <SelectValue placeholder={assigning ? 'Saving…' : 'Assign selected to…'} />
                    </SelectTrigger>
                    <SelectContent>
                      {teamMembers.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            {lists.unassigned.length === 0 ? (
              <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                Everyone is assigned to someone.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {lists.unassigned.map((p) => (
                  <div key={p.id} className="flex items-center gap-2">
                    {isAdmin && (
                      <Checkbox
                        checked={selected.has(p.id)}
                        onCheckedChange={() => toggleSelected(p.id)}
                        aria-label={`Select ${p.first_name} ${p.last_name}`}
                        className="shrink-0"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => openDetail(p)}
                      className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-xl border bg-card p-3 text-left transition-colors hover:bg-accent/50 active:bg-accent/70"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-sm font-medium">
                          {p.first_name} {p.last_name}
                        </span>
                        <Badge
                          variant="outline"
                          className={categoryColors[p.category] ?? ''}
                        >
                          {p.category}
                        </Badge>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {p.location ?? 'No location'} · {p.date_registered ? `since ${formatShort(p.date_registered)}` : ''}
                      </span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-2">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Not started for more than 3 days{' '}
              <span className="tabular-nums">({lists.notStarted.length})</span>
            </h2>
            {lists.notStarted.length === 0 ? (
              <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                New registrations are being followed up on time.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {lists.notStarted.map((p) => {
                  const days = p.date_registered ? daysSince(p.date_registered) : 0;
                  return (
                    <AttentionButton key={p.id} person={p} onOpen={openDetail}>
                      Registered {days} days ago
                    </AttentionButton>
                  );
                })}
              </div>
            )}
          </section>

          <section className="space-y-2">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Gone quiet <span className="tabular-nums">({lists.goneQuiet.length})</span>
            </h2>
            {lists.goneQuiet.length === 0 ? (
              <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                Nobody has gone quiet for 2 weeks.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {lists.goneQuiet.map((p) => {
                  const days = p.last_contact_date ? daysSince(p.last_contact_date) : 0;
                  return (
                    <AttentionButton key={p.id} person={p} onOpen={openDetail}>
                      {days} days since last contact · {p.assigned_to_name ?? 'Unassigned'}
                    </AttentionButton>
                  );
                })}
              </div>
            )}
          </section>
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

function formatShort(dateStr: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
    new Date(dateStr)
  );
}

function AttentionButton({
  person,
  onOpen,
  children,
}: {
  person: Person;
  onOpen: (person: Person) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(person)}
      className="flex min-w-0 items-center justify-between gap-3 rounded-xl border bg-card p-3 text-left transition-colors hover:bg-accent/50 active:bg-accent/70"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm font-medium">
          {person.first_name} {person.last_name}
        </span>
        <Badge variant="outline" className={categoryColors[person.category] ?? ''}>
          {person.category}
        </Badge>
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">{children}</span>
    </button>
  );
}