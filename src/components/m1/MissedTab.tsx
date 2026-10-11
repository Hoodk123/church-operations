import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CalendarX2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { rlsErrorMessage } from '@/lib/rls-error';
import {
  fmtDate,
  fmtTime,
  personName,
  venueLabel,
  fetchClassSessions,
  type M1Class,
  type M1Session,
  type M1Person,
} from '@/components/m1/m1';
import { useShellMember } from '@/components/layout/shell';
import { fillTemplate, ABSENCE_REASONS } from '@/lib/templates';
import { fetchTemplate } from '@/components/classes/templates';
import { pickChannel, messageHref } from '@/lib/messaging';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { type SelectOption } from '@/lib/select-items';

const MATERIALS_BUCKET = 'm1-materials';
const REPLAY_PLACEHOLDER = '—';

interface MissedTabProps {
  klass: M1Class;
  isLeader: boolean;
  onChanged: () => void;
}

interface MissedRow {
  person: M1Person;
  status: string;
  reply: { reason: string; note: string | null; created_at: string } | null;
  sentAt: string | null;
}

interface ReplyInfo {
  person_id: string;
  reason: string;
  note: string | null;
  created_at: string;
  name: string;
}

function fmtClock(iso: string): string {
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function MissedTab({ klass, onChanged }: MissedTabProps) {
  const member = useShellMember();
  const supabase = createClient();
  const classId = klass.id;

  const [sessions, setSessions] = useState<M1Session[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rows, setRows] = useState<MissedRow[]>([]);
  const [template, setTemplate] = useState('');
  const [reasonCounts, setReasonCounts] = useState<Record<string, number>>({});
  const [replyTotal, setReplyTotal] = useState(0);
  const [latestReply, setLatestReply] = useState<ReplyInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const [sending, setSending] = useState<string | null>(null);
  const [viewing, setViewing] = useState<MissedRow | null>(null);
  const [recording, setRecording] = useState(false);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  const closed = useMemo(() => sessions.filter((s) => s.closed), [sessions]);

  useEffect(() => {
    let cancelled = false;
    fetchClassSessions(supabase, classId).then((s) => {
      if (cancelled) return;
      setSessions(s);
      const firstClosed = s.find((row) => row.closed);
      setSelectedId((prev) => (prev && s.some((row) => row.id === prev && row.closed) ? prev : firstClosed?.id ?? null));
    });
    return () => {
      cancelled = true;
    };
  }, [supabase, classId, nonce]);

  useEffect(() => {
    fetchTemplate(supabase, 'm1_catch_up').then((t) => setTemplate(t?.body ?? ''));
  }, [supabase]);

  useEffect(() => {
    if (!selectedId) {
      setRows([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      supabase
        .from('m1_attendance')
        .select(
          'person_id, status, people(id, first_name, last_name, phone, email, location, address_details, gender, age_group, contact_preference, category, m1_status, baptism_status, needs_m1, needs_baptism, needs_pastor)'
        )
        .eq('session_id', selectedId)
        .in('status', ['Absent', 'Excused']),
      supabase
        .from('m1_absence_replies')
        .select('person_id, reason, note, created_at')
        .eq('session_id', selectedId)
        .order('created_at', { ascending: false }),
      supabase
        .from('m1_message_log')
        .select('person_id, sent_at')
        .eq('class_id', classId)
        .eq('purpose', 'catch_up')
        .order('sent_at', { ascending: false }),
    ])
      .then(([att, replies, logs]) => {
        if (cancelled) return;
        const personOf = (value: unknown): M1Person | null => {
          if (Array.isArray(value)) return (value[0] as M1Person | undefined) ?? null;
          return (value as M1Person | null) ?? null;
        };
        const replyByPerson = new Map<string, { reason: string; note: string | null; created_at: string }>();
        for (const r of (replies.data ?? []) as ReplyInfo[]) {
          if (!replyByPerson.has(r.person_id)) {
            replyByPerson.set(r.person_id, { reason: r.reason, note: r.note, created_at: r.created_at });
          }
        }
        const sentByPerson = new Map<string, string>();
        for (const l of (logs.data ?? []) as { person_id: string; sent_at: string }[]) {
          if (!sentByPerson.has(l.person_id)) sentByPerson.set(l.person_id, l.sent_at);
        }
        const built: MissedRow[] = [];
        for (const row of (att.data ?? []) as { person_id: string; status: string; people: unknown }[]) {
          const person = personOf(row.people);
          if (!person) continue;
          built.push({
            person,
            status: row.status,
            reply: replyByPerson.get(row.person_id) ?? null,
            sentAt: sentByPerson.get(row.person_id) ?? null,
          });
        }
        built.sort((a, b) => personName(a.person).localeCompare(personName(b.person)));
        setRows(built);
      })
      .catch((err) => toast.error(rlsErrorMessage(err)))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, classId, selectedId, nonce]);

  useEffect(() => {
    const ids = sessions.map((s) => s.id);
    if (ids.length === 0) {
      setReasonCounts({});
      setReplyTotal(0);
      setLatestReply(null);
      return;
    }
    let cancelled = false;
    supabase
      .from('m1_absence_replies')
      .select('person_id, reason, note, created_at, people(first_name, last_name)')
      .in('session_id', ids)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (cancelled) return;
        const counts: Record<string, number> = {};
        const list: ReplyInfo[] = [];
        for (const r of (data ?? []) as {
          person_id: string;
          reason: string;
          note: string | null;
          created_at: string;
          people: unknown;
        }[]) {
          counts[r.reason] = (counts[r.reason] ?? 0) + 1;
          const person = Array.isArray(r.people) ? (r.people[0] as M1Person | undefined) : (r.people as M1Person | null);
          list.push({
            person_id: r.person_id,
            reason: r.reason,
            note: r.note,
            created_at: r.created_at,
            name: person ? personName(person) : '',
          });
        }
        setReasonCounts(counts);
        setReplyTotal(list.length);
        setLatestReply(list[0] ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, sessions, nonce]);

  const active = useMemo(() => closed.find((s) => s.id === selectedId) ?? null, [closed, selectedId]);

  async function getReplyToken(sessionId: string, personId: string): Promise<string | null> {
    const { data: existing } = await supabase
      .from('m1_reply_links')
      .select('token')
      .eq('session_id', sessionId)
      .eq('person_id', personId)
      .gt('expires_at', new Date().toISOString())
      .is('used_at', null)
      .maybeSingle();
    if (existing?.token) return existing.token;
    const token = window.crypto.randomUUID().replace(/-/g, '');
    const { data, error } = await supabase
      .from('m1_reply_links')
      .insert({
        token,
        session_id: sessionId,
        person_id: personId,
        created_by: member?.id ?? null,
        expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      })
      .select('token')
      .single();
    if (error) {
      if (error.code === '23505') {
        const { data: again } = await supabase
          .from('m1_reply_links')
          .select('token')
          .eq('session_id', sessionId)
          .eq('person_id', personId)
          .maybeSingle();
        return again?.token ?? null;
      }
      return null;
    }
    return data?.token ?? null;
  }

  async function sendCatchUp(row: MissedRow) {
    if (!active) return;
    setSending(row.person.id);
    try {
      const token = await getReplyToken(active.id, row.person.id);
      let materialsLink = '';
      const { data: material } = await supabase
        .from('m1_materials')
        .select('storage_path')
        .eq('class_id', classId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (material?.storage_path) {
        const { data: signed } = await supabase.storage
          .from(MATERIALS_BUCKET)
          .createSignedUrl(material.storage_path, 7 * 86_400);
        materialsLink = signed?.signedUrl ?? '';
      }
      const nextDate = sessions.find((s) => s.day_number > active.day_number)?.session_date ?? '';
      const body = fillTemplate(template, {
        name: row.person.first_name,
        class: klass.title,
        day: String(active.day_number),
        date: fmtDate(active.session_date),
        time: fmtTime(active.start_time),
        summary: active.summary ?? '',
        materials_link: materialsLink,
        next_date: nextDate ? fmtDate(nextDate) : '',
        reply_link: token ? `${window.location.origin}/reply/${token}` : '',
        venue: venueLabel(klass.venue),
        volunteer: member?.full_name ?? '',
      });
      if (!body) {
        toast.error('No catch-up message is set up yet.');
        return;
      }
      const channel = pickChannel({
        phone: row.person.phone,
        email: row.person.email,
        contact_preference: row.person.contact_preference,
      });
      const href = channel
        ? messageHref(
            channel,
            { phone: row.person.phone, email: row.person.email },
            { subject: `${klass.title} catch-up`, body }
          )
        : null;
      if (!channel || !href) {
        toast.error('No phone or email on file for this person.');
        return;
      }
      window.open(href, '_blank', 'noopener');
      await supabase.from('m1_message_log').insert({
        class_id: classId,
        session_id: active.id,
        person_id: row.person.id,
        purpose: 'catch_up',
        channel,
        sent_by: member?.id ?? null,
      });
      toast.success(`Catch-up ready for ${personName(row.person)}`);
      refresh();
      onChanged();
    } finally {
      setSending(null);
    }
  }

  if (sessions.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CalendarX2 />
          </EmptyMedia>
          <EmptyTitle>No days recorded</EmptyTitle>
        </EmptyHeader>
        <EmptyContent>
          <EmptyDescription>There are no class days to review yet.</EmptyDescription>
        </EmptyContent>
      </Empty>
    );
  }

  if (closed.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CalendarX2 />
          </EmptyMedia>
          <EmptyTitle>No closed day yet</EmptyTitle>
        </EmptyHeader>
        <EmptyContent>
          <EmptyDescription>
            People appear here after a day is closed and someone is not ticked.
          </EmptyDescription>
        </EmptyContent>
      </Empty>
    );
  }

  const missedSuffix = active ? `${active.day_number}` : '';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {closed.map((s) => (
          <Button
            key={s.id}
            size="sm"
            variant={active?.id === s.id ? 'default' : 'outline'}
            className="h-8 rounded-full"
            onClick={() => setSelectedId(s.id)}
          >
            Day {s.day_number}
          </Button>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        {klass.title}
        {active && ` · ${rows.length} missed Day ${active.day_number}`}
      </p>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
        <div className="min-w-0">
          {loading ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : rows.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <CalendarX2 />
                </EmptyMedia>
                <EmptyTitle>No absences for Day {missedSuffix}</EmptyTitle>
              </EmptyHeader>
              <EmptyContent>
                <EmptyDescription>Everyone was ticked present on this day.</EmptyDescription>
              </EmptyContent>
            </Empty>
          ) : (
            <div className="overflow-hidden rounded-xl border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Missed</th>
                    <th className="hidden px-3 py-2 font-medium sm:table-cell">Phone</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.person.id} className="border-b last:border-0">
                      <td className="px-3 py-2 font-medium">{personName(row.person)}</td>
                      <td className="px-3 py-2">Day {missedSuffix}</td>
                      <td className="hidden px-3 py-2 text-muted-foreground sm:table-cell">
                        {row.person.phone || REPLAY_PLACEHOLDER}
                      </td>
                      <td className="px-3 py-2">
                        <MissedStatus row={row} />
                      </td>
                      <td className="px-3 py-2 text-right">
                        {row.reply ? (
                          <Button size="sm" variant="outline" onClick={() => setViewing(row)}>
                            View reply
                          </Button>
                        ) : row.sentAt ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={sending === row.person.id}
                            onClick={() => sendCatchUp(row)}
                          >
                            Resend
                          </Button>
                        ) : (
                          <Button size="sm" disabled={sending === row.person.id} onClick={() => sendCatchUp(row)}>
                            {sending === row.person.id ? <Spinner className="size-3.5" /> : null}
                            Send catch-up
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <Card>
          <CardContent className="flex flex-col gap-2 pt-6">
            <div>
              <p className="font-medium">Why people missed</p>
              <p className="text-xs text-muted-foreground">{replyTotal} replies so far</p>
            </div>
            <div className="flex flex-col">
              {ABSENCE_REASONS.map((reason) => (
                <div
                  key={reason}
                  className="flex items-center justify-between border-t py-1.5 text-sm first:border-t-0"
                >
                  <span>{reason}</span>
                  <span className="tabular-nums font-medium">{reasonCounts[reason] ?? 0}</span>
                </div>
              ))}
            </div>
            {latestReply && (
              <div>
                <p className="mt-2 text-xs font-semibold text-muted-foreground">Latest reply</p>
                <div className="mt-1 rounded-lg bg-muted p-2.5 text-sm">
                  {latestReply.note ? `“${latestReply.note}” ` : `${latestReply.reason}. `}
                  <span className="text-muted-foreground">{latestReply.name}</span>
                </div>
              </div>
            )}
            <Button variant="outline" size="sm" className="mt-1" onClick={() => setRecording(true)}>
              Record a reason I heard by phone
            </Button>
          </CardContent>
        </Card>
      </div>

      {viewing && viewing.reply && (
        <Dialog open onOpenChange={(o) => !o && setViewing(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{personName(viewing.person)}</DialogTitle>
              <DialogDescription>
                Day {missedSuffix} · replied {fmtDate(viewing.reply.created_at)}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Badge variant="outline">{viewing.reply.reason}</Badge>
              <p className="text-sm">{viewing.reply.note || 'No extra note.'}</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setViewing(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {recording && active && (
        <RecordReasonDialog
          klass={klass}
          session={active}
          rows={rows}
          onClose={() => setRecording(false)}
          onSaved={() => {
            setRecording(false);
            refresh();
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function MissedStatus({ row }: { row: MissedRow }) {
  if (row.reply) {
    return <Badge className="border-green-500/40 bg-green-500/10 text-green-700">Replied: {row.reply.reason}</Badge>;
  }
  if (row.sentAt) {
    return (
      <Badge className="border-amber-500/40 bg-amber-500/10 text-amber-700">
        Message sent {fmtClock(row.sentAt)}
      </Badge>
    );
  }
  return <Badge className="border-red-500/40 bg-red-500/10 text-red-700">Not contacted</Badge>;
}

interface RecordReasonDialogProps {
  klass: M1Class;
  session: M1Session;
  rows: MissedRow[];
  onClose: () => void;
  onSaved: () => void;
}

function RecordReasonDialog({ klass, session, rows, onClose, onSaved }: RecordReasonDialogProps) {
  const member = useShellMember();
  const supabase = createClient();
  const [personId, setPersonId] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const personItems: SelectOption[] = rows.map((r) => ({ value: r.person.id, label: personName(r.person) }));
  const reasonItems: SelectOption[] = ABSENCE_REASONS.map((r) => ({ value: r, label: r }));

  async function save() {
    if (!personId || !reason) {
      toast.error('Pick a person and a reason.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('m1_absence_replies').insert({
      session_id: session.id,
      person_id: personId,
      reason,
      note: note.trim() || null,
      source: 'Volunteer',
      recorded_by: member?.id ?? null,
    });
    setSaving(false);
    if (error) {
      toast.error(rlsErrorMessage(error));
      return;
    }
    toast.success('Reason recorded');
    onSaved();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record a reason I heard by phone</DialogTitle>
          <DialogDescription>
            {klass.title} · Day {session.day_number} · recorded by you
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Person</Label>
            <Select items={personItems} value={personId || undefined} onValueChange={(v) => setPersonId(v ?? '')}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a person" />
              </SelectTrigger>
              <SelectContent>
                {personItems.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Reason</Label>
            <Select items={reasonItems} value={reason || undefined} onValueChange={(v) => setReason(v ?? '')}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a reason" />
              </SelectTrigger>
              <SelectContent>
                {reasonItems.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="reason-note">Note (optional)</Label>
            <Textarea
              id="reason-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything they told you"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={saving} onClick={save}>
            {saving ? <Spinner className="size-4" /> : null}
            Save reason
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
