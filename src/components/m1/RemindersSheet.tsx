import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { BellRing } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { rlsErrorMessage } from '@/lib/rls-error';
import { useShellMember } from '@/components/layout/shell';
import {
  fmtDate,
  fmtTime,
  personName,
  venueLabel,
  fetchEnrollments,
  type M1Class,
  type M1Enrollment,
  type M1Session,
} from '@/components/m1/m1';
import { fillTemplate, type TemplateValues } from '@/lib/templates';
import { messageHref, pickChannel } from '@/lib/messaging';
import { fetchTemplate } from '@/components/classes/templates';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface RemindersSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  klass: M1Class;
  session: M1Session;
}

const TEMPLATE_PURPOSES: { purpose: string; label: string; logPurpose: string }[] = [
  { purpose: 'm1_reminder', label: 'Class reminder', logPurpose: 'reminder' },
  { purpose: 'm1_catch_up', label: 'Missed catch-up', logPurpose: 'catch_up' },
  { purpose: 'm1_materials', label: 'Notes', logPurpose: 'materials' },
  { purpose: 'm1_certificate', label: 'Certificate ready', logPurpose: 'certificate' },
];

/** Full first+last unless the template literally says {name} (pure first name). */
const NAME_VALUE = (person: M1Enrollment['people'], templateBody: string) =>
  templateBody.includes('{name}') ? person.first_name : personName(person);

export default function RemindersSheet({ open, onOpenChange, klass, session }: RemindersSheetProps) {
  const member = useShellMember();
  const supabase = createClient();

  const [data, setData] = useState<{
    key: string;
    roster: M1Enrollment[];
    sentAt: Record<string, string>;
    templates: { purpose: string; name: string; body: string }[];
  } | null>(null);
  const [purpose, setPurpose] = useState('m1_reminder');
  const [sending, setSending] = useState<string | null>(null);

  const dataKey = `${klass.id}:${session.id}`;
  const roster = data?.key === dataKey ? data.roster : [];
  const sentAt = data?.key === dataKey ? data.sentAt : {};
  const templates = data?.key === dataKey ? data.templates : [];
  const loading = data?.key !== dataKey;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([
      fetchEnrollments(supabase, klass.id),
      Promise.all(TEMPLATE_PURPOSES.map((t) => fetchTemplate(supabase, t.purpose))),
      supabase
        .from('m1_message_log')
        .select('person_id, sent_at')
        .eq('session_id', session.id),
    ])
      .then(([enrollments, tpls, logResult]) => {
        if (cancelled) return;
        const map: Record<string, string> = {};
        for (const row of logResult.data ?? []) {
          const prev = map[row.person_id];
          if (!prev || prev < row.sent_at) map[row.person_id] = row.sent_at;
        }
        setData({
          key: dataKey,
          roster: enrollments.filter((e) => e.status === 'Enrolled'),
          sentAt: map,
          templates: TEMPLATE_PURPOSES.map((t, i) => ({
            purpose: t.purpose,
            name: tpls[i]?.name ?? t.label,
            body: tpls[i]?.body ?? '',
          })).filter((t) => t.body),
        });
      })
      .catch((err) => toast.error(rlsErrorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [open, klass.id, session.id, supabase, dataKey]);

  const currentTemplate = templates.find((t) => t.purpose === purpose) ?? templates[0] ?? null;

  function valuesFor(person: M1Enrollment['people'], templateBody: string): TemplateValues {
    return {
      name: NAME_VALUE(person, templateBody),
      class: klass.title,
      day: String(session.day_number),
      date: fmtDate(session.session_date),
      time: fmtTime(session.start_time),
      venue: venueLabel(klass.venue),
      volunteer: member?.full_name ?? '',
    };
  }

  async function send(person: M1Enrollment['people']) {
    const channel = pickChannel(person);
    if (!channel || channel === 'Call' || !currentTemplate) return;
    const body = fillTemplate(currentTemplate.body, valuesFor(person, currentTemplate.body));
    const href = messageHref(channel, person, { subject: currentTemplate.name, body });
    if (!href) {
      toast.error(`No ${channel} contact on file`);
      return;
    }
    window.open(href, '_blank', 'noopener');
    setSending(person.id);
    const logPurpose = TEMPLATE_PURPOSES.find((t) => t.purpose === purpose)?.logPurpose ?? 'other';
    const { error } = await supabase.from('m1_message_log').insert({
      person_id: person.id,
      class_id: klass.id,
      session_id: session.id,
      purpose: logPurpose,
      channel,
      sent_by: member?.id ?? null,
    });
    setSending(null);
    if (error) {
      toast.info(`${personName(person)}: opened in ${channel}`);
      return;
    }
    toast.success(`${personName(person)}: opened in ${channel}`);
    setData((prev) =>
      prev && prev.key === dataKey
        ? { ...prev, sentAt: { ...prev.sentAt, [person.id]: new Date().toISOString() } }
        : prev
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Send reminders</DialogTitle>
          <DialogDescription>
            Day {session.day_number} · {fmtDate(session.session_date)}, {fmtTime(session.start_time)}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : roster.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BellRing />
              </EmptyMedia>
              <EmptyTitle>No one to remind</EmptyTitle>
            </EmptyHeader>
            <EmptyContent>
              <EmptyDescription>This class has no enrolled students yet.</EmptyDescription>
            </EmptyContent>
          </Empty>
        ) : (
          <div className="space-y-3">
            {templates.length > 0 && (
              <Select
                items={templates.map((t) => ({ value: t.purpose, label: t.name }))}
                value={purpose}
                onValueChange={(v) => {
                  if (v) setPurpose(v);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a template" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.purpose} value={t.purpose}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <div className="flex max-h-[50dvh] flex-col gap-1.5 overflow-y-auto">
              {roster.map((e) => {
                const channel = pickChannel(e.people);
                const sent = sentAt[e.person_id];
                return (
                  <div
                    key={e.id}
                    className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{personName(e.people)}</p>
                      <p className="truncate text-xs text-muted-foreground">{channel ?? 'No contact'}</p>
                    </div>
                    {sent ? (
                      <Badge variant="outline" className="border-green-500/40 bg-green-500/10 text-green-700">
                        Sent
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!channel || channel === 'Call' || sending === e.person_id}
                        onClick={() => send(e.people)}
                      >
                        {sending === e.person_id ? <Spinner className="size-4" /> : null}
                        Send
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>

            <p className="text-xs text-muted-foreground">
              WhatsApp opens one chat at a time with the message ready. Press send there, then come back and tap the
              next name.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
