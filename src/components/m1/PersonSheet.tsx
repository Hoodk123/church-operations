import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Phone, MessageCircle, Mail, Smartphone, GraduationCap } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { rlsErrorMessage } from '@/lib/rls-error';
import { useIsMobile } from '@/lib/use-is-mobile';
import { useShellMember } from '@/components/layout/shell';
import {
  fmtDate,
  fmtTime,
  personName,
  fetchClassSessions,
  progressFor,
  dayStatusColor,
  type M1Class,
  type M1Person,
  type M1Session,
} from '@/components/m1/m1';
import { availableChannels, messageHref, pickChannel, type Channel } from '@/lib/messaging';
import { fillTemplate } from '@/lib/templates';
import { fetchTemplate } from '@/components/classes/templates';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

interface PersonSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  person: M1Person | null;
  klass: M1Class;
  isAdmin: boolean;
  onChanged: () => void;
}

type SendChannel = Exclude<Channel, 'Call'>;

const TEMPLATE_PURPOSES: { purpose: string; label: string; logPurpose: string }[] = [
  { purpose: 'm1_reminder', label: 'Class reminder', logPurpose: 'reminder' },
  { purpose: 'm1_catch_up', label: 'Missed catch-up', logPurpose: 'catch_up' },
  { purpose: 'm1_materials', label: 'Notes', logPurpose: 'materials' },
  { purpose: 'm1_certificate', label: 'Certificate ready', logPurpose: 'certificate' },
];

const MESSAGE_VERBS: Record<string, string> = {
  reminder: 'reminded you',
  catch_up: 'sent a catch-up',
  materials: 'sent the notes',
  certificate: 'sent your certificate',
  baptism: 'sent a baptism reminder',
  other: 'sent a message',
};

interface LastMessage {
  verb: string;
  channel: string;
  date: string;
  sender: string | null;
}

