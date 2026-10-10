import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ChevronDown, Undo2 } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { rlsErrorMessage } from '@/lib/rls-error';
import { todayISO } from '@/lib/dates';
import { initials } from '@/lib/names';
import { cn } from '@/lib/utils';
import { useShellMember } from '@/components/layout/shell';
import ScreenHeader from '@/components/layout/ScreenHeader';
import LogContactSheet from './LogContactSheet';
import MessagePanel from './MessagePanel';
import {
  FollowUpCard,
  FollowUpRow,
} from './FollowUpCard';
import { fullName, type FollowUpPerson } from './utils';
import VolunteersTab from './VolunteersTab';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/empty';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface DonePerson {
  id: string;
  first_name: string;
  last_name: string;
  category: string | null;
  phone: string | null;
}

interface DoneLog {
  id: string;
  contacted_at: string;
  finished: boolean;
  person: DonePerson | DonePerson[] | null;
}

interface DoneEntry {
  logId: string;
  contactedAt: string;
  count: number;
  person: DonePerson;
}

const PERSON_FIELDS =
  'id, first_name, last_name, phone, category, location, needs_pastor, last_contact_date, follow_up_status, assigned_at, assigner:team_members!people_assigned_by_fkey(full_name)';

function fetchMyPeople(supabase: SupabaseClient, memberId: string) {
  return supabase
    .from('people')
    .select(PERSON_FIELDS)
    .eq('assigned_to', memberId)
    .neq('follow_up_status', 'Completed');
}

function fetchTodayLogs(supabase: SupabaseClient, memberId: string) {
  return supabase
    .from('contact_log')
    .select(
      'id, contacted_at, finished, person:people!contact_log_person_id_fkey(id, first_name, last_name, category, phone)'
    )
    .eq('contacted_by', memberId)
    .gte('contacted_at', todayISO())
    .order('contacted_at', { ascending: false });
}

function rowPerson(log: DoneLog): DonePerson | null {
  return Array.isArray(log.person) ? (log.person[0] ?? null) : log.person;
}

function isNeedsNow(p: FollowUpPerson): boolean {
  return p.needs_pastor || !p.last_contact_date;
}

