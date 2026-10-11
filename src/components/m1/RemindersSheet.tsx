import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { BellRing } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { rlsErrorMessage } from '@/lib/rls-error';
import { useIsMobile } from '@/lib/use-is-mobile';
import { useShellMember } from '@/components/layout/shell';
import {
  fmtDate,
  fmtDateFull,
  fmtTime,
  personName,
  venueLabel,
  type M1Class,
  type M1Session,
} from '@/components/m1/m1';
import { fetchEnrollments, type M1Enrollment } from '@/components/m1/m1';
import { fillTemplate, type TemplateValues } from '@/lib/templates';
import { pickChannel } from '@/lib/messaging';
import { fetchTemplate } from '@/components/classes/templates';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle, ItemMedia } from '@/components/ui/item';
import { initials } from '@/lib/names';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import ComposeMessageSheet from '@/components/classes/ComposeMessageSheet';

interface RemindersSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  klass: M1Class;
  session: M1Session;
}

/** Full first+last unless the template literally says {name} (pure first name). */
const NAME_VALUE = (person: M1Enrollment['people'], templateBody: string) =>
  templateBody.includes('{name}') ? person.first_name : personName(person);

export default function RemindersSheet({
  open,
  onOpenChange,
  klass,
  session,
}: RemindersSheetProps) {
  const isMobile = useIsMobile();
  const member = useShellMember();
  const supabase = createClient();

  const [roster, setRoster] = useState<M1Enrollment[]>([]);
  const [sentAt, setSentAt] = useState<Record<string, string>>({});
  const [template, setTemplate] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [compose, setCompose] = useState<M1Enrollment['people'] | null>(null);

  useEffect(() => {
    if (!open) return;
    setCompose(null);
    setLoading(true);

    Promise.all([
      fetchEnrollments(supabase, klass.id),
      fetchTemplate(supabase, 'm1_reminder'),
      supabase
        .from('m1_message_log')
        .select('person_id, sent_at')
        .eq('session_id', session.id)
        .eq('purpose', 'reminder'),
    ])
      .then(([enrollments, tpl, logResult]) => {
        setRoster(enrollments.filter((e) => e.status === 'Enrolled'));
        setTemplate(tpl?.body ?? '');
        const map: Record<string, string> = {};
        for (const row of logResult.data ?? []) {
          const prev = map[row.person_id];
          if (!prev || prev < row.sent_at) map[row.person_id] = row.sent_at;
        }
        setSentAt(map);
      })
      .catch((err) => {
        toast.error(rlsErrorMessage(err));
      })
      .finally(() => setLoading(false));
  }, [open, klass.id, session.id, supabase]);

  function baseValues(person: M1Enrollment['people']): TemplateValues {
    return {
      name: NAME_VALUE(person, template),
      class: klass.title,
      day: String(session.day_number),
      date: fmtDateFull(session.session_date),
      time: fmtTime(session.start_time),
      venue: venueLabel(klass.venue),
      volunteer: member?.full_name ?? '',
    };
  }

  if (isMobile) {
    return (
      <>
        <Drawer open={open} onOpenChange={onOpenChange}>
          <DrawerContent className="max-h-[90dvh]">
            <DrawerHeader>
              <DrawerTitle>Reminders — Day {session.day_number}</DrawerTitle>
              <DrawerDescription>
                {fmtDate(session.session_date)} · {fmtTime(session.start_time)} · {venueLabel(klass.venue)}
              </DrawerDescription>
            </DrawerHeader>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
              <Body />
            </div>
          </DrawerContent>
        </Drawer>
        {compose && <Compose person={compose} />}
      </>
    );
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Reminders — Day {session.day_number}</SheetTitle>
            <SheetDescription>
              {fmtDate(session.session_date)} · {fmtTime(session.start_time)} · {venueLabel(klass.venue)}
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4">
            <Body />
          </div>
        </SheetContent>
      </Sheet>

      {compose && <Compose person={compose} />}
    </>
  );

  function Compose({ person }: { person: M1Enrollment['people'] }) {
    return (
      <ComposeMessageSheet
        open
        onOpenChange={(o) => setCompose(o ? person : null)}
        person={person}
        heading="Class reminder"
        body={template ? fillTemplate(template, baseValues(person)) : ''}
        purpose="reminder"
        classId={klass.id}
        sessionId={session.id}
        onLogged={() => {
          supabase
            .from('m1_message_log')
            .select('person_id, sent_at')
            .eq('session_id', session.id)
            .eq('purpose', 'reminder')
            .then(({ data: rows }) => {
              const map: Record<string, string> = {};
              for (const row of rows ?? []) {
                const prev = map[row.person_id];
                if (!prev || prev < row.sent_at) map[row.person_id] = row.sent_at;
              }
              setSentAt(map);
            });
        }}
      />
    );
  }

  function Body() {
    if (loading) {
      return (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      );
    }
    if (roster.length === 0) {
      return (
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
      );
    }
    return (
      <div className="flex flex-col gap-1.5">
        {roster.map((e) => {
          const channel = pickChannel(e.people);
          const sent = sentAt[e.person_id];
          return (
            <Item key={e.id} variant="outline">
              <ItemMedia variant="image">
                <Avatar size="sm">
                  <AvatarFallback>{initials(e.people.first_name, e.people.last_name)}</AvatarFallback>
                </Avatar>
              </ItemMedia>
              <ItemContent>
                <ItemTitle>{personName(e.people)}</ItemTitle>
                <ItemDescription>
                  {channel ?? 'No contact'} {sent && <span className="text-emerald-600">· Sent</span>}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                {sent ? (
                  <Badge variant="outline" className="text-emerald-600">Sent</Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!channel}
                    onClick={() => setCompose(e.people)}
                  >
                    Send reminder
                  </Button>
                )}
              </ItemActions>
            </Item>
          );
        })}
      </div>
    );
  }
}