import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CalendarX2, Link2, Megaphone } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { rlsErrorMessage } from '@/lib/rls-error';
import {
  fmtDate,
  fmtTime,
  personName,
  fetchClassSessions,
  type M1Class,
  type M1Session,
  type M1Enrollment,
} from '@/components/m1/m1';
import { useShellMember } from '@/components/layout/shell';
import { fillTemplate } from '@/lib/templates';
import { fetchTemplate } from '@/components/classes/templates';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle, ItemMedia } from '@/components/ui/item';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { initials } from '@/lib/names';
import ComposeMessageSheet from '@/components/classes/ComposeMessageSheet';

interface MissedTabProps {
  klass: M1Class;
  isLeader: boolean;
  onChanged: () => void;
}

interface AbsentRow {
  person: M1Enrollment['people'];
  status: string;
  reason: string | null;
}

export function MissedTab({ klass, onChanged }: MissedTabProps) {
  const member = useShellMember();
  const supabase = createClient();

  const [sessions, setSessions] = useState<M1Session[]>([]);
  const [selected, setSelected] = useState<M1Session | null>(null);
  const [absent, setAbsent] = useState<AbsentRow[]>([]);
  const [template, setTemplate] = useState('');
  const [loading, setLoading] = useState(true);
  const [composeFor, setComposeFor] = useState<M1Enrollment['people'] | null>(null);
  const [linking, setLinking] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetchClassSessions(supabase, klass.id),
      fetchTemplate(supabase, 'm1_catch_up'),
    ])
      .then(([s, tpl]) => {
        setSessions(s);
        setTemplate(tpl?.body ?? '');
        setSelected((prev) => {
          if (prev && s.some((x) => x.id === prev.id)) return prev;
          const firstClosed = s.find((x) => x.closed);
          return firstClosed ?? s[0] ?? null;
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [supabase, klass.id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    Promise.all([
      supabase
        .from('m1_attendance')
        .select(
          'session_id, person_id, status, people(id, first_name, last_name, phone, email, location, address_details, gender, age_group, contact_preference, category, m1_status, baptism_status, needs_m1, needs_baptism, needs_pastor)'
        )
        .eq('session_id', selected.id)
        .in('status', ['Absent', 'Excused']),
      supabase.from('m1_absence_replies').select('person_id, reason, created_at').eq('session_id', selected.id),
    ]).then(([att, replies]) => {
      if (cancelled) return;
      const absentRows = (att.data ?? []) as {
        person_id: string;
        status: string;
        people: M1Enrollment['people'] | M1Enrollment['people'][];
      }[];
      const personOf = (row: { people: M1Enrollment['people'] | M1Enrollment['people'][]; person_id: string }) =>
        Array.isArray(row.people) ? (row.people[0] ?? null) : row.people;
      const reasonMap = new Map<string, string>();
      for (const r of (replies.data ?? []) as { person_id: string; reason: string }[]) {
        if (!reasonMap.has(r.person_id)) reasonMap.set(r.person_id, r.reason);
      }
      setAbsent(
        absentRows
          .map((r) => ({ person: personOf(r), status: r.status, reason: reasonMap.get(r.person_id) ?? null }))
          .filter((r): r is AbsentRow => !!r.person)
      );
    });
    return () => {
      cancelled = true;
    };
  }, [supabase, selected]);

  const lastSession = useMemo(() => sessions.find((s) => s.closed) ?? sessions[0] ?? null, [sessions]);

  if (loading) return <div className="flex justify-center py-10"><Spinner /></div>;

  if (sessions.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><CalendarX2 /></EmptyMedia>
          <EmptyTitle>No days recorded</EmptyTitle>
        </EmptyHeader>
        <EmptyContent>
          <EmptyDescription>There are no class days to review yet.</EmptyDescription>
        </EmptyContent>
      </Empty>
    );
  }

  async function copyReasonLink(person: M1Enrollment['people'], session: M1Session) {
    setLinking(person.id);
    const token = window.crypto.randomUUID();
    const { data, error } = await supabase
      .from('m1_reply_links')
      .insert({
        token,
        session_id: session.id,
        person_id: person.id,
        created_by: member?.id ?? null,
        expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      })
      .select('token')
      .single();
    setLinking(null);
    if (error) {
      if (error.code === '23505') {
        toast.info(`${personName(person)} already has a reason link for this day.`);
        return;
      }
      toast.error(rlsErrorMessage(error));
      return;
    }
    const url = `${window.location.origin}/reply/${data.token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(`Reason link copied for ${personName(person)}`);
    } catch {
      toast.success(`Reason link: ${url}`);
    }
  }

  const active = selected ?? lastSession;
  const absenteesThisDay = active ? absent : [];

  function baseValues(person: M1Enrollment['people']) {
    return {
      name: template.includes('{name}') ? person.first_name : personName(person),
      class: klass.title,
      day: active ? String(active.day_number) : '',
      date: active ? fmtDate(active.session_date) : '',
      time: active ? fmtTime(active.start_time) : '',
      venue: klass.venue || 'ROC Church',
      volunteer: member?.full_name ?? '',
    };
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {sessions.map((s) => (
          <Button
            key={s.id}
            size="sm"
            variant={active?.id === s.id ? 'default' : 'outline'}
            className="h-8 rounded-full"
            onClick={() => setSelected(s)}
          >
            Day {s.day_number}
          </Button>
        ))}
      </div>

      {absenteesThisDay.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><CalendarX2 /></EmptyMedia>
            <EmptyTitle>No absences for day {active?.day_number}</EmptyTitle>
          </EmptyHeader>
          <EmptyContent>
            <EmptyDescription>Everyone who missed appears here once the day is closed.</EmptyDescription>
          </EmptyContent>
        </Empty>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Day {active?.day_number} · {fmtDate(active?.session_date ?? '')}
            {' · '}
            {absenteesThisDay.length} absent
          </p>
          <div className="flex flex-col gap-1.5">
            {absenteesThisDay.map((row) => (
              <Item key={row.person.id} variant="outline">
                <ItemMedia variant="image">
                  <Avatar size="sm">
                    <AvatarFallback>{initials(row.person.first_name, row.person.last_name)}</AvatarFallback>
                  </Avatar>
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{personName(row.person)}</ItemTitle>
                  <ItemDescription className="flex items-center gap-1.5">
                    {row.reason ? (
                      <Badge variant="outline">{row.reason}</Badge>
                    ) : (
                      <span className="text-muted-foreground">No reason yet</span>
                    )}
                    {row.status === 'Excused' && <span className="text-muted-foreground">· Excused</span>}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          size="icon"
                          variant="outline"
                          disabled={linking === row.person.id || !active}
                          onClick={() => active && copyReasonLink(row.person, active)}
                        >
                          {linking === row.person.id ? <Spinner className="size-3.5" /> : <Link2 className="size-4" />}
                        </Button>
                      }
                    />
                    <TooltipContent>Copy a link so they can reply with the reason</TooltipContent>
                  </Tooltip>
                  <Button size="sm" variant="outline" disabled={!active} onClick={() => setComposeFor(row.person)}>
                    <Megaphone className="size-3.5" />
                    Send catch-up
                  </Button>
                </ItemActions>
              </Item>
            ))}
          </div>
        </>
      )}

      {composeFor && active && (
        <ComposeMessageSheet
          open={!!composeFor}
          onOpenChange={(o) => setComposeFor(o ? composeFor : null)}
          person={composeFor}
          heading="Follow-up"
          body={template ? fillTemplate(template, baseValues(composeFor)) : ''}
          purpose="catch_up"
          classId={klass.id}
          sessionId={active.id}
          onLogged={() => {
            void onChanged;
          }}
        />
      )}
    </div>
  );
}