export default function PersonSheet({
  open,
  onOpenChange,
  person,
  klass,
  isAdmin,
  onChanged,
}: PersonSheetProps) {
  const isMobile = useIsMobile();
  const member = useShellMember();
  const supabase = createClient();

  const [sessions, setSessions] = useState<M1Session[]>([]);
  const [attendance, setAttendance] = useState<Record<string, string>>({});
  const [templates, setTemplates] = useState<{ purpose: string; name: string; body: string }[]>([]);
  const [purpose, setPurpose] = useState('m1_reminder');
  const [certNo, setCertNo] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [lastMessage, setLastMessage] = useState<LastMessage | null>(null);
  const [needs, setNeeds] = useState({ m1: false, baptism: false, pastor: false });
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const personId = person?.id ?? null;

  useEffect(() => {
    if (!open || !personId || !person) return;
    setLoading(true);
    setCertNo(null);
    setStatus(null);
    setLastMessage(null);
    setAttendance({});
    setNeeds({ m1: person.needs_m1, baptism: person.needs_baptism, pastor: person.needs_pastor });

    Promise.all([
      fetchClassSessions(supabase, klass.id),
      Promise.all(TEMPLATE_PURPOSES.map((t) => fetchTemplate(supabase, t.purpose))),
      supabase
        .from('m1_enrollments')
        .select('status, certificate_no')
        .eq('class_id', klass.id)
        .eq('person_id', personId)
        .maybeSingle(),
    ]).then(async ([s, tpls, enrollment]) => {
      setSessions(s);
      setTemplates(
        TEMPLATE_PURPOSES.map((t, i) => ({
          purpose: t.purpose,
          name: tpls[i]?.name ?? t.label,
          body: tpls[i]?.body ?? '',
        })).filter((t) => t.body)
      );
      setStatus(enrollment.data?.status ?? null);
      setCertNo(enrollment.data?.certificate_no ?? null);

      const sessionIds = s.map((x) => x.id);
      if (sessionIds.length === 0) return;

      const [att, log] = await Promise.all([
        supabase
          .from('m1_attendance')
          .select('session_id, status')
          .eq('person_id', personId)
          .in('session_id', sessionIds),
        supabase
          .from('m1_message_log')
          .select('purpose, channel, created_at, sent_by')
          .eq('person_id', personId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const next: Record<string, string> = {};
      for (const row of (att.data ?? []) as { session_id: string; status: string }[]) {
        next[row.session_id] = row.status;
      }
      setAttendance(next);

      if (log.data) {
        let sender: string | null = null;
        if (log.data.sent_by) {
          const { data: tm } = await supabase
            .from('team_members')
            .select('full_name')
            .eq('id', log.data.sent_by)
            .maybeSingle();
          sender = tm?.full_name ?? null;
        }
        setLastMessage({
          verb: MESSAGE_VERBS[log.data.purpose] ?? 'sent a message',
          channel: log.data.channel,
          date: fmtDate(log.data.created_at),
          sender,
        });
      }
    }).catch(() => {}).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, personId, klass.id, supabase]);

  const activeSession = useMemo(
    () => sessions.find((s) => !s.closed) ?? sessions[sessions.length - 1] ?? null,
    [sessions]
  );

  const nextSession = useMemo(
    () => sessions.find((s) => s.session_date >= new Date().toISOString().slice(0, 10)) ?? null,
    [sessions]
  );

  if (!person) return null;

  const usable = availableChannels(person).filter((c): c is SendChannel => c !== 'Call');
  const preferred = pickChannel(person);
  const defaultSend: SendChannel = preferred && preferred !== 'Call' ? preferred : usable[0] ?? 'WhatsApp';

  const currentTemplate = templates.find((t) => t.purpose === purpose) ?? templates[0] ?? null;

  function valuesFor(body: string) {
    return {
      name: body.includes('{name}') ? person!.first_name : personName(person!),
      class: klass.title,
      day: activeSession ? String(activeSession.day_number) : '',
      date: activeSession ? fmtDate(activeSession.session_date) : '',
      time: activeSession ? fmtTime(activeSession.start_time) : '',
      venue: klass.venue || 'ROC Church',
      next_date: nextSession ? fmtDate(nextSession.session_date) : '',
      summary: activeSession?.summary ?? '',
      volunteer: member?.full_name ?? '',
    };
  }

  const draftBody = currentTemplate ? fillTemplate(currentTemplate.body, valuesFor(currentTemplate.body)) : '';

  async function openAndLog(channel: Channel, body: string, logPurpose: string, subject?: string) {
    const href = messageHref(channel, person!, { subject, body });
    if (!href) {
      toast.error(`No ${channel} contact on file`);
      return;
    }
    window.open(href, '_blank', 'noopener');
    const { error } = await supabase.from('m1_message_log').insert({
      person_id: person!.id,
      class_id: klass.id,
      session_id: activeSession?.id ?? null,
      purpose: logPurpose,
      channel,
      sent_by: member?.id ?? null,
    });
    if (error) {
      toast.info(`${personName(person!)}: opened in ${channel}`);
      return;
    }
    toast.success(`${personName(person!)}: opened in ${channel}`);
    setLastMessage({
      verb: MESSAGE_VERBS[logPurpose] ?? 'sent a message',
      channel,
      date: fmtDate(new Date().toISOString()),
      sender: member?.full_name ?? null,
    });
    onChanged();
  }

  async function sendTemplate() {
    if (!draftBody) return;
    setSending(true);
    const log = TEMPLATE_PURPOSES.find((t) => t.purpose === purpose)?.logPurpose ?? 'other';
    await openAndLog(defaultSend, draftBody, log, currentTemplate?.name);
    setSending(false);
  }

  async function toggleNeed(field: 'needs_m1' | 'needs_baptism' | 'needs_pastor', value: boolean) {
    setNeeds((prev) =>
      field === 'needs_m1'
        ? { ...prev, m1: value }
        : field === 'needs_baptism'
          ? { ...prev, baptism: value }
          : { ...prev, pastor: value }
    );
    const { error } = await supabase.from('people').update({ [field]: value }).eq('id', personId!);
    if (error) toast.error(rlsErrorMessage(error));
    onChanged();
  }

  const presentCount = Object.values(attendance).filter((s) => s === 'Present').length;
  const progress = progressFor({ [personId!]: presentCount }, klass.required_days, personId!);

  const contactButtons: { channel: Channel; label: string; icon: typeof Phone }[] = [
    { channel: 'Call', label: person.phone ? 'Call' : 'No phone', icon: Phone },
    { channel: 'WhatsApp', label: person.phone ? 'WhatsApp' : 'No phone', icon: MessageCircle },
  ];
  const prefThird = person.contact_preference === 'Email' || person.contact_preference === 'SMS' ? person.contact_preference : 'Email';
  contactButtons.push(
    prefThird === 'SMS'
      ? { channel: 'SMS', label: person.phone ? 'SMS' : 'No phone', icon: Smartphone }
      : { channel: 'Email', label: person.email ? 'Email' : 'No email', icon: Mail }
  );

  const addressLine =
    [person.location, person.address_details].filter(Boolean).join(' · ') || 'No address on file';

  const body = loading ? (
    <div className="flex justify-center py-10">
      <Spinner />
    </div>
  ) : (
    <div className="space-y-4">
      <div>
        <p className="font-medium">{personName(person)}</p>
        <p className="text-xs text-muted-foreground">
          Enrolled · {klass.title} · {presentCount} of {klass.required_days} days
        </p>
      </div>

      <div className="space-y-0.5 rounded-xl border bg-card p-3 text-sm">
        <p className="font-medium">{person.phone || 'No phone on file'}</p>
        <p className="text-muted-foreground">{addressLine}</p>
        <p className="text-muted-foreground">
          Prefers {person.contact_preference || 'WhatsApp'}
          {person.email ? ` · ${person.email}` : ' · No email'}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {contactButtons.map((action) => {
          const canUse = action.channel === 'Email' ? !!person.email : !!person.phone;
          return (
            <Button
              key={action.channel}
              variant="outline"
              size="sm"
              className="w-full"
              disabled={!canUse}
              onClick={() => openAndLog(action.channel, '', 'other')}
            >
              <action.icon className="size-3.5" />
              {action.label}
            </Button>
          );
        })}
      </div>

      <div className="space-y-1.5">
        <p className="text-sm font-medium">Attendance</p>
        <div className="flex flex-wrap gap-1.5">
          {sessions.length === 0 && (
            <span className="text-xs text-muted-foreground">No days recorded</span>
          )}
          {sessions.map((s) => {
            const here = attendance[s.id] === 'Present';
            const label = here
              ? `Day ${s.day_number} · here`
              : s.closed
                ? `Day ${s.day_number} · not ticked`
                : `Day ${s.day_number}`;
            const cls = here
              ? 'border-green-500/40 bg-green-500/10 text-green-700'
              : s.closed
                ? 'text-muted-foreground'
                : 'text-muted-foreground opacity-50';
            return (
              <Badge key={s.id} variant="outline" className={cls}>
                {label}
              </Badge>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Send a message</p>
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
        <Label htmlFor="m1-person-message" className="sr-only">
          Message
        </Label>
        <Textarea id="m1-person-message" readOnly value={draftBody} rows={5} className="text-base" />
        <Button className="w-full" disabled={sending || !draftBody} onClick={sendTemplate}>
          {sending ? <Spinner className="size-4" /> : null}
          Open {defaultSend}
        </Button>
        <p className="text-xs text-muted-foreground">
          {lastMessage
            ? `Last message: ${lastMessage.sender ? `${lastMessage.sender} ` : ''}${lastMessage.verb} on ${lastMessage.date} (${lastMessage.channel})`
            : 'No messages recorded yet.'}
        </p>
      </div>

      <div className="rounded-xl border bg-card p-3">
        <div className="mb-1.5 flex items-center justify-between text-sm">
          <span className="flex items-center gap-1.5 font-medium">
            <GraduationCap className="size-4 text-muted-foreground" />
            M1 class progress
          </span>
          <span className="text-muted-foreground">
            {presentCount}/{klass.required_days} days
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full ${dayStatusColor(presentCount, klass.required_days)}`}
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
        {status && (
          <p className="mt-2 text-xs text-muted-foreground">
            {status}
            {certNo ? ` · Certificate ${certNo}` : ''}
          </p>
        )}
        <Button variant="link" size="sm" className="mt-1 h-auto px-0" render={<Link to="/people" />}>
          Edit person
        </Button>
      </div>

      {isAdmin && (
        <div className="space-y-2 rounded-xl border bg-card p-3">
          <p className="text-sm font-medium">Flags</p>
          <div className="flex items-center justify-between">
            <span className="text-sm">Needs M1</span>
            <Switch checked={needs.m1} onCheckedChange={(v) => toggleNeed('needs_m1', v)} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Needs baptism</span>
            <Switch checked={needs.baptism} onCheckedChange={(v) => toggleNeed('needs_baptism', v)} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Needs pastor</span>
            <Switch checked={needs.pastor} onCheckedChange={(v) => toggleNeed('needs_pastor', v)} />
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1 text-base" onClick={() => onOpenChange(false)}>
          Close
        </Button>
      </div>
    </div>
  );

  return isMobile ? (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90dvh]">
        <DrawerHeader>
          <DrawerTitle>{personName(person)}</DrawerTitle>
          <DrawerDescription>Class member</DrawerDescription>
        </DrawerHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{body}</div>
      </DrawerContent>
    </Drawer>
  ) : (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{personName(person)}</SheetTitle>
          <SheetDescription>Class member</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-4">{body}</div>
      </SheetContent>
    </Sheet>
  );
}
