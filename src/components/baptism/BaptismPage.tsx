import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { CalendarPlus, Droplets, Pencil, Send, Trash2, Archive, ArchiveRestore } from 'lucide-react';
import {
  archiveBaptismEvent,
  createBaptismEvent,
  deleteBaptismEvent,
  fetchBaptismCandidates,
  fetchBaptismEvents,
  fetchBaptismRegistrations,
  markBaptismEventDone,
  registerForBaptism,
  unregisterFromBaptism,
  updateBaptismEvent,
} from '@/lib/api/baptism';
import { ApiError } from '@/lib/api/client';
import type {
  BaptismCandidate,
  BaptismEvent as ApiBaptismEvent,
  BaptismRegistration,
  BaptismRegistrationPerson,
} from '../../../packages/shared/schemas/baptism';
import { logM1Message } from '@/lib/api/m1';
import { useShellMember } from '@/components/layout/shell';
import { personName, fmtDate, fmtDateFull, fmtTime, venueLabel, nextSundayISO } from '@/components/m1/m1';
import { fetchTemplate } from '@/components/classes/templates';
import { fillTemplate } from '@/lib/templates';
import { pickChannel, messageHref } from '@/lib/messaging';
import { CHURCH_NAME } from '@/lib/church';
import ScreenHeader from '@/components/layout/ScreenHeader';
import ComposeMessageSheet, { type ComposeRecipient } from '@/components/classes/ComposeMessageSheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { initials } from '@/lib/names';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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

type BaptismEvent = ApiBaptismEvent;
type Registration = BaptismRegistration;
type Candidate = BaptismCandidate;
type Named = Pick<Candidate, 'firstName' | 'lastName'>;

function displayName(person: Named) {
  return personName({ first_name: person.firstName, last_name: person.lastName });
}

function messageRecipient(person: BaptismRegistrationPerson | Candidate): ComposeRecipient {
  return {
    id: person.id,
    first_name: person.firstName,
    last_name: person.lastName,
    phone: person.phone,
    email: person.email,
    contact_preference: person.contactPreference,
  };
}

interface EditState {
  id: string | null;
  date: string;
  time: string;
  venue: string;
  notes: string;
  status: BaptismEvent['status'];
}

