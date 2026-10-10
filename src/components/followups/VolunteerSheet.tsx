import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { UserPlus } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { rlsErrorMessage } from '@/lib/rls-error';
import { daysSince, relativeDays } from '@/lib/dates';
import { cn } from '@/lib/utils';
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
import type { Person } from '@/components/people/columns';
import PersonDetailDrawer from '@/components/people/PersonDetailDrawer';
import type { OverviewRow } from './VolunteersTab';

interface VolSheetRow extends Person {
  assigned_by_name: string | null;
  assigned_at: string | null;
}

interface RawRow {
  assigned_to_name: { full_name: string } | null;
  registered_by_name: { full_name: string } | null;
  assigned_by_name: { full_name: string } | null;
  [key: string]: unknown;
}

function mapRow(raw: RawRow): VolSheetRow {
  return {
    ...(raw as unknown as Person),
    assigned_to_name: raw.assigned_to_name?.full_name ?? null,
    registered_by_name: raw.registered_by_name?.full_name ?? null,
    assigned_by_name: raw.assigned_by_name?.full_name ?? null,
    assigned_at: (raw.assigned_at as string | null) ?? null,
  };
}

function fetchAssigned(supabase: SupabaseClient, teamId: string) {
  return supabase
    .from('people')
    .select(
      '*, assigned_to_name:team_members!people_assigned_to_fkey(full_name), registered_by_name:team_members!people_registered_by_fkey(full_name), assigned_by_name:team_members!people_assigned_by_fkey(full_name)'
    )
    .eq('assigned_to', teamId)
    .neq('follow_up_status', 'Completed')
    .order('first_name', { ascending: true });
}

function shortDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
    new Date(iso)
  );
}

function initialsOf(p: Person): string {
  return `${p.first_name[0] ?? ''}${p.last_name[0] ?? ''}`.toUpperCase();
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
  const supabase = createClient();
  const [people, setPeople] = useState<VolSheetRow[] | null>(null);
  const [teamOptions, setTeamOptions] = useState<{ id: string; full_name: string }[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [detailPerson, setDetailPerson] = useState<Person | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const teamId = team?.team_member_id ?? '';

  const load = useCallback(async () => {
    if (!teamId) return;
    const [peopleRes, teamRes] = await Promise.all([
      fetchAssigned(supabase, teamId),
      supabase
        .from('team_members')
        .select('id, full_name')
        .in('role', ['Admin', 'Follow-up Coordinator', 'Pastor'])
        .order('full_name', { ascending: true }),
    ]);
    if (peopleRes.error) {
      toast.error(rlsErrorMessage(peopleRes.error));
      setPeople([]);
    } else {
      setPeople((peopleRes.data ?? []).map((r) => mapRow(r as unknown as RawRow)));
    }
    if (!teamRes.error && teamRes.data) setTeamOptions(teamRes.data);
  }, [supabase, teamId]);

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
    const { error } = await supabase
      .from('people')
      .update({ assigned_to: targetTeamId })
      .in('id', [...selected]);
    setBusy(false);
    if (error) {
      toast.error(rlsErrorMessage(error));
      return;
    }
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
                          {initialsOf(p)}
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
              <Select value="" onValueChange={(v) => v && void reassign(v)}>
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
                  {otherVolunteers.map((t) => (
                    <SelectItem key={t.id} value={t.id} className="text-base">
                      {t.full_name}
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
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [unassigned, setUnassigned] = useState<Person[] | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('people')
      .select('id, first_name, last_name, category')
      .is('assigned_to', null)
      .neq('follow_up_status', 'Completed')
      .order('first_name', { ascending: true });
    if (error) {
      toast.error(rlsErrorMessage(error));
      setUnassigned([]);
      return;
    }
    setUnassigned((data ?? []) as unknown as Person[]);
  }, [supabase]);

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
    const { error } = await supabase
      .from('people')
      .update({ assigned_to: teamId })
      .in('id', [...chosen]);
    setBusy(false);
    if (error) {
      toast.error(rlsErrorMessage(error));
      return;
    }
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