export default function MyFollowupsPage() {
  const member = useShellMember();
  const supabase = createClient();

  const [people, setPeople] = useState<FollowUpPerson[]>([]);
  const [doneToday, setDoneToday] = useState<DoneEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [logFor, setLogFor] = useState<FollowUpPerson | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [doneOpen, setDoneOpen] = useState(false);
  const [tab, setTab] = useState<'mine' | 'volunteers'>('mine');

  const memberId = member?.id ?? '';

  const applyData = useCallback(
    (rows: FollowUpPerson[], logs: DoneLog[]) => {
      setPeople(rows);

      const groups = new Map<string, DoneEntry>();
      for (const log of logs) {
        const person = rowPerson(log);
        if (!person) continue;
        const existing = groups.get(person.id);
        if (existing) {
          existing.count += 1;
        } else {
          groups.set(person.id, {
            logId: log.id,
            contactedAt: log.contacted_at,
            count: 1,
            person,
          });
        }
      }
      setDoneToday([...groups.values()]);
    },
    []
  );

  const load = useCallback(async () => {
    if (!memberId) return;
    const [peopleRes, logsRes] = await Promise.all([
      fetchMyPeople(supabase, memberId),
      fetchTodayLogs(supabase, memberId),
    ]);
    if (peopleRes.error) toast.error(rlsErrorMessage(peopleRes.error));
    if (logsRes.error) toast.error(rlsErrorMessage(logsRes.error));
    applyData(
      (peopleRes.data ?? []) as unknown as FollowUpPerson[],
      (logsRes.data ?? []) as unknown as DoneLog[]
    );
    setLoading(false);
  }, [supabase, memberId, applyData]);

  useEffect(() => {
    async function run() {
      await load();
    }
    void run();
  }, [load]);

  const needsNow = useMemo(
    () =>
      people
        .filter(isNeedsNow)
        .sort((a, b) => {
          if (a.needs_pastor !== b.needs_pastor) return a.needs_pastor ? -1 : 1;
          return 0;
        }),
    [people]
  );

  const thisWeek = useMemo(
    () =>
      people
        .filter((p) => !isNeedsNow(p))
        .sort((a, b) =>
          (a.last_contact_date ?? '').localeCompare(b.last_contact_date ?? '')
        ),
    [people]
  );

  const ordered = useMemo(() => [...needsNow, ...thisWeek], [needsNow, thisWeek]);

  const focusPerson = useMemo(
    () => ordered.find((p) => p.id === focusId) ?? ordered[0] ?? null,
    [ordered, focusId]
  );

  const doneCount = doneToday.reduce((sum, e) => sum + e.count, 0);
  const totalForProgress = doneCount + ordered.length;
  const pct = totalForProgress === 0 ? 0 : Math.round((doneCount / totalForProgress) * 100);

  const admin = member?.role === 'Admin';

  async function undoLastLog(entry: DoneEntry) {
    const { error } = await supabase
      .from('contact_log')
      .delete()
      .eq('id', entry.logId);
    if (error) {
      toast.error(rlsErrorMessage(error));
      return;
    }
    toast.success(
      `Undid last log for ${entry.person.first_name} ${entry.person.last_name}`
    );
    await load();
  }

  if (!member) return null;

  const isEmpty = ordered.length === 0 && doneToday.length === 0;

  const mineBody = (
    <>
      {!loading && (
        <div className="flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">
            {doneCount} of {totalForProgress} done today
          </span>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : isEmpty ? (
        <Empty className="rounded-xl border py-10">
          <EmptyTitle>Nobody is waiting on you.</EmptyTitle>
          <EmptyDescription>Thank you for serving.</EmptyDescription>
        </Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_300px] md:items-start">
          <div className="md:col-start-2 md:row-start-1">
            <MessagePanel
              person={focusPerson}
              seedCategory={ordered[0]?.category ?? null}
              volunteerName={member.full_name}
              memberId={member.id}
              isAdmin={admin}
            />
          </div>

          <div className="flex flex-col gap-4 md:col-start-1 md:row-start-1">
            {needsNow.length > 0 && (
              <section className="flex flex-col gap-2.5">
                <h2 className="text-sm font-semibold">
                  Needs you now{' '}
                  <span className="font-normal text-muted-foreground">
                    ({needsNow.length})
                  </span>
                </h2>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {needsNow.map((p) => (
                    <FollowUpCard
                      key={p.id}
                      person={p}
                      onLog={setLogFor}
                      onFocus={(fp) => setFocusId(fp.id)}
                    />
                  ))}
                </div>
              </section>
            )}

            {thisWeek.length > 0 && (
              <section className="flex flex-col gap-2.5">
                <h2 className="text-sm font-semibold">
                  This week{' '}
                  <span className="font-normal text-muted-foreground">
                    ({thisWeek.length})
                  </span>
                </h2>
                <div className="flex flex-col gap-2">
                  {thisWeek.map((p) => (
                    <FollowUpRow
                      key={p.id}
                      person={p}
                      onLog={setLogFor}
                      onFocus={(fp) => setFocusId(fp.id)}
                    />
                  ))}
                </div>
              </section>
            )}

            {doneToday.length > 0 && (
              <section className="flex flex-col gap-2">
                <button
                  type="button"
                  className="flex w-full cursor-pointer items-center justify-between rounded-lg border bg-muted/40 px-3 py-2.5 text-left"
                  onClick={() => setDoneOpen((v) => !v)}
                >
                  <span className="text-sm font-semibold">
                    Done today{' '}
                    <span className="font-normal text-muted-foreground">
                      ({doneToday.length})
                    </span>
                  </span>
                  <ChevronDown
                    className={cn(
                      'size-4 text-muted-foreground transition-transform',
                      doneOpen && 'rotate-180'
                    )}
                  />
                </button>

                {doneOpen && (
                  <TooltipProvider>
                    <ul className="flex flex-col gap-2">
                      {doneToday.map((entry) => (
                        <li
                          key={entry.logId}
                          className="flex items-center gap-2.5 rounded-lg border bg-card p-2.5"
                        >
                          <Avatar className="size-8">
                            <AvatarFallback className="text-xs">
                              {initials(entry.person.first_name, entry.person.last_name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {entry.person.first_name} {entry.person.last_name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Logged today
                              {entry.count > 1 ? ` · ${entry.count} times` : ''}
                            </p>
                          </div>
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label="Undo last log"
                                  className="text-muted-foreground hover:text-destructive"
                                  onClick={() => void undoLastLog(entry)}
                                >
                                  <Undo2 className="size-4" />
                                </Button>
                              }
                            />
                            <TooltipContent>Undo last log</TooltipContent>
                          </Tooltip>
                        </li>
                      ))}
                    </ul>
                  </TooltipProvider>
                )}
              </section>
            )}
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="flex flex-col gap-4">
      <ScreenHeader
        title={admin && tab === 'volunteers' ? 'Follow-ups' : 'My Follow-ups'}
        sub={
          admin && tab === 'volunteers'
            ? undefined
            : `${ordered.length} ${ordered.length === 1 ? 'person' : 'people'} waiting`
        }
      />

      {admin ? (
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as 'mine' | 'volunteers')}
          className="gap-4"
        >
          <TabsList>
            <TabsTrigger value="mine">My list</TabsTrigger>
            <TabsTrigger value="volunteers">Volunteers</TabsTrigger>
          </TabsList>
          <TabsContent value="mine" className="flex flex-col gap-4">
            {mineBody}
          </TabsContent>
          <TabsContent value="volunteers">
            <VolunteersTab />
          </TabsContent>
        </Tabs>
      ) : (
        <div className="flex flex-col gap-4">{mineBody}</div>
      )}

      {logFor && (
        <LogContactSheet
          open
          onOpenChange={(open) => {
            if (!open) setLogFor(null);
          }}
          personId={logFor.id}
          personName={fullName(logFor)}
          memberId={member.id}
          onSaved={load}
        />
      )}
    </div>
  );
}