export default function BaptismPage() {
  const member = useShellMember();

  const role = member?.role ?? '';
  const isAdmin = role === 'Admin';
  const isPastor = role === 'Pastor';
  const isLeader = isAdmin || isPastor || role === 'Follow-up Coordinator';
  const canWrite = isAdmin || isPastor;

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [events, setEvents] = useState<BaptismEvent[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('candidates');
  const [showArchived, setShowArchived] = useState(false);

  const [compose, setCompose] = useState<{ person: ComposeRecipient; body: string } | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [registerFor, setRegisterFor] = useState<Candidate | null>(null);
  const [registerEvent, setRegisterEvent] = useState('');
  const [savingRegister, setSavingRegister] = useState(false);
  const [remindEvent, setRemindEvent] = useState<BaptismEvent | null>(null);
  const [deleteEvent, setDeleteEvent] = useState<BaptismEvent | null>(null);
  const [deleteCounts, setDeleteCounts] = useState<{ registered: number; baptized: number } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [markDoneFor, setMarkDoneFor] = useState<BaptismEvent | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [candidateRows, eventRows, registrationRows] = await Promise.all([
        fetchBaptismCandidates(),
        fetchBaptismEvents(),
        fetchBaptismRegistrations(),
      ]);
      setCandidates(candidateRows);
      setEvents(eventRows);
      setRegistrations(registrationRows);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not load baptism information.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeEvents = useMemo(
    () => events.filter((e) => (showArchived ? true : !e.archivedAt)),
    [events, showArchived]
  );
  const scheduledEvents = useMemo(
    () => activeEvents.filter((e) => e.status === 'Scheduled'),
    [activeEvents]
  );
  const nextEvent = useMemo(() => scheduledEvents[0] ?? null, [scheduledEvents]);

  const registered = useMemo(
    () => registrations.filter((r) => r.status === 'Registered'),
    [registrations]
  );
  const baptized = useMemo(
    () => registrations.filter((r) => r.status === 'Baptized'),
    [registrations]
  );
  const registeredByEvent = useMemo(() => {
    const map: Record<string, Registration[]> = {};
    for (const r of registered) {
      (map[r.eventId] ??= []).push(r);
    }
    return map;
  }, [registered]);

  function valuesFor(templateBody: string, person: Named) {
    const first = templateBody.includes('{name}')
      ? person.firstName
      : displayName(person);
    return {
      name: first,
      date: nextEvent ? fmtDateFull(nextEvent.eventDate) : '',
      time: nextEvent?.eventTime ? fmtTime(nextEvent.eventTime) : '',
      venue: nextEvent ? venueLabel(nextEvent.venue) : '',
      volunteer: member?.full_name ?? 'Pastor',
    };
  }

  async function prepareReminder(person: BaptismRegistrationPerson | Candidate) {
    const template = await fetchTemplate('baptism_reminder');
    const body = template ? fillTemplate(template.body, valuesFor(template.body, person)) : '';
    if (!template) {
      toast.info('No baptism reminder template is set up.');
      return;
    }
    setCompose({ person: messageRecipient(person), body });
  }

  function openNew() {
    setEdit({
      id: null,
      date: nextSundayISO(),
      time: '10:00',
      venue: CHURCH_NAME,
      notes: '',
      status: 'Scheduled',
    });
  }

  function openEdit(event: BaptismEvent) {
    setEdit({
      id: event.id,
      date: event.eventDate,
      time: event.eventTime ?? '',
      venue: event.venue ?? '',
      notes: event.notes ?? '',
      status: event.status,
    });
  }

  async function saveEdit() {
    if (!edit) return;
    if (!edit.date) {
      toast.error('Pick a date');
      return;
    }
    setSavingEdit(true);
    const payload = {
      eventDate: edit.date,
      eventTime: edit.time || null,
      venue: edit.venue.trim() || null,
      notes: edit.notes.trim() || null,
      status: edit.status,
    };
    try {
      if (edit.id) await updateBaptismEvent(edit.id, payload);
      else await createBaptismEvent(payload);
      toast.success(edit.id ? 'Service updated' : 'Service scheduled');
      setEdit(null);
      void load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save service.');
    } finally {
      setSavingEdit(false);
    }
  }

  async function toggleArchive(event: BaptismEvent) {
    const archivedAt = event.archivedAt ? null : new Date().toISOString();
    try {
      await archiveBaptismEvent(event.id, archivedAt);
      toast.success(archivedAt ? 'Service archived' : 'Service restored');
      void load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update service.');
    }
  }

  function openDelete(event: BaptismEvent) {
    const regs = registeredByEvent[event.id] ?? [];
    const bap = baptized.filter((r) => r.eventId === event.id).length;
    setDeleteCounts({ registered: regs.length, baptized: bap });
    setDeleteConfirm('');
    setDeleteEvent(event);
  }

  async function confirmDelete() {
    if (!deleteEvent) return;
    setDeleting(true);
    try {
      await deleteBaptismEvent(deleteEvent.id);
      toast.success('Service deleted');
      setDeleteEvent(null);
      void load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete service.');
    } finally {
      setDeleting(false);
    }
  }

  async function markDone(event: BaptismEvent) {
    try {
      await markBaptismEventDone(event.id);
      toast.success('Service marked done; registered people marked baptized');
      setMarkDoneFor(null);
      void load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not mark service done.');
    }
  }

  async function unregister(reg: Registration) {
    try {
      await unregisterFromBaptism(reg.id);
      toast.success(`${displayName(reg.person)} removed`);
      void load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not unregister person.');
    }
  }

  async function register(row: Candidate) {
    if (!registerEvent) {
      toast.error('Choose a service');
      return;
    }
    setSavingRegister(true);
    try {
      await registerForBaptism({ eventId: registerEvent, personId: row.id });
      toast.success(`${row.firstName} added to the service`);
      setRegisterFor(null);
      setRegisterEvent('');
      void load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not register person.');
    } finally {
      setSavingRegister(false);
    }
  }

  const scheduledCount = registered.length;
  const baptizedCount = baptized.length;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-4 sm:px-6">
      <ScreenHeader
        title="Baptism"
        sub="Who needs baptism, and when"
        action={
          canWrite ? (
            <Button variant="outline" onClick={openNew}>
              <CalendarPlus className="size-4" />
              New service
            </Button>
          ) : undefined
        }
      />

      <Tabs value={tab} onValueChange={setTab} className="gap-4">
        <TabsList className="h-auto! w-full flex-wrap justify-start gap-1 group-data-horizontal/tabs:h-auto! [&_[data-slot=tabs-trigger]]:h-8 sm:w-fit">
          <TabsTrigger value="candidates">
            Needs baptism
            <Badge variant="secondary">{candidates.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="scheduled">
            Scheduled
            <Badge variant="secondary">{scheduledCount}</Badge>
          </TabsTrigger>
          <TabsTrigger value="baptized">
            Baptized
            <Badge variant="secondary">{baptizedCount}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="candidates">
          {loading ? (
            <Centered />
          ) : candidates.length === 0 ? (
            <EmptyBlock title="No baptism candidates" body="People flagged as needing baptism appear here." />
          ) : (
            <div className="min-w-0 overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Phone</th>
                    <th className="px-3 py-2 font-medium">Address</th>
                    <th className="px-3 py-2 font-medium">M1</th>
                    <th className="px-3 py-2 font-medium">Prefers</th>
                    <th className="px-3 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((row) => {
                    const issued = row.m1CompletedAt;
                    return (
                      <tr key={row.id} className="border-t">
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <Avatar size="sm">
                              <AvatarFallback>{initials(row.firstName, row.lastName)}</AvatarFallback>
                            </Avatar>
                            <span className="font-medium">{displayName(row)}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{row.phone || '—'}</td>
                        <td className="truncate px-3 py-2 text-muted-foreground">
                          {[row.addressDetails, row.location].filter(Boolean).join(', ') || '—'}
                        </td>
                        <td className="px-3 py-2">
                          {issued ? (
                            <Badge
                              variant="outline"
                              className="border-green-500/40 bg-green-500/10 text-green-700"
                            >
                              {fmtDate(issued)}
                            </Badge>
                          ) : (
                            <Badge variant="outline">Not in M1</Badge>
                          )}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{row.contactPreference || '—'}</td>
                        <td className="px-3 py-2">
                          {isLeader && (
                            <div className="flex justify-end gap-2">
                              <Button size="sm" variant="outline" onClick={() => prepareReminder(row)}>
                                <Send className="size-3.5" />
                                Remind
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => {
                                  setRegisterFor(row);
                                  setRegisterEvent(nextEvent?.id ?? '');
                                }}
                              >
                                Register
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="scheduled" className="space-y-4">
          <ServicesStrip
            events={activeEvents}
            totalCount={events.length}
            anyArchived={events.some((e) => e.archivedAt)}
            registeredByEvent={registeredByEvent}
            isAdmin={isAdmin}
            isLeader={isLeader}
            canWrite={canWrite}
            showArchived={showArchived}
            onToggleArchived={setShowArchived}
            onEdit={openEdit}
            onArchive={toggleArchive}
            onDelete={openDelete}
            onMarkDone={setMarkDoneFor}
          />
          {loading ? (
            <Centered />
          ) : scheduledEvents.filter((e) => (registeredByEvent[e.id] ?? []).length > 0).length === 0 ? (
            <EmptyBlock title="No one scheduled" body="Register candidates from the Needs baptism tab." />
          ) : (
            <div className="space-y-4">
              {scheduledEvents.map((event) => {
                const group = registeredByEvent[event.id] ?? [];
                if (group.length === 0) return null;
                return (
                  <div key={event.id} className="rounded-lg border">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
                      <div>
                        <p className="text-sm font-medium">
                          {fmtDateFull(event.eventDate)}
                          {event.eventTime && ` · ${fmtTime(event.eventTime)}`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {venueLabel(event.venue)} · {group.length}{' '}
                          {group.length === 1 ? 'person' : 'people'}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => setRemindEvent(event)}>
                          <Send className="size-3.5" />
                          Send reminder to all
                        </Button>
                        {canWrite && (
                          <Button size="sm" variant="outline" onClick={() => setMarkDoneFor(event)}>
                            Mark attended
                          </Button>
                        )}
                      </div>
                    </div>
                    <ul>
                      {group.map((reg) => (
                        <li
                          key={reg.id}
                          className="flex items-center justify-between gap-2 border-t px-3 py-2 first:border-t-0"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <Avatar size="sm">
                              <AvatarFallback>
                                {initials(reg.person.firstName, reg.person.lastName)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="truncate text-sm font-medium">
                              {displayName(reg.person)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary">Registered</Badge>
                            {isLeader && (
                              <Button size="sm" variant="ghost" onClick={() => unregister(reg)}>
                                Unregister
                              </Button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="baptized">
          {loading ? (
            <Centered />
          ) : baptized.length === 0 ? (
            <EmptyBlock title="No one baptized yet" body="People marked baptized at a service appear here." />
          ) : (
            <div className="min-w-0 overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Baptized</th>
                    <th className="px-3 py-2 font-medium">Service</th>
                  </tr>
                </thead>
                <tbody>
                  {baptized.map((reg) => {
                    const event = events.find((e) => e.id === reg.eventId);
                    return (
                      <tr key={reg.id} className="border-t">
                        <td className="px-3 py-2 font-medium">
                          <Link
                            to={`/people?person=${reg.personId}`}
                            className="underline-offset-4 hover:underline"
                          >
                            {displayName(reg.person)}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {reg.baptizedAt ? fmtDateFull(reg.baptizedAt.slice(0, 10)) : '—'}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {event ? `${fmtDateFull(event.eventDate)} · ${venueLabel(event.venue)}` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>

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

      <ServiceEditDialog
        edit={edit}
        saving={savingEdit}
        onClose={() => setEdit(null)}
        onChange={setEdit}
        onSave={saveEdit}
      />

      <RegisterDialog
        row={registerFor}
        events={scheduledEvents}
        eventId={registerEvent}
        saving={savingRegister}
        onEvent={setRegisterEvent}
        onClose={() => setRegisterFor(null)}
        onSave={register}
      />

      <SendRemindersDialog
        event={remindEvent}
        roster={remindEvent ? registeredByEvent[remindEvent.id] ?? [] : []}
        onClose={() => setRemindEvent(null)}
      />

      <AlertDialog open={!!markDoneFor} onOpenChange={(open) => !open && setMarkDoneFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark this service done?</AlertDialogTitle>
            <AlertDialogDescription>
              Every registered person will be marked baptized. This sets their baptism status.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => markDoneFor && markDone(markDoneFor)}>
              Mark done
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteEvent} onOpenChange={(open) => !open && setDeleteEvent(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this service?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteEvent && `${fmtDateFull(deleteEvent.eventDate)} has `}
              {deleteCounts?.registered ?? 0} registered and {deleteCounts?.baptized ?? 0} baptized. People are never
              deleted; those not yet baptized go back to Needs baptism.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {(deleteCounts?.registered ?? 0) > 0 && deleteEvent && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                This service has history. Archiving is safer. To delete permanently, type the date below.
              </p>
              <Input
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder={fmtDateFull(deleteEvent.eventDate)}
              />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {deleteEvent && (deleteCounts?.registered ?? 0) > 0 && (
              <Button variant="outline" onClick={() => toggleArchive(deleteEvent).then(() => setDeleteEvent(null))}>
                <Archive className="size-4" />
                Archive instead
              </Button>
            )}
            <Button
              variant="destructive"
              disabled={
                deleting ||
                ((deleteCounts?.registered ?? 0) > 0 &&
                  deleteEvent !== null &&
                  deleteConfirm.trim() !== fmtDateFull(deleteEvent.eventDate))
              }
              onClick={confirmDelete}
            >
              {deleting ? <Spinner className="size-4" /> : <Trash2 className="size-4" />}
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ServicesStrip({
  events,
  totalCount,
  anyArchived,
  registeredByEvent,
  isAdmin,
  isLeader,
  canWrite,
  showArchived,
  onToggleArchived,
  onEdit,
  onArchive,
  onDelete,
  onMarkDone,
}: {
  events: BaptismEvent[];
  totalCount: number;
  anyArchived: boolean;
  registeredByEvent: Record<string, Registration[]>;
  isAdmin: boolean;
  isLeader: boolean;
  canWrite: boolean;
  showArchived: boolean;
  onToggleArchived: (v: boolean) => void;
  onEdit: (e: BaptismEvent) => void;
  onArchive: (e: BaptismEvent) => void;
  onDelete: (e: BaptismEvent) => void;
  onMarkDone: (e: BaptismEvent) => void;
}) {
  if (totalCount === 0) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">Services</h2>
        {anyArchived && (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Checkbox checked={showArchived} onCheckedChange={(v) => onToggleArchived(v === true)} />
            Show archived
          </label>
        )}
      </div>
      {events.length === 0 ? (
        <p className="rounded-lg border px-3 py-4 text-sm text-muted-foreground">
          All services are archived. Tick “Show archived” to see them.
        </p>
      ) : (
      <div className="grid gap-1.5 sm:grid-cols-2">
        {events.map((event) => (
          <div
            key={event.id}
            className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {fmtDateFull(event.eventDate)}
                {event.eventTime && ` · ${fmtTime(event.eventTime)}`}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {venueLabel(event.venue)} · {(registeredByEvent[event.id] ?? []).length}{' '}
                {(registeredByEvent[event.id] ?? []).length === 1 ? 'person' : 'people'}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {event.archivedAt && <Badge variant="outline">Archived</Badge>}
              {event.status === 'Done' && !event.archivedAt && <Badge variant="outline">Done</Badge>}
              {canWrite && event.status === 'Scheduled' && (
                <Button size="xs" variant="outline" onClick={() => onMarkDone(event)}>
                  Mark done
                </Button>
              )}
              {isLeader && (
                <Button size="xs" variant="ghost" onClick={() => onEdit(event)} aria-label="Edit service">
                  <Pencil className="size-3.5" />
                </Button>
              )}
              {isLeader && (
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => onArchive(event)}
                  aria-label={event.archivedAt ? 'Restore service' : 'Archive service'}
                >
                  {event.archivedAt ? (
                    <ArchiveRestore className="size-3.5" />
                  ) : (
                    <Archive className="size-3.5" />
                  )}
                </Button>
              )}
              {isAdmin && (
                <Button size="xs" variant="ghost" onClick={() => onDelete(event)} aria-label="Delete service">
                  <Trash2 className="size-3.5" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
      )}
    </div>
  );
}

function ServiceEditDialog({
  edit,
  saving,
  onClose,
  onChange,
  onSave,
}: {
  edit: EditState | null;
  saving: boolean;
  onClose: () => void;
  onChange: (e: EditState) => void;
  onSave: () => void;
}) {
  return (
    <Dialog open={!!edit} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {edit && (
          <>
            <DialogHeader>
              <DialogTitle>{edit.id ? 'Edit service' : 'New baptism service'}</DialogTitle>
              <DialogDescription>
                {edit.id
                  ? 'Update the date, time, venue or notes for this service.'
                  : 'Schedule the next date people can be baptized.'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="be-date">Date</Label>
                  <Input
                    id="be-date"
                    type="date"
                    value={edit.date}
                    onChange={(e) => onChange({ ...edit, date: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="be-time">Time</Label>
                  <Input
                    id="be-time"
                    type="time"
                    value={edit.time}
                    onChange={(e) => onChange({ ...edit, time: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="be-venue">Venue</Label>
                <Input
                  id="be-venue"
                  value={edit.venue}
                  onChange={(e) => onChange({ ...edit, venue: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="be-notes">Notes</Label>
                <Textarea
                  id="be-notes"
                  value={edit.notes}
                  onChange={(e) => onChange({ ...edit, notes: e.target.value })}
                  placeholder="Anything the team should know"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={onSave} disabled={!edit.date || saving}>
                {saving ? <Spinner className="size-4" /> : null}
                {edit.id ? 'Save changes' : 'Schedule'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RegisterDialog({
  row,
  events,
  eventId,
  saving,
  onEvent,
  onClose,
  onSave,
}: {
  row: Candidate | null;
  events: BaptismEvent[];
  eventId: string;
  saving: boolean;
  onEvent: (v: string) => void;
  onClose: () => void;
  onSave: (row: Candidate) => void;
}) {
  return (
    <Dialog open={!!row} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {row && (
          <>
            <DialogHeader>
              <DialogTitle>Register {row.firstName}</DialogTitle>
              <DialogDescription>Choose the service and add a note if needed.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Service</Label>
                {events.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Create a service first.</p>
                ) : (
                  <Select
                    items={events.map((e) => ({ value: e.id, label: fmtDateFull(e.eventDate) }))}
                    value={eventId || undefined}
                    onValueChange={(v) => v && onEvent(v)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choose a service" />
                    </SelectTrigger>
                    <SelectContent>
                      {events.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {fmtDateFull(e.eventDate)}
                          {e.eventTime ? ` · ${fmtTime(e.eventTime)}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={() => onSave(row)} disabled={!eventId || saving}>
                {saving ? <Spinner className="size-4" /> : null}
                Register
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SendRemindersDialog({
  event,
  roster,
  onClose,
}: {
  event: BaptismEvent | null;
  roster: Registration[];
  onClose: () => void;
}) {
  const member = useShellMember();
  const [template, setTemplate] = useState<{ name: string; body: string } | null>(null);
  const [sent, setSent] = useState<Record<string, boolean>>({});
  const [sending, setSending] = useState<string | null>(null);

  useEffect(() => {
    if (!event) return;
    let cancelled = false;
    void fetchTemplate('baptism_reminder').then((t) => {
      if (!cancelled && t) setTemplate({ name: t.name, body: t.body });
    });
    return () => {
      cancelled = true;
    };
  }, [event]);

  async function send(reg: Registration) {
    const person = reg.person;
    if (!template) return;
    const recipient = messageRecipient(person);
    const channel = pickChannel(recipient);
    if (!channel || channel === 'Call') {
      toast.error(`No WhatsApp, email or SMS contact for ${person.firstName}`);
      return;
    }
    const body = fillTemplate(template.body, {
      name: template.body.includes('{name}') ? person.firstName : displayName(person),
      date: event ? fmtDateFull(event.eventDate) : '',
      time: event?.eventTime ? fmtTime(event.eventTime) : '',
      venue: event ? venueLabel(event.venue) : '',
      volunteer: member?.full_name ?? 'Pastor',
    });
    const href = messageHref(channel, recipient, { subject: template.name, body });
    if (!href) {
      toast.error(`No ${channel} contact on file`);
      return;
    }
    window.open(href, '_blank', 'noopener');
    setSending(reg.id);
    let failed = false;
    try {
      await logM1Message({
        personId: reg.personId,
        classId: null,
        sessionId: null,
        purpose: 'baptism',
        channel,
      });
    } catch (error) {
      failed = true;
      toast.error(error instanceof Error ? error.message : 'Could not log message.');
    }
    setSending(null);
    setSent((prev) => ({ ...prev, [reg.id]: true }));
    if (failed) {
      toast.info(`${displayName(person)}: opened in ${channel}`);
      return;
    }
    toast.success(`${displayName(person)}: opened in ${channel}`);
  }

  return (
    <Dialog open={!!event} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Send baptism reminder</DialogTitle>
          <DialogDescription>
            {event ? `${fmtDateFull(event.eventDate)} · ${venueLabel(event.venue)}` : ''}
          </DialogDescription>
        </DialogHeader>
        {roster.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No one is registered yet.</p>
        ) : (
          <div className="flex max-h-[50dvh] flex-col gap-1.5 overflow-y-auto">
            {roster.map((reg) => {
              const recipient = messageRecipient(reg.person);
              const channel = pickChannel(recipient);
              return (
                <div key={reg.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {displayName(reg.person)}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{channel ?? 'No contact'}</p>
                  </div>
                  {sent[reg.id] ? (
                    <Badge variant="outline" className="border-green-500/40 bg-green-500/10 text-green-700">
                      Sent
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!channel || channel === 'Call' || sending === reg.id || !template}
                      onClick={() => send(reg)}
                    >
                      {sending === reg.id ? <Spinner className="size-4" /> : null}
                      Send
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Centered() {
  return (
    <div className="flex justify-center py-10">
      <Spinner />
    </div>
  );
}

function EmptyBlock({ title, body }: { title: string; body: string }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Droplets />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
      </EmptyHeader>
      <EmptyContent>
        <EmptyDescription>{body}</EmptyDescription>
      </EmptyContent>
    </Empty>
  );
}
