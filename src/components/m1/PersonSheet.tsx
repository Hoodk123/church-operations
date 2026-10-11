import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Phone, MessageCircle, Mail, Smartphone, GraduationCap } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { rlsErrorMessage } from '@/lib/rls-error';
import { useIsMobile } from '@/lib/use-is-mobile';
import {
  fmtDate,
  personName,
  fetchClassSessions,
  fetchPresentCounts,
  progressFor,
  dayStatusColor,
  type M1Person,
} from '@/components/m1/m1';
import { messageHref, type Channel } from '@/lib/messaging';
import { initials } from '@/lib/names';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { Item, ItemContent, ItemTitle, ItemDescription } from '@/components/ui/item';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
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
  classId: string;
  requiredDays: number;
  isAdmin: boolean;
  onChanged: () => void;
}

interface ReasonRow {
  reason: string;
  note: string | null;
  day_number: number;
  session_date: string;
}

const CONTACT_ACTIONS: { channel: Channel; icon: typeof Phone; label: string }[] = [
  { channel: 'Call', icon: Phone, label: 'Call' },
  { channel: 'WhatsApp', icon: MessageCircle, label: 'WhatsApp' },
  { channel: 'Email', icon: Mail, label: 'Email' },
  { channel: 'SMS', icon: Smartphone, label: 'SMS' },
];

export default function PersonSheet({
  open,
  onOpenChange,
  person,
  classId,
  requiredDays,
  isAdmin,
  onChanged,
}: PersonSheetProps) {
  const isMobile = useIsMobile();
  const supabase = createClient();

  const [presentCount, setPresentCount] = useState(0);
  const [reasons, setReasons] = useState<ReasonRow[]>([]);
  const [certNo, setCertNo] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [needs, setNeeds] = useState({ m1: false, baptism: false, pastor: false });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !person) return;
    setLoading(true);
    setPresentCount(0);
    setReasons([]);
    setCertNo(null);
    setNeeds({ m1: person.needs_m1, baptism: person.needs_baptism, pastor: person.needs_pastor });

    Promise.all([
      fetchPresentCounts(supabase, classId),
      supabase
        .from('m1_enrollments')
        .select('id, status, certificate_no')
        .eq('class_id', classId)
        .eq('person_id', person.id)
        .maybeSingle(),
      (async () => {
        const sessions = await fetchClassSessions(supabase, classId);
        const sessionIds = sessions.map((s) => s.id);
        if (sessionIds.length === 0) return [];
        const { data } = await supabase
          .from('m1_absence_replies')
          .select('reason, note, session_id')
          .eq('person_id', person.id)
          .in('session_id', sessionIds)
          .order('created_at', { ascending: false });
        return (data ?? []).map((r) => {
          const session = sessions.find((s) => s.id === r.session_id);
          return {
            reason: r.reason,
            note: r.note,
            day_number: session?.day_number ?? 0,
            session_date: session?.session_date ?? '',
          };
        });
      })(),
    ])
      .then(([counts, enrollment, rows]) => {
        setPresentCount(counts[person.id] ?? 0);
        setStatus(enrollment.data?.status ?? null);
        setCertNo(enrollment.data?.certificate_no ?? null);
        setReasons(rows);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, person?.id, classId, supabase]);

  if (!person) return null;

  const personId = person.id;

  async function toggleNeed(field: 'needs_m1' | 'needs_baptism' | 'needs_pastor', value: boolean) {
    setNeeds((prev) =>
      field === 'needs_m1'
        ? { ...prev, m1: value }
        : field === 'needs_baptism'
          ? { ...prev, baptism: value }
          : { ...prev, pastor: value }
    );
    const { error } = await supabase
      .from('people')
      .update({ [field]: value })
      .eq('id', personId);
    if (error) toast.error(rlsErrorMessage(error));
    onChanged();
  }

  const progress = progressFor({ [personId]: presentCount }, requiredDays, personId);
  const hasReasonRows = reasons.length > 0;

  const body = loading ? (
    <div className="flex justify-center py-10">
      <Spinner />
    </div>
  ) : (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Avatar size="lg">
          <AvatarFallback>{initials(person.first_name, person.last_name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate font-medium">{personName(person)}</p>
          <p className="truncate text-xs text-muted-foreground">
            {[person.age_group, person.location].filter(Boolean).join(' · ') || 'No details'}
          </p>
        </div>
        {status && (
          <Badge variant={status === 'Completed' ? 'default' : 'outline'} className="ml-auto">
            {status}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-4 gap-2">
        {CONTACT_ACTIONS.map((action) => {
          const href = messageHref(action.channel, person, {
            subject: 'Message from the church',
            body: '',
          });
          return (
            <Tooltip key={action.channel}>
              <TooltipTrigger
                render={
                  <Button
                    variant="outline"
                    size="icon"
                    disabled={!href}
                    className="w-full"
                    onClick={() => href && window.open(href, '_blank', 'noopener')}
                  >
                    <action.icon className="size-4" />
                  </Button>
                }
              />
              <TooltipContent>{action.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      <div className="rounded-xl border bg-card p-3">
        <div className="mb-1.5 flex items-center justify-between text-sm">
          <span className="flex items-center gap-1.5 font-medium">
            <GraduationCap className="size-4 text-muted-foreground" />
            M1 class progress
          </span>
          <span className="text-muted-foreground">
            {presentCount}/{requiredDays} days
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div className={`h-full rounded-full ${dayStatusColor(presentCount, requiredDays)}`} style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
        {certNo && (
          <p className="mt-2 text-xs text-muted-foreground">Certificate: {certNo}</p>
        )}
      </div>

      {hasReasonRows && (
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Reasons heard</p>
          {reasons.slice(0, 3).map((r, i) => (
            <Item key={i} variant="outline" size="sm">
              <ItemContent>
                <ItemTitle>
                  Day {r.day_number} · {r.reason}
                </ItemTitle>
                <ItemDescription>{r.note || fmtDate(r.session_date)}</ItemDescription>
              </ItemContent>
            </Item>
          ))}
        </div>
      )}

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

  return (
    isMobile ? (
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
    )
  );
}