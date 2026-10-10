import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ScreenHeader from '@/components/layout/ScreenHeader';
import { useShellMember } from '@/components/layout/shell';
import { useIsMobile } from '@/lib/use-is-mobile';
import { rlsErrorMessage } from '@/lib/rls-error';
import { toast } from 'sonner';
import { categories, followUpStatuses } from '../people/constants';
import type { Person } from '../people/columns';
import { BoardColumn } from './BoardColumn';
import { BoardCardBody, PlainCard, type BoardStatus } from './BoardCard';
import PersonDetailDrawer from '../people/PersonDetailDrawer';

interface TeamOption {
  id: string;
  full_name: string;
}

interface BoardRow extends Omit<Person, 'assigned_to_name' | 'registered_by_name'> {
  assigned_to_name: { full_name: string } | null;
  registered_by_name: { full_name: string } | null;
}

function mapRow(row: BoardRow): Person {
  return {
    ...row,
    assigned_to_name: row.assigned_to_name?.full_name ?? null,
    registered_by_name: row.registered_by_name?.full_name ?? null,
  };
}

function fetchBoardPeople(supabase: SupabaseClient) {
  return supabase
    .from('people')
    .select(
      '*, assigned_to_name:team_members!people_assigned_to_fkey(full_name), registered_by_name:team_members!people_registered_by_fkey(full_name)'
    )
    .order('first_name', { ascending: true });
}

function thirtyDaysAgoISO(): string {
  return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
}

function isStatus(value: string): value is BoardStatus {
  return (followUpStatuses as readonly string[]).includes(value);
}

