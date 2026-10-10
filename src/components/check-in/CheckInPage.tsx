import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Check, MapPin, Plus, Search } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { todayISO } from '@/lib/dates';
import { initials } from '@/lib/names';
import { rlsErrorMessage } from '@/lib/rls-error';
import { useShellMember } from '@/components/layout/shell';
import ScreenHeader from '@/components/layout/ScreenHeader';
import NewVisitorDrawer from './NewVisitorDrawer';
import { TodaySoFarCard, type TodayCheckIn, type TodayPerson } from './TodaySoFarCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Empty, EmptyTitle } from '@/components/ui/empty';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { categoryColors } from '@/components/people/constants';

interface SearchPerson {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  category: string | null;
  location: string | null;
}

interface AttendanceRaw {
  id: string;
  checked_in_at: string;
  person: TodayPerson | TodayPerson[] | null;
}

interface ExpectedPerson {
  id: string;
  first_name: string;
  last_name: string;
  category: string | null;
  location: string | null;
}

function personOf(row: AttendanceRaw): TodayPerson | null {
  return Array.isArray(row.person) ? (row.person[0] ?? null) : row.person;
}

export default function CheckInPage() {
  const member = useShellMember();
  const supabase = createClient();
  const today = useMemo(() => todayISO(), []);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchPerson[]>([]);
  const [searching, setSearching] = useState(false);
  const [attendance, setAttendance] = useState<AttendanceRaw[] | null>(null);
  const [expected, setExpected] = useState<ExpectedPerson[]>([]);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showAllOpen, setShowAllOpen] = useState(false);

  const canUndo = member?.role === 'Admin' || member?.role === 'Info Desk';

  const serviceLabel = `Sunday Service · ${new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  })}`;

  const checkedInMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of attendance ?? []) {
      const person = personOf(row);
      if (person) map.set(person.id, row.checked_in_at);
    }
    return map;
  }, [attendance]);

  const todayRows: TodayCheckIn[] | null = useMemo(() => {
    if (attendance === null) return null;
    return attendance.map((row) => ({
      id: row.id,
      checkedInAt: row.checked_in_at,
      person: personOf(row),
    }));
  }, [attendance]);

  const loadAttendance = useCallback(async () => {
    const { data, error } = await supabase
      .from('attendance')
      .select(
        'id, checked_in_at, person:people!attendance_person_id_fkey(id, first_name, last_name, category)'
      )
      .eq('service_date', today)
      .order('checked_in_at', { ascending: false });
    if (error) return null;
    return (data ?? []) as AttendanceRaw[];
  }, [supabase, today]);

  const loadExpected = useCallback(async () => {
    const { data, error } = await supabase.rpc('expected_today');
    if (error) return [];
    return (data ?? []) as ExpectedPerson[];
  }, [supabase]);

  const refresh = useCallback(async () => {
    const [rows, exp] = await Promise.all([loadAttendance(), loadExpected()]);
    if (rows) setAttendance(rows);
    setExpected(exp);
  }, [loadAttendance, loadExpected]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const [rows, exp] = await Promise.all([loadAttendance(), loadExpected()]);
      if (!mounted) return;
      if (rows === null) {
        toast.error('Could not load today’s check-ins.');
        setAttendance([]);
      } else {
        setAttendance(rows);
      }
      setExpected(exp);
    }
    load();
    return () => {
      mounted = false;
    };
  }, [loadAttendance, loadExpected]);

  function handleQueryChange(value: string) {
    setQuery(value);
    if (value.trim().length < 2) {
      setResults([]);
      setSearching(false);
    } else {
      setSearching(true);
    }
  }

  // Debounced search: min 2 characters, 250ms pause.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      const safe = q.replace(/[%,()]/g, ' ').trim();
      const { data, error } = await supabase
        .from('people')
        .select('id, first_name, last_name, phone, category, location')
        .or(
          `first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,phone.ilike.%${safe}%`
        )
        .order('first_name', { ascending: true })
        .limit(20);

      if (cancelled) return;
      if (error) {
        toast.error(rlsErrorMessage(error));
      } else {
        setResults(data ?? []);
      }
      setSearching(false);
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, supabase]);

  const checkIn = useCallback(
    async (person: { id: string; first_name: string; last_name: string }) => {
      if (!member) return;
      const name = `${person.first_name} ${person.last_name}`;
      setCheckingId(person.id);

      const { error } = await supabase
        .from('attendance')
        .insert({ person_id: person.id, checked_in_by: member.id });

      setCheckingId(null);

      if (error) {
        if (error.code === '23505') {
          toast.info(`${name} is already checked in today`);
        } else {
          toast.error(rlsErrorMessage(error));
        }
      } else {
        toast.success(`${name} checked in`);
      }
      await refresh();
    },
    [member, supabase, refresh]
  );

  const undo = useCallback(
    async (attendanceId: string) => {
      const { error } = await supabase.from('attendance').delete().eq('id', attendanceId);
      if (error) {
        toast.error(rlsErrorMessage(error));
        return;
      }
      toast.success('Check-in undone');
      await refresh();
    },
    [supabase, refresh]
  );

  const isSearching = query.trim().length >= 2;
  const expectedLeft = expected.filter((p) => !checkedInMap.has(p.id));

  function ExpectedChip({ person }: { person: ExpectedPerson }) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="h-8 cursor-pointer rounded-full"
        disabled={checkingId === person.id}
        onClick={() => void checkIn(person)}
      >
        {person.first_name} {person.last_name}
        {checkingId === person.id ? (
          <Spinner className="size-3.5" />
        ) : (
          <Plus className="size-3.5" />
        )}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-16 md:pb-0">
      <ScreenHeader
        title="Check-in"
        sub={serviceLabel}
        action={
          <Button
            className="hidden md:inline-flex"
            onClick={() => setDrawerOpen(true)}
          >
            <Plus className="size-4" />
            New visitor
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_270px] md:items-start">
        {/* Left column */}
        <div className="flex min-w-0 flex-col gap-3">
          <InputGroup className="h-11">
            <InputGroupAddon align="inline-start">
              <Search className="size-4 text-muted-foreground" />
            </InputGroupAddon>
            <InputGroupInput
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              placeholder="Search name or phone"
              className="text-base"
              autoFocus
              autoComplete="off"
            />
          </InputGroup>

          {isSearching && (
            <p className="text-xs text-muted-foreground">
              {searching
                ? 'Searching...'
                : `${results.length} match${results.length === 1 ? '' : 'es'}`}
            </p>
          )}

          {isSearching && searching && (
            <div className="space-y-2">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          )}

          {isSearching && !searching && results.length === 0 && (
            <Empty className="py-6">
              <EmptyTitle>No matches for “{query.trim()}”.</EmptyTitle>
            </Empty>
          )}

          {results.length > 0 && !searching && (
            <div className="flex flex-col gap-2">
              {results.map((person) => {
                const here = checkedInMap.get(person.id);
                const name = `${person.first_name} ${person.last_name}`;
                return (
                  <Item key={person.id} variant="outline">
                    <ItemMedia>
                      <Avatar>
                        <AvatarFallback>
                          {initials(person.first_name, person.last_name)}
                        </AvatarFallback>
                      </Avatar>
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>{name}</ItemTitle>
                      <ItemDescription className="flex items-center gap-1.5">
                        {person.category && (
                          <Badge
                            variant="outline"
                            className={categoryColors[person.category] ?? ''}
                          >
                            {person.category}
                          </Badge>
                        )}
                        {person.location && (
                          <span className="inline-flex min-w-0 items-center gap-0.5">
                            <MapPin className="size-3 shrink-0" />
                            <span className="truncate">{person.location}</span>
                          </span>
                        )}
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      {here ? (
                        <Badge
                          variant="outline"
                          className="border-green-200 bg-green-100 text-green-800 dark:border-green-800 dark:bg-green-900/30 dark:text-green-400"
                        >
                          <Check className="size-3" />
                          Here{' '}
                          {new Intl.DateTimeFormat('en-GB', {
                            hour: '2-digit',
                            minute: '2-digit',
                          }).format(new Date(here))}
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          disabled={checkingId === person.id}
                          onClick={() => void checkIn(person)}
                        >
                          {checkingId === person.id && <Spinner className="size-4" />}
                          Check in
                        </Button>
                      )}
                    </ItemActions>
                  </Item>
                );
              })}
            </div>
          )}

          {/* Came last Sunday, not here yet */}
          <div className="mt-2 space-y-2">
            <h2 className="text-sm font-medium">Came last Sunday, not here yet</h2>
            {expectedLeft.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Everyone expected is here already.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {expectedLeft.slice(0, 12).map((p) => (
                    <ExpectedChip key={p.id} person={p} />
                  ))}
                </div>
                {expectedLeft.length > 12 && (
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto cursor-pointer px-0"
                    onClick={() => setShowAllOpen(true)}
                  >
                    Show all ({expectedLeft.length})
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="md:sticky md:top-16">
          <TodaySoFarCard rows={todayRows} canUndo={canUndo} onUndo={(id) => void undo(id)} />
        </div>
      </div>

      {/* Mobile fixed action */}
      <div className="fixed inset-x-0 bottom-[4.25rem] z-30 px-4 md:hidden">
        <Button
          size="lg"
          className="h-12 w-full text-base shadow-lg"
          onClick={() => setDrawerOpen(true)}
        >
          <Plus className="size-4" />
          New visitor
        </Button>
      </div>

      <NewVisitorDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onCheckedIn={refresh}
        memberId={member?.id ?? ''}
      />

      <Sheet open={showAllOpen} onOpenChange={setShowAllOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Came last Sunday, not here yet</SheetTitle>
            <SheetDescription>Tap a name to check them in.</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-2 px-4 pb-4">
            {expectedLeft.map((p) => (
              <Item key={p.id} variant="outline">
                <ItemMedia>
                  <Avatar>
                    <AvatarFallback>
                      {initials(p.first_name, p.last_name)}
                    </AvatarFallback>
                  </Avatar>
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>
                    {p.first_name} {p.last_name}
                  </ItemTitle>
                  <ItemDescription>{p.location ?? 'No location'}</ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Button
                    size="sm"
                    disabled={checkingId === p.id}
                    onClick={() => void checkIn(p)}
                  >
                    {checkingId === p.id && <Spinner className="size-4" />}
                    Check in
                  </Button>
                </ItemActions>
              </Item>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
