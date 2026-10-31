import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { UserPlus } from 'lucide-react';
import { daysSince, relativeDays } from '@/lib/dates';
import { initials } from '@/lib/names';
import { cn } from '@/lib/utils';
import { type SelectOption } from '@/lib/select-items';
import { bulkAssign, listAllPeople, listTeamMembers } from '@/lib/api/people';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/empty';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  categoryColors,
  contactDotColor,
  followUpStatusColors,
} from '@/components/people/constants';
import { personApiToRow } from '@/components/people/adapt';
import type { Person } from '@/components/people/columns';
import PersonDetailDrawer from '@/components/people/PersonDetailDrawer';
import type { OverviewRow } from './VolunteersTab';

interface VolSheetRow extends Person {
  assigned_by_name: string | null;
  assigned_at: string | null;
}

function toVolSheetRow(raw: Awaited<ReturnType<typeof listAllPeople>>[number]): VolSheetRow {
  return {
    ...personApiToRow(raw),
    assigned_by_name: raw.assignedByName,
    assigned_at: raw.assignedAt,
  };
}

function shortDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
    new Date(iso)
  );
}

interface VolunteerSheetProps {
  team: OverviewRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}

export default function VolunteerSheet({
  team,
  open,
  onOpenChange,
  onChanged,
}: VolunteerSheetProps) {
  const [people, setPeople] = useState<VolSheetRow[] | null>(null);
  const [teamOptions, setTeamOptions] = useState<{ id: string; full_name: string }[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [detailPerson, setDetailPerson] = useState<Person | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const teamId = team?.team_member_id ?? '';

  const load = useCallback(async () => {
    if (!teamId) return;
    try {
      const [assignedPeople, members] = await Promise.all([
        listAllPeople({ assignedTo: teamId, excludeCompleted: true }),
        listTeamMembers(),
      ]);
      setPeople(
        assignedPeople
          .map(toVolSheetRow)
          .sort((a, b) => a.first_name.localeCompare(b.first_name)),
      );
      setTeamOptions(
        members
          .filter((member) => ['Admin', 'Follow-up Coordinator', 'Pastor'].includes(member.role))
          .map((member) => ({ id: member.id, full_name: member.fullName })),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load volunteer details.');
      setPeople([]);
      setTeamOptions([]);
    }
  }, [teamId]);

  useEffect(() => {
    if (!open || !teamId) return;
    async function run() {
      await load();
    }
    void run();
  }, [open, teamId, load]);

  const overdueCount = useMemo(() => {
    const all = people ?? [];
    return all.filter((p) => {
      if (p.follow_up_status === 'Not Started') {
        return p.date_registered ? daysSince(p.date_registered) > 3 : false;
      }
      if (['Contacted', 'Met', 'Ongoing'].includes(p.follow_up_status)) {
        return p.last_contact_date ? daysSince(p.last_contact_date) > 14 : false;
      }
      return false;
    }).length;
  }, [people]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function reassign(targetTeamId: string) {
    if (selected.size === 0 || !targetTeamId) return;
    setBusy(true);
    try {
      await bulkAssign([...selected], targetTeamId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not reassign people.');
      setBusy(false);
      return;
    }
    setBusy(false);
    toast.success(
      `Reassigned ${selected.size} ${selected.size === 1 ? 'person' : 'people'}`
    );
    setSelected(new Set());
    await load();
    onChanged();
  }

  async function handleUpdated(updated: Person) {
    setPeople((prev) =>
      prev ? prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)) : prev
    );
    setDetailPerson(updated);
  }

  async function handleDeleted(id: string) {
    setPeople((prev) => (prev ? prev.filter((p) => p.id !== id) : prev));
    setDetailOpen(false);
    setDetailPerson(null);
    onChanged();
  }

  const otherVolunteers = teamOptions.filter((t) => t.id !== teamId);

  const reassignItems = useMemo<SelectOption[]>(
    () => otherVolunteers.map((t) => ({ value: t.id, label: t.full_name })),
    [otherVolunteers]
  );

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="flex w-full flex-col gap-0 overflow-hidden sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{team?.full_name ?? 'Volunteer'}</SheetTitle>
            <SheetDescription>
              {people?.length ?? team?.assigned ?? 0} people · {overdueCount} overdue
              {team?.role ? ` · ${team.role}` : ''}
            </SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-4">
            {people === null ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-xl" />
                ))}
              </div>
            ) : people.length === 0 ? (
              <Empty className="border">
                <EmptyTitle>No people assigned</EmptyTitle>
                <EmptyDescription>
                  This volunteer has nobody waiting right now.
                </EmptyDescription>
              </Empty>
            ) : (
              <ul className="flex flex-col gap-2 pb-4">
                {people.map((p) => {
                  const days = p.last_contact_date ? daysSince(p.last_contact_date) : null;
                  return (
                    <li
                      key={p.id}
                      className="flex items-start gap-2.5 rounded-xl border bg-card p-3"
                    >
                      <Checkbox
                        checked={selected.has(p.id)}
                        onCheckedChange={() => toggle(p.id)}
                        aria-label={`Select ${p.first_name} ${p.last_name}`}
                        className="mt-0.5 shrink-0"
                      />
                      <Avatar className="size-8">
                        <AvatarFallback className="text-xs">
                          {initials(p.first_name, p.last_name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setDetailPerson(p);
                              setDetailOpen(true);
                            }}
                            className="truncate text-sm font-medium hover:underline"
                          >
                            {p.first_name} {p.last_name}
                          </button>
                          <Badge
                            variant="outline"
                            className={categoryColors[p.category] ?? ''}
                          >
                            {p.category}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={followUpStatusColors[p.follow_up_status] ?? ''}
                          >
                            {p.follow_up_status}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {p.assigned_at
                            ? `Assigned by ${p.assigned_by_name ?? 'someone'} · ${shortDate(p.assigned_at)} (${relativeDays(p.assigned_at)})`
                            : 'Assigned earlier'}
                        </p>
                      </div>
                      <span
                        className={cn('mt-1.5 size-2 shrink-0 rounded-full', contactDotColor(days))}
                        aria-hidden
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex flex-col gap-2 border-t p-4">
            <div className="flex items-center gap-2">
              <Select items={reassignItems} value="" onValueChange={(v) => v && void reassign(v)}>
                <SelectTrigger
                  className="h-10 flex-1 text-base"
                  disabled={busy || selected.size === 0}
                  aria-label="Reassign selected to"
                >
                  <SelectValue
                    placeholder={
                      selected.size === 0
                        ? 'Select people to reassign'
                        : `Reassign ${selected.size} selected…`
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {reassignItems.map((t) => (
                    <SelectItem key={t.value} value={t.value} className="text-base">
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <AssignMoreButton teamId={teamId} onAssigned={() => {
                void load();
                onChanged();
              }} />
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <PersonDetailDrawer
        person={detailPerson}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onUpdated={(p) => void handleUpdated(p)}
        onDeleted={(id) => void handleDeleted(id)}
      />
    </>
  );
}

function AssignMoreButton({
  teamId,
  onAssigned,
}: {
  teamId: string;
  onAssigned: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [unassigned, setUnassigned] = useState<Person[] | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = await listAllPeople({ assignedTo: 'unassigned', excludeCompleted: true });
      setUnassigned(
        rows
          .map(personApiToRow)
          .sort((a, b) => a.first_name.localeCompare(b.first_name)),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load unassigned people.');
      setUnassigned([]);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    async function run() {
      await load();
    }
    void run();
  }, [open, load]);

  async function assign() {
    if (chosen.size === 0) return;
    setBusy(true);
    try {
      await bulkAssign([...chosen], teamId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not assign people.');
      setBusy(false);
      return;
    }
    setBusy(false);
    toast.success(`Assigned ${chosen.size} ${chosen.size === 1 ? 'person' : 'people'}`);
    setOpen(false);
    onAssigned();
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="h-10 shrink-0"
        onClick={() => {
          setChosen(new Set());
          setUnassigned(null);
          setOpen(true);
        }}
      >
        <UserPlus className="size-4" />
        Assign more
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85dvh] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Assign people</DialogTitle>
            <DialogDescription>
              People with no volunteer yet. Pick who this volunteer should take on.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[50dvh] overflow-y-auto">
            {unassigned === null ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full rounded-lg" />
                ))}
              </div>
            ) : unassigned.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Everyone has a volunteer.
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {unassigned.map((p) => (
                  <li key={p.id}>
                    <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border p-2.5">
                      <Checkbox
                        checked={chosen.has(p.id)}
                        onCheckedChange={() =>
                          setChosen((prev) => {
                            const next = new Set(prev);
                            if (next.has(p.id)) next.delete(p.id);
                            else next.add(p.id);
                            return next;
                          })
                        }
                        aria-label={`Select ${p.first_name} ${p.last_name}`}
                      />
                      <span className="text-sm font-medium">
                        {p.first_name} {p.last_name}
                      </span>
                      <Badge
                        variant="outline"
                        className={cn('ml-auto', categoryColors[p.category] ?? '')}
                      >
                        {p.category}
                      </Badge>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={busy || chosen.size === 0}
              onClick={() => void assign()}
            >
              Assign {chosen.size > 0 ? chosen.size : ''}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
