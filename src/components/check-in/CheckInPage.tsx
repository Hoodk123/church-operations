import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, MapPin, Plus, Search } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { todayISO } from '@/lib/dates';
import { rlsErrorMessage } from '@/lib/rls-error';
import { useShellMember } from '@/components/layout/shell';
import ScreenHeader from '@/components/layout/ScreenHeader';
import NewVisitorDrawer from './NewVisitorDrawer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
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
import { categoryColors } from '@/components/people/constants';
import { MarkNewConvertButton } from '@/components/people/MarkNewConvertButton';

interface SearchPerson {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  category: string | null;
  location: string | null;
}

function getInitials(first: string, last: string): string {
  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase();
}

export default function CheckInPage() {
  const member = useShellMember();
  const supabase = createClient();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchPerson[]>([]);
  const [searching, setSearching] = useState(false);
  const [checkedIn, setCheckedIn] = useState<Set<string>>(new Set());
  const [todayCount, setTodayCount] = useState(0);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const serviceLabel = `Sunday Service · ${new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  })}`;

  const loadAttendance = useCallback(async () => {
    const today = todayISO();
    const [rows, countRes] = await Promise.all([
      supabase.from('attendance').select('person_id').eq('service_date', today),
      supabase
        .from('attendance')
        .select('*', { count: 'exact', head: true })
        .eq('service_date', today),
    ]);
    return {
      ids: (rows.data ?? []).map((r) => r.person_id as string),
      count: countRes.count ?? 0,
    };
  }, [supabase]);

  const refreshAttendance = useCallback(async () => {
    const { ids, count } = await loadAttendance();
    setCheckedIn(new Set(ids));
    setTodayCount(count);
  }, [loadAttendance]);

  useEffect(() => {
    let active = false;
    async function load() {
      const { ids, count } = await loadAttendance();
      if (active) return;
      setCheckedIn(new Set(ids));
      setTodayCount(count);
    }
    load();
    return () => {
      active = true;
    };
  }, [loadAttendance]);

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

  async function handleCheckIn(person: SearchPerson) {
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
    refreshAttendance();
  }

  const isSearching = query.trim().length >= 2;

  return (
    <div className="flex min-h-[calc(100dvh-11rem)] flex-col gap-3">
      <ScreenHeader
        title="Check-in"
        sub={serviceLabel}
        action={
          <Badge variant="secondary" className="shrink-0">
            {todayCount} today
          </Badge>
        }
      />

      {/* Search */}
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

      {/* Results */}
      {isSearching && searching && (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      )}

      {isSearching && !searching && results.length === 0 && (
        <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          No matches for “{query.trim()}”.
        </div>
      )}

      {results.length > 0 && !searching && (
        <div className="flex flex-col gap-2">
          {results.map((person) => {
            const isIn = checkedIn.has(person.id);
            const name = `${person.first_name} ${person.last_name}`;
            return (
              <Item key={person.id} variant="outline">
                <ItemMedia>
                  <Avatar>
                    <AvatarFallback>
                      {getInitials(person.first_name, person.last_name)}
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
                  <div className="flex flex-col items-stretch gap-1.5">
                    {isIn ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled
                        className="cursor-default"
                      >
                        <Check className="size-3.5" />
                        Here
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        disabled={checkingId === person.id}
                        onClick={() => handleCheckIn(person)}
                      >
                        Check in
                      </Button>
                    )}
                    {person.category !== 'New Convert' && (
                      <MarkNewConvertButton
                        person={person}
                        onSaved={() =>
                          setResults((prev) =>
                            prev.map((r) =>
                              r.id === person.id
                                ? { ...r, category: 'New Convert' }
                                : r
                            )
                          )
                        }
                      />
                    )}
                  </div>
                </ItemActions>
              </Item>
            );
          })}
        </div>
      )}

      {/* Helper */}
      <div className="rounded-lg border bg-card p-3 text-center text-[13px] text-muted-foreground">
        Not on the list? Register them below.
      </div>

      {/* New visitor */}
      <div className="mt-auto pt-2">
        <Button
          size="lg"
          className="h-12 w-full text-base"
          onClick={() => setDrawerOpen(true)}
        >
          <Plus className="size-4" />
          New visitor
        </Button>
      </div>

      <NewVisitorDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onCheckedIn={refreshAttendance}
        memberId={member?.id ?? ''}
      />
    </div>
  );
}
