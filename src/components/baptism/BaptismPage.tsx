import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CalendarPlus, Droplets, Send } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { rlsErrorMessage } from '@/lib/rls-error';
import { useShellMember } from '@/components/layout/shell';
import { personName, fmtDateFull, fmtTime } from '@/components/m1/m1';
import { fetchTemplate } from '@/components/classes/templates';
import { fillTemplate } from '@/lib/templates';
import { venueLabel } from '@/components/m1/m1';
import ScreenHeader from '@/components/layout/ScreenHeader';
import ComposeMessageSheet, { type ComposeRecipient } from '@/components/classes/ComposeMessageSheet';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle, ItemMedia } from '@/components/ui/item';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { initials } from '@/lib/names';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';

interface BaptismEvent {
  id: string;
  event_date: string;
  event_time: string | null;
  venue: string | null;
  status: string;
  registered: number;
}

export default function BaptismPage() {
  const member = useShellMember();
  const supabase = createClient();

  const isLeader =
    member?.role === 'Admin' || member?.role === 'Pastor' || member?.role === 'Follow-up Coordinator';

  const [candidates, setCandidates] = useState<Record<string, string>[]>([]);
  const [events, setEvents] = useState<BaptismEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const [compose, setCompose] = useState<{ person: ComposeRecipient; body: string } | null>(null);

  const [newEventOpen, setNewEventOpen] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('10:00');
  const [newVenue, setNewVenue] = useState('ROC Church');

  const load = useCallback(async () => {
    setLoading(true);
    const [candRes, eventRes, regRes] = await Promise.all([
      supabase.rpc('baptism_candidates'),
      supabase.from('baptism_events').select('*').order('event_date', { ascending: true }),
      supabase.from('baptism_registrations').select('event_id, id'),
    ]);

    const registeredByEvent: Record<string, number> = {};
    for (const reg of (regRes.data ?? []) as { event_id: string; id: string }[]) {
      registeredByEvent[reg.event_id] = (registeredByEvent[reg.event_id] ?? 0) + 1;
    }

    setCandidates((candRes.data ?? []) as Record<string, string>[]);
    setEvents(
      ((eventRes.data ?? []) as Record<string, string | null>[])
        .filter((e) => e.status === 'Scheduled' || e.status === 'Done')
        .map((e) => ({
          id: e.id as string,
          event_date: e.event_date as string,
          event_time: e.event_time as string | null,
          venue: e.venue as string | null,
          status: e.status as string,
          registered: registeredByEvent[e.id as string] ?? 0,
        }))
    );
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const nextEvent = useMemo(() => events.find((e) => e.status === 'Scheduled') ?? null, [events]);

  async function prepareReminder(row: Record<string, string>) {
    const template = await fetchTemplate(supabase, 'baptism_reminder');
    const body = template
      ? fillTemplate(template.body, {
          name: `${row.first_name}`,
          date: nextEvent ? fmtDateFull(nextEvent.event_date) : '',
          time: nextEvent && nextEvent.event_time ? fmtTime(nextEvent.event_time) : '',
          venue: nextEvent ? venueLabel(nextEvent.venue) : '',
          volunteer: member?.full_name ?? 'Pastor',
        })
      : '';
    setCompose({ person: row as unknown as ComposeRecipient, body });
  }

  async function register(row: Record<string, string>) {
    if (!nextEvent) {
      toast.info('Create an upcoming baptism service first.');
      return;
    }
    const { error } = await supabase.from('baptism_registrations').insert({
      event_id: nextEvent.id,
      person_id: row.id,
      status: 'Registered',
      created_by: member?.id ?? null,
    });
    if (error) {
      toast.error(rlsErrorMessage(error));
      return;
    }
    toast.success(`${row.first_name} registered for baptism`);
    load();
  }

  async function createEvent() {
    if (!newDate) {
      toast.error('Pick a date');
      return;
    }
    const { error } = await supabase.from('baptism_events').insert({
      event_date: newDate,
      event_time: newTime || null,
      venue: newVenue.trim() || null,
      status: 'Scheduled',
      created_by: member?.id ?? null,
    });
    if (error) {
      toast.error(rlsErrorMessage(error));
      return;
    }
    toast.success('Service scheduled');
    setNewEventOpen(false);
    load();
  }

  async function markDone(event: BaptismEvent) {
    const { error: evErr } = await supabase
      .from('baptism_events')
      .update({ status: 'Done' })
      .eq('id', event.id);
    if (evErr) {
      toast.error(rlsErrorMessage(evErr));
      return;
    }
    const { error: regErr } = await supabase
      .from('baptism_registrations')
      .update({ status: 'Baptized' })
      .eq('event_id', event.id);
    if (regErr) {
      toast.error(rlsErrorMessage(regErr));
      return;
    }
    toast.success('Service marked done and registrations baptized');
    load();
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-4 sm:px-6">
      <ScreenHeader
        title="Baptism"
        sub="Candidates and upcoming baptism services"
        action={
          member?.role === 'Admin' || member?.role === 'Pastor' ? (
            <Button variant="outline" onClick={() => setNewEventOpen(true)}>
              <CalendarPlus className="size-4" />
              New service
            </Button>
          ) : undefined
        }
      />

      <div className="space-y-6">
        {events.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-medium text-muted-foreground">
              Upcoming services · {events.filter((e) => e.status === 'Scheduled').length}
            </h2>
            <div className="flex flex-col gap-1.5">
              {events
                .filter((e) => e.status === 'Scheduled')
                .map((event) => (
                  <Item key={event.id} variant="outline">
                    <ItemMedia variant="icon">
                      <Droplets />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>
                        {fmtDateFull(event.event_date)}
                        {event.event_time && ` · ${fmtTime(event.event_time)}`}
                        {event.status === 'Done' && <Badge variant="outline">Done</Badge>}
                      </ItemTitle>
                      <ItemDescription>
                        {venueLabel(event.venue)} · {event.registered}{' '}
                        {event.registered === 1 ? 'person' : 'people'} registered
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      {(member?.role === 'Admin' || member?.role === 'Pastor') && (
                        <Button size="sm" variant="outline" onClick={() => markDone(event)}>
                          Mark done
                        </Button>
                      )}
                    </ItemActions>
                  </Item>
                ))}
            </div>
          </section>
        )}

        <section className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            Candidates · {candidates.length}
          </h2>

          {loading ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : candidates.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Droplets />
                </EmptyMedia>
                <EmptyTitle>No baptism candidates</EmptyTitle>
              </EmptyHeader>
              <EmptyContent>
                <EmptyDescription>
                  People flagged as needing baptism appear here.
                </EmptyDescription>
              </EmptyContent>
            </Empty>
          ) : (
            <div className="flex flex-col gap-1.5">
              {candidates.map((row) => (
                <Item key={row.id} variant="outline">
                  <ItemMedia variant="image">
                    <Avatar size="sm">
                      <AvatarFallback>
                        {initials(row.first_name, row.last_name)}
                      </AvatarFallback>
                    </Avatar>
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>{personName(row as { first_name: string; last_name: string })}</ItemTitle>
                    <ItemDescription>
                      {[row.age_group, row.location, row.category].filter(Boolean).join(' · ')}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    {isLeader && (
                      <Button size="sm" variant="outline" onClick={() => prepareReminder(row)}>
                        <Send className="size-3.5" />
                        Reminder
                      </Button>
                    )}
                    {isLeader && (
                      <Button size="sm" onClick={() => register(row)}>
                        Register
                      </Button>
                    )}
                  </ItemActions>
                </Item>
              ))}
            </div>
          )}
        </section>
      </div>

      {compose && (
        <ComposeMessageSheet
          open
          onOpenChange={(open) => {
            if (!open) setCompose(null);
          }}
          person={compose.person}
          heading="Baptism reminder"
          body={compose.body}
          purpose="baptism"
          onLogged={load}
        />
      )}

      <Drawer open={newEventOpen} onOpenChange={setNewEventOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>New baptism service</DrawerTitle>
            <DrawerDescription>Schedule the next date people can be baptized.</DrawerDescription>
          </DrawerHeader>
          <div className="space-y-4 px-4">
            <div className="space-y-1.5">
              <Label htmlFor="be-date">Date</Label>
              <Input
                id="be-date"
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="be-time">Time</Label>
              <Input
                id="be-time"
                type="time"
                value={newTime}
                onChange={(e) => setNewTime(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="be-venue">Venue</Label>
              <Input
                id="be-venue"
                value={newVenue}
                onChange={(e) => setNewVenue(e.target.value)}
              />
            </div>
          </div>
          <DrawerFooter>
            <Button onClick={createEvent} disabled={!newDate}>
              Schedule
            </Button>
            <Button variant="outline" onClick={() => setNewEventOpen(false)}>
              Cancel
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}