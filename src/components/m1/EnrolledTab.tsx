import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Check, Search, Users, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { rlsErrorMessage } from '@/lib/rls-error';
import { cn } from '@/lib/utils';
import {
  fmtDate,
  personName,
  fetchClassSessions,
  fetchEnrollments,
  fetchAttendance,
  progressFor,
  dayStatusColor,
  type M1Class,
  type M1Session,
  type M1Enrollment,
  type M1Attendance,
  type M1Person,
} from '@/components/m1/m1';
import { useShellMember } from '@/components/layout/shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import PersonSheet from '@/components/m1/PersonSheet';

interface EnrolledTabProps {
  klass: M1Class;
  isAdmin: boolean;
  isLeader: boolean;
  onChanged: () => void;
}

type Filter = 'all' | 'missed' | 'complete';
type TickMode = 'editable' | 'locked' | 'na';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'missed', label: 'Missed a day' },
  { value: 'complete', label: 'Complete' },
];

export default function EnrolledTab({ klass, isAdmin, isLeader, onChanged }: EnrolledTabProps) {
  const member = useShellMember();
  const supabase = createClient();
  const classId = klass.id;
  const requiredDays = klass.required_days;

  const [sessions, setSessions] = useState<M1Session[]>([]);
  const [roster, setRoster] = useState<M1Enrollment[]>([]);
  const [attendance, setAttendance] = useState<M1Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [closeTarget, setCloseTarget] = useState<M1Session | null>(null);
  const [unlockTarget, setUnlockTarget] = useState<{ person: M1Person; session: M1Session; next: string } | null>(null);
  const [personSheet, setPersonSheet] = useState<M1Person | null>(null);

  const attendanceRef = useRef<M1Attendance[]>([]);
  useEffect(() => {
    attendanceRef.current = attendance;
  }, [attendance]);

  const reload = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetchClassSessions(supabase, classId),
      fetchEnrollments(supabase, classId),
      fetchAttendance(supabase, classId),
    ])
      .then(([s, e, a]) => {
        setSessions(s);
        setRoster(e.filter((row) => row.status === 'Enrolled'));
        setAttendance(Object.values(a).flat());
        setActiveSessionId((prev) => {
          if (prev && s.some((row) => row.id === prev)) return prev;
          const firstOpen = s.find((row) => !row.closed);
          return firstOpen?.id ?? s[0]?.id ?? null;
        });
      })
      .catch((err) => toast.error(rlsErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [supabase, classId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) ?? null,
    [sessions, activeSessionId]
  );

  const attendanceBySession = useMemo(() => {
    const map: Record<string, Record<string, M1Attendance>> = {};
    for (const row of attendance) {
      map[row.session_id] ??= {};
      map[row.session_id][row.person_id] = row;
    }
    return map;
  }, [attendance]);

  const missedDayMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const session of sessions) {
      if (!session.closed) continue;
      const rows = attendanceBySession[session.id];
      if (!rows) continue;
      for (const row of Object.values(rows)) {
        if (row.status === 'Absent' && !(row.person_id in map)) map[row.person_id] = session.day_number;
      }
    }
    return map;
  }, [sessions, attendanceBySession]);

  const presentCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const row of attendance) {
      if (row.status === 'Present') counts[row.person_id] = (counts[row.person_id] ?? 0) + 1;
    }
    return counts;
  }, [attendance]);

  function rowFor(sessionId: string, personId: string): M1Attendance | undefined {
    return attendanceRef.current.find((r) => r.session_id === sessionId && r.person_id === personId);
  }

  async function applyRow(person: M1Person, session: M1Session, nextStatus: string, withUndo = true) {
    const existing = rowFor(session.id, person.id);
    const prev = existing?.status ?? null;
    const tempId = existing?.id ?? `tmp-${session.id}-${person.id}`;
    setAttendance((rows) =>
      existing
        ? rows.map((r) => (r.id === existing.id ? { ...r, status: nextStatus } : r))
        : [...rows, { id: tempId, session_id: session.id, person_id: person.id, status: nextStatus }]
    );

    if (existing) {
      const { error } = await supabase.from('m1_attendance').update({ status: nextStatus }).eq('id', existing.id);
      if (error) {
        setAttendance((rows) => rows.map((r) => (r.id === existing.id ? { ...r, status: prev ?? 'Absent' } : r)));
        toast.error(rlsErrorMessage(error));
        return;
      }
    } else {
      const { data, error } = await supabase
        .from('m1_attendance')
        .insert({ session_id: session.id, person_id: person.id, status: nextStatus, marked_by: member?.id ?? '' })
        .select('id')
        .single();
      if (error) {
        setAttendance((rows) => rows.filter((r) => r.id !== tempId));
        toast.error(rlsErrorMessage(error));
        return;
      }
      const newId = (data as { id: string } | null)?.id;
      if (newId) setAttendance((rows) => rows.map((r) => (r.id === tempId ? { ...r, id: newId } : r)));
    }

    if (!withUndo) return;
    toast(nextStatus === 'Present' ? 'Marked present' : 'Marked absent', {
      action: {
        label: 'Undo',
        onClick: () => {
          if (prev === null) void removeRow(person, session);
          else void applyRow(person, session, prev, false);
        },
      },
    });
  }

  async function removeRow(person: M1Person, session: M1Session) {
    const existing = rowFor(session.id, person.id);
    if (!existing) return;
    setAttendance((rows) => rows.filter((r) => r.id !== existing.id));
    const { error } = await supabase.from('m1_attendance').delete().eq('id', existing.id);
    if (error) {
      toast.error(rlsErrorMessage(error));
      reload();
    }
  }

  async function closeDay(session: M1Session) {
    const { error } = await supabase.rpc('close_m1_session', { session_id: session.id });
    if (error) {
      toast.error(rlsErrorMessage(error));
      return;
    }
    toast.success(`Day ${session.day_number} closed`);
    setCloseTarget(null);
    reload();
    onChanged();
  }

  async function saveSummary(text: string) {
    if (!activeSession) return;
    const { error } = await supabase
      .from('m1_sessions')
      .update({ summary: text })
      .eq('id', activeSession.id);
    if (error) {
      toast.error(rlsErrorMessage(error));
      return;
    }
    toast.success('Summary saved');
    reload();
  }

  const filteredRoster = useMemo(() => {
    const query = search.trim().toLowerCase();
    return roster.filter((entry) => {
      if (query) {
        const haystack = `${personName(entry.people)} ${entry.people.phone ?? ''}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (filter === 'missed' && missedDayMap[entry.person_id] === undefined) return false;
      if (filter === 'complete' && (presentCounts[entry.person_id] ?? 0) < requiredDays) return false;
      return true;
    });
  }, [roster, search, filter, missedDayMap, presentCounts, requiredDays]);

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or phone"
            className="pl-8"
          />
        </div>
        <div className="inline-flex overflow-hidden rounded-md border">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setFilter(option.value)}
              className={cn(
                'border-l px-3 py-1.5 text-sm first:border-l-0',
                filter === option.value ? 'bg-accent font-medium' : 'text-muted-foreground'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {roster.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Users />
            </EmptyMedia>
            <EmptyTitle>Nobody is enrolled yet</EmptyTitle>
          </EmptyHeader>
          <EmptyContent>
            <EmptyDescription>
              Press Add to enrol people from the waiting list or register a walk-in.
            </EmptyDescription>
          </EmptyContent>
        </Empty>
      ) : sessions.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Users />
            </EmptyMedia>
            <EmptyTitle>No class days yet</EmptyTitle>
          </EmptyHeader>
          <EmptyContent>
            <EmptyDescription>Admins can add class days from the New class dialog.</EmptyDescription>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <table className="w-full min-w-0 text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="px-3 py-2 text-left font-medium">Name</th>
                <th className="px-3 py-2 text-left font-medium">Phone</th>
                <th className="px-3 py-2 text-left font-medium">Address</th>
                {sessions.map((session) => {
                  const isActive = session.id === activeSession?.id && !session.closed;
                  return (
                    <th
                      key={session.id}
                      className={cn('px-2 py-2 text-center font-medium', isActive && 'bg-accent')}
                    >
                      <div className="flex flex-col items-center gap-0.5">
                        <span>Day {session.day_number}</span>
                        <small className="text-[11px] font-normal text-muted-foreground">
                          {session.closed
                            ? `${fmtDate(session.session_date)} · closed`
                            : isActive
                              ? 'Today'
                              : fmtDate(session.session_date)}
                        </small>
                        {isActive && isLeader && (
                          <Button
                            size="xs"
                            variant="outline"
                            className="mt-1"
                            onClick={() => setCloseTarget(session)}
                          >
                            Close Day {session.day_number}
                          </Button>
                        )}
                      </div>
                    </th>
                  );
                })}
                <th className="px-3 py-2 text-left font-medium">Progress</th>
              </tr>
            </thead>
            <tbody>
              {filteredRoster.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-center text-sm text-muted-foreground" colSpan={sessions.length + 4}>
                    No people match this filter.
                  </td>
                </tr>
              ) : (
                filteredRoster.map((entry) => {
                  const missed = missedDayMap[entry.person_id];
                  const count = presentCounts[entry.person_id] ?? 0;
                  const progress = progressFor(presentCounts, requiredDays, entry.person_id);
                  return (
                    <tr key={entry.id} className="border-b last:border-0">
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => setPersonSheet(entry.people)}
                          className="text-left font-medium hover:underline"
                        >
                          {personName(entry.people)}
                        </button>
                        {missed !== undefined && (
                          <Badge
                            variant="outline"
                            className="ml-1.5 border-red-500/40 bg-red-500/10 text-red-600"
                          >
                            Missed Day {missed}
                          </Badge>
                        )}
                        {entry.walk_in && (
                          <Badge
                            variant="outline"
                            className="ml-1.5 border-blue-500/40 bg-blue-500/10 text-blue-600"
                          >
                            Walk-in today
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                        {entry.people.phone ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        <span className="block max-w-[16rem] truncate">
                          {[entry.people.location, entry.people.address_details]
                            .filter(Boolean)
                            .join(', ') || '—'}
                        </span>
                      </td>
                      {sessions.map((session) => {
                        const row = attendanceBySession[session.id]?.[entry.person_id];
                        const isActive = session.id === activeSession?.id && !session.closed;
                        const mode: TickMode = isActive ? 'editable' : session.closed ? 'locked' : 'na';
                        const next = row?.status === 'Present' ? 'Absent' : 'Present';
                        return (
                          <td
                            key={session.id}
                            className={cn('px-2 py-2 text-center', isActive && 'bg-accent')}
                          >
                            <Tick
                              status={row?.status ?? null}
                              mode={mode}
                              onToggle={
                                isActive
                                  ? () => void applyRow(entry.people, session, next)
                                  : session.closed && isAdmin
                                    ? () => setUnlockTarget({ person: entry.people, session, next })
                                    : undefined
                              }
                            />
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="tabular-nums">
                          {count}/{requiredDays}
                        </span>
                        <span className="ml-1.5 inline-block h-1.5 w-11 overflow-hidden rounded-full bg-accent align-middle">
                          <span
                            className={cn('block h-full', dayStatusColor(count, requiredDays))}
                            style={{ width: `${Math.round(progress * 100)}%` }}
                          />
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {isLeader && activeSession && (
        <details className="rounded-xl border bg-card">
          <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium select-none">
            Day {activeSession.day_number} summary
          </summary>
          <div className="space-y-2 border-t p-4">
            <SummaryEditor
              key={activeSession.id}
              initial={activeSession.summary ?? ''}
              onSave={saveSummary}
            />
          </div>
        </details>
      )}

      <PersonSheet
        open={!!personSheet}
        onOpenChange={(o) => setPersonSheet(o ? personSheet : null)}
        person={personSheet}
        classId={classId}
        requiredDays={requiredDays}
        isAdmin={isAdmin}
        onChanged={onChanged}
      />

      <AlertDialog open={!!closeTarget} onOpenChange={(open) => !open && setCloseTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close Day {closeTarget?.day_number}</AlertDialogTitle>
            <AlertDialogDescription>
              Everyone not ticked will be marked absent and appear under Missed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => closeTarget && closeDay(closeTarget)}>
              Close Day {closeTarget?.day_number}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!unlockTarget} onOpenChange={(open) => !open && setUnlockTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change a closed day?</AlertDialogTitle>
            <AlertDialogDescription>
              Day {unlockTarget?.session.day_number} is closed. Change the attendance for{' '}
              {unlockTarget ? personName(unlockTarget.person) : ''}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (unlockTarget) void applyRow(unlockTarget.person, unlockTarget.session, unlockTarget.next);
                setUnlockTarget(null);
              }}
            >
              Change
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SummaryEditor({ initial, onSave }: { initial: string; onSave: (text: string) => Promise<void> }) {
  const [text, setText] = useState(initial);
  const [saving, setSaving] = useState(false);
  return (
    <div className="space-y-2">
      <Textarea
        rows={3}
        placeholder="Write a summary for this day…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <Button
        size="sm"
        variant="outline"
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          try {
            await onSave(text);
          } finally {
            setSaving(false);
          }
        }}
      >
        Save summary
      </Button>
    </div>
  );
}

function Tick({
  status,
  mode,
  onToggle,
}: {
  status: string | null;
  mode: TickMode;
  onToggle?: () => void;
}) {
  const base = 'inline-grid size-[18px] place-items-center rounded-[5px] border-[1.5px] align-middle';
  let className = base;
  let content: ReactNode = null;

  if (status === 'Present') {
    className = cn(base, 'border-primary bg-primary text-primary-foreground');
    content = <Check className="size-3" strokeWidth={3} />;
  } else if (status === 'Absent' && mode !== 'na') {
    className = cn(base, 'border-red-500 text-red-500');
    content = <X className="size-3" strokeWidth={3} />;
  } else if (mode === 'na' || mode === 'locked') {
    className = cn(base, 'border-dashed opacity-35');
  }

  if (onToggle) {
    return (
      <button type="button" onClick={onToggle} className={cn(className, 'cursor-pointer')}>
        {content}
      </button>
    );
  }
  return <span className={className}>{content}</span>;
}
