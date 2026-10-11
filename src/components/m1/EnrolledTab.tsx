import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CalendarDays, DoorClosed, Megaphone, UserPlus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { rlsErrorMessage } from '@/lib/rls-error';
import {
  fmtDate,
  fmtTime,
  personName,
  venueLabel,
  fetchClassSessions,
  fetchEnrollments,
  fetchAttendance,
  fetchPresentCounts,
  progressFor,
  dayStatusColor,
  type M1Class,
  type M1Session,
  type M1Enrollment,
  type M1Attendance,
} from '@/components/m1/m1';
import { useShellMember } from '@/components/layout/shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle, ItemMedia } from '@/components/ui/item';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import PersonSheet from '@/components/m1/PersonSheet';
import RemindersSheet from '@/components/m1/RemindersSheet';

interface EnrolledTabProps {
  klass: M1Class;
  isAdmin: boolean;
  isLeader: boolean;
  onChanged: () => void;
}

export default function EnrolledTab({
  klass,
  isAdmin,
  isLeader,
  onChanged,
}: EnrolledTabProps) {
  const member = useShellMember();
  const supabase = createClient();
  const classId = klass.id;
  const requiredDays = klass.required_days;
  const venue = klass.venue;

  const [sessions, setSessions] = useState<M1Session[]>([]);
  const [roster, setRoster] = useState<M1Enrollment[]>([]);
  const [attendance, setAttendance] = useState<M1Attendance[]>([]);
  const [presentCounts, setPresentCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [summaryDraft, setSummaryDraft] = useState('');
  const [confirmCloseId, setConfirmCloseId] = useState<string | null>(null);
  const [remindersFor, setRemindersFor] = useState<M1Session | null>(null);
  const [personSheet, setPersonSheet] = useState<M1Enrollment['people'] | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetchClassSessions(supabase, classId),
      fetchEnrollments(supabase, classId),
      fetchAttendance(supabase, classId),
      fetchPresentCounts(supabase, classId),
    ])
      .then(([s, e, a, counts]) => {
        setSessions(s);
        setRoster(e.filter((row) => row.status === 'Enrolled'));
        setAttendance(Object.values(a).flat());
        setPresentCounts(counts);
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

  async function togglePresent(person: M1Enrollment['people'], session: M1Session) {
    const existing = attendanceBySession[session.id]?.[person.id];
    const nextStatus = existing?.status === 'Present' ? 'Absent' : 'Present';
    const markedBy = member?.id ?? '';

    const op = existing
      ? supabase
          .from('m1_attendance')
          .update({ status: nextStatus })
          .eq('id', existing.id)
      : supabase.from('m1_attendance').insert({
          session_id: session.id,
          person_id: person.id,
          status: nextStatus,
          marked_by: markedBy,
        });

    const { error } = await op;
    if (error) {
      toast.error(rlsErrorMessage(error));
      return;
    }
    const counts = await fetchPresentCounts(supabase, classId);
    setPresentCounts(counts);
    reload();
  }

  async function closeDay(session: M1Session) {
    const { error } = await supabase.rpc('close_m1_session', { session_id: session.id });
    if (error) {
      toast.error(rlsErrorMessage(error));
      return;
    }
    toast.success(`Day ${session.day_number} closed`);
    setConfirmCloseId(null);
    reload();
    onChanged();
  }

  async function reopenDay(session: M1Session) {
    const { error } = await supabase
      .from('m1_sessions')
      .update({ closed: false })
      .eq('id', session.id);
    if (error) {
      toast.error(rlsErrorMessage(error));
      return;
    }
    toast.success(`Day ${session.day_number} reopened`);
    reload();
  }

  async function saveSummary() {
    if (!activeSession) return;
    const { error } = await supabase
      .from('m1_sessions')
      .update({ summary: summaryDraft })
      .eq('id', activeSession.id);
    if (error) {
      toast.error(rlsErrorMessage(error));
      return;
    }
    toast.success('Summary saved');
    reload();
  }

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CalendarDays />
          </EmptyMedia>
          <EmptyTitle>No class days yet</EmptyTitle>
        </EmptyHeader>
        <EmptyContent>
          <EmptyDescription>Admins can create class days from the New class dialog.</EmptyDescription>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {sessions.map((s) => {
          const rows = attendanceBySession[s.id] ?? {};
          const presents = Object.values(rows).filter((r) => r.status === 'Present').length;
          const total = roster.length;
          const isActive = s.id === activeSession?.id;
          return (
            <div
              key={s.id}
              className={`flex flex-col gap-2 rounded-xl border bg-card p-3 transition-colors ${
                isActive ? 'border-ring' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Day {s.day_number}</span>
                <Badge variant={s.closed ? 'outline' : 'default'}>
                  {s.closed ? 'Closed' : 'Open'}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {fmtDate(s.session_date)} · {fmtTime(s.start_time)} · {venueLabel(venue)}
              </p>
              <p className="text-xs">
                <span className="font-medium">{presents}</span>
                <span className="text-muted-foreground">/{total} present</span>
              </p>
              <div className="flex gap-1.5">
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="outline"
                        size="icon"
                        className="flex-1"
                        onClick={() => setActiveSessionId(s.id)}
                      >
                        <UserPlus className="size-4" />
                      </Button>
                    }
                  />
                  <TooltipContent>Take attendance</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="outline"
                        size="icon"
                        className="flex-1"
                        onClick={() => setRemindersFor(s)}
                      >
                        <Megaphone className="size-4" />
                      </Button>
                    }
                  />
                  <TooltipContent>Send reminders</TooltipContent>
                </Tooltip>
                {isLeader &&
                  (s.closed ? (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button variant="ghost" size="icon" className="flex-1" onClick={() => reopenDay(s)}>
                            <DoorClosed className="size-4" />
                          </Button>
                        }
                      />
                      <TooltipContent>Reopen day</TooltipContent>
                    </Tooltip>
                  ) : confirmCloseId === s.id ? (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => closeDay(s)}
                      className="flex-1 text-xs"
                    >
                      Confirm
                    </Button>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon"
                            className="flex-1"
                            onClick={() => setConfirmCloseId(s.id)}
                          >
                            <DoorClosed className="size-4" />
                          </Button>
                        }
                      />
                      <TooltipContent>Close day (marks rest absent)</TooltipContent>
                    </Tooltip>
                  ))}
              </div>
            </div>
          );
        })}
      </div>

      {activeSession && (
        <div className="rounded-xl border bg-card p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">Day {activeSession.day_number} attendance</p>
              <p className="text-xs text-muted-foreground">
                {fmtDate(activeSession.session_date)} · {fmtTime(activeSession.start_time)} ·{' '}
                {activeSession.topic || 'Class'}
              </p>
            </div>
            {isLeader && !confirmCloseId && !activeSession.closed && (
              <Button size="sm" variant="outline" onClick={() => setConfirmCloseId(activeSession.id)}>
                Close day
              </Button>
            )}
          </div>

          {isLeader && (
            <div className="mb-3 space-y-1.5">
              <Textarea
                rows={2}
                placeholder="Write a summary for this day…"
                value={summaryDraft}
                onChange={(e) => setSummaryDraft(e.target.value)}
              />
              <Button size="sm" variant="outline" onClick={saveSummary}>
                Save summary
              </Button>
            </div>
          )}

          <div className="flex flex-col gap-1">
            {roster.map((entry) => {
              const row = attendanceBySession[activeSession.id]?.[entry.person_id];
              const present = row?.status === 'Present';
              const progress = progressFor(presentCounts, requiredDays, entry.person_id);
              return (
                <Item key={entry.id} variant={row?.status === 'Excused' ? 'muted' : 'default'}>
                  <ItemMedia variant="image">
                    <Avatar size="sm">
                      <AvatarFallback>
                        {personName(entry.people).split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </ItemMedia>
                  <ItemContent className="min-w-0">
                    <ItemTitle className="truncate">
                      {personName(entry.people)}
                      {row?.status === 'Excused' && (
                        <span className="ml-1.5 text-xs text-muted-foreground">(excused)</span>
                      )}
                    </ItemTitle>
                    <ItemDescription>
                      <span
                        className={`inline-block h-1.5 w-16 rounded-full ${dayStatusColor(
                          presentCounts[entry.person_id] ?? 0,
                          requiredDays
                        )} align-middle`}
                        style={{ width: `${Math.round(progress * 100)}%` }}
                      />
                      <span className="ml-1.5">{presentCounts[entry.person_id] ?? 0}/{requiredDays}</span>
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <Checkbox
                      checked={present}
                      onCheckedChange={() => togglePresent(entry.people, activeSession)}
                      aria-label={`Mark ${personName(entry.people)} present`}
                    />
                  </ItemActions>
                </Item>
              );
            })}
          </div>
        </div>
      )}

      {remindersFor && (
        <RemindersSheet
          open={!!remindersFor}
          onOpenChange={(o) => setRemindersFor(o ? remindersFor : null)}
          klass={{
            id: klass.id,
            title: klass.title,
            venue: klass.venue,
            required_days: klass.required_days,
            status: klass.status,
            created_by: klass.created_by,
            created_at: klass.created_at,
          }}
          session={remindersFor}
        />
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
    </div>
  );
}