export default function BoardPage() {
  const supabase = createClient();
  const member = useShellMember();
  const isMobile = useIsMobile();

  const [people, setPeople] = useState<Person[] | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamOption[]>([]);
  const [assignedFilter, setAssignedFilter] = useState<string>(() =>
    member?.role === 'Admin' ? 'Everyone' : 'Me'
  );
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [activeStatus, setActiveStatus] = useState<BoardStatus>('Not Started');
  const [detailPerson, setDetailPerson] = useState<Person | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [activePerson, setActivePerson] = useState<Person | null>(null);

  useEffect(() => {
    let active = false;
    async function load() {
      const { data, error } = await fetchBoardPeople(supabase);
      if (active) return;
      if (error) {
        toast.error(rlsErrorMessage(error));
        setPeople([]);
        return;
      }
      setPeople((data ?? []).map((r) => mapRow(r as BoardRow)));
    }
    async function loadTeam() {
      const { data, error } = await supabase
        .from('team_members')
        .select('id, full_name')
        .order('full_name', { ascending: true });
      if (active) return;
      if (!error && data) setTeamMembers(data);
    }
    load();
    loadTeam();
    return () => {
      active = true;
    };
  }, [supabase]);

  const groups = useMemo(() => {
    const result: Record<BoardStatus, Person[]> = {
      'Not Started': [],
      Contacted: [],
      Met: [],
      Ongoing: [],
      Completed: [],
    };
    const cutoff = thirtyDaysAgoISO();
    for (const p of people ?? []) {
      if (categoryFilter !== 'All' && p.category !== categoryFilter) continue;
      if (assignedFilter === 'Me') {
        if (p.assigned_to !== member?.id) continue;
      } else if (assignedFilter === 'Unassigned') {
        if (p.assigned_to) continue;
      } else if (assignedFilter !== 'Everyone') {
        if (p.assigned_to !== assignedFilter) continue;
      }
      const status = isStatus(p.follow_up_status) ? p.follow_up_status : 'Not Started';
      if (status === 'Completed' && p.updated_at && p.updated_at < cutoff) continue;
      result[status].push(p);
    }
    return result;
  }, [people, categoryFilter, assignedFilter, member]);

  const movePerson = useCallback(
    async (person: Person, to: BoardStatus) => {
      const from = isStatus(person.follow_up_status) ? person.follow_up_status : 'Not Started';
      if (from === to || movingId === person.id) return;
      setMovingId(person.id);
      const previous = people;
      setPeople((prev) =>
        prev ? prev.map((p) => (p.id === person.id ? { ...p, follow_up_status: to } : p)) : prev
      );
      const { error } = await supabase
        .from('people')
        .update({ follow_up_status: to })
        .eq('id', person.id);
      setMovingId(null);
      if (error) {
        toast.error(rlsErrorMessage(error));
        if (previous) setPeople(previous);
      }
    },
    [supabase, movingId, people]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  function columnOf(id: string): BoardStatus | null {
    if (isStatus(id)) return id;
    for (const s of followUpStatuses) {
      if (groups[s].some((p) => p.id === id)) return s;
    }
    return null;
  }

  function handleDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    setActivePerson((people ?? []).find((p) => p.id === id) ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActivePerson(null);
    if (!event.over) return;
    const id = String(event.active.id);
    const from = columnOf(id);
    const to = columnOf(String(event.over.id));
    const person = (people ?? []).find((p) => p.id === id);
    if (from && to && from !== to && person) void movePerson(person, to);
  }

  function handleDragCancel() {
    setActivePerson(null);
  }

  function openDetail(person: Person) {
    setDetailPerson(person);
    setDetailOpen(true);
  }

  function handleUpdated(updated: Person) {
    setPeople((prev) =>
      prev ? prev.map((p) => (p.id === updated.id ? updated : p)) : prev
    );
    setDetailPerson(updated);
  }

  function handleDeleted(id: string) {
    setPeople((prev) => (prev ? prev.filter((p) => p.id !== id) : prev));
    setDetailOpen(false);
    setDetailPerson(null);
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <ScreenHeader
        title="Follow-up Board"
        sub="Drag a card to change status, or use the ⋯ menu on a phone."
      />

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">Assigned to</span>
        <Select value={assignedFilter} onValueChange={(v) => setAssignedFilter(v ?? 'Everyone')}>
          <SelectTrigger className="h-10 w-auto min-w-36">
            <SelectValue placeholder="Assigned to" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Everyone">Everyone</SelectItem>
            <SelectItem value="Me">Me</SelectItem>
            <SelectItem value="Unassigned">Unassigned</SelectItem>
            {teamMembers.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="ml-2 text-sm font-medium text-muted-foreground">Category</span>
        <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v ?? 'All')}>
          <SelectTrigger className="h-10 w-auto min-w-36">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {people === null ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full rounded-xl" />
          ))}
        </div>
      ) : isMobile ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <Tabs
            value={activeStatus}
            onValueChange={(v) => setActiveStatus((v ?? 'Not Started') as BoardStatus)}
            className="w-full"
          >
            <div className="-mx-4 px-4">
              <TabsList
                variant="line"
                className="h-11 w-full justify-start gap-1 overflow-x-auto bg-transparent"
              >
                {followUpStatuses.map((s) => (
                  <TabsTrigger key={s} value={s} className="text-muted-foreground">
                    {s}
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium tabular-nums">
                      {groups[s].length}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            {followUpStatuses.map((s) => (
              <TabsContent key={s} value={s} className="mt-3">
                {s === 'Completed' && (
                  <p className="mb-2 px-1 text-xs text-muted-foreground">Last 30 days only</p>
                )}
                {groups[s].length === 0 ? (
                  <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                    Nothing here yet
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 pb-2">
                    {groups[s].map((p) => (
                      <PlainCard
                        key={p.id}
                        person={p}
                        onOpen={openDetail}
                        onMoveTo={(to) => void movePerson(p, to)}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div className="flex shrink-0 gap-3 overflow-x-auto pb-1">
            {followUpStatuses.map((s) => (
              <BoardColumn
                key={s}
                status={s}
                cards={groups[s]}
                onOpen={openDetail}
                onMoveTo={(p, to) => void movePerson(p, to)}
              />
            ))}
          </div>
          <DragOverlay
            dropAnimation={{ duration: 250, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}
          >
            {activePerson ? (
              <div className="w-[270px] rotate-2 cursor-grabbing rounded-xl border bg-card p-3 shadow-2xl ring-2 ring-ring/30">
                <BoardCardBody person={activePerson} onMoveTo={() => {}} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      <PersonDetailDrawer
        person={detailPerson}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onUpdated={handleUpdated}
        onDeleted={handleDeleted}
      />
    </div>
  );
}