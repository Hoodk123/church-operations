import { useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Trash2, Pin } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
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
import ScreenHeader from '@/components/layout/ScreenHeader';
import { useShellMember } from '@/components/layout/shell';
import { rlsErrorMessage } from '@/lib/rls-error';
import { todayISO } from '@/lib/dates';
import { categoryColors, needsPastorColor } from '../people/constants';

interface PersonRef {
  id: string;
  first_name: string;
  last_name: string;
  category: string;
  needs_pastor: boolean;
  location: string | null;
}

interface TodayRow {
  id: string;
  checked_in_at: string;
  checked_in_by: { full_name: string }[] | { full_name: string } | null;
  person: PersonRef[] | PersonRef | null;
}

function rowPerson(row: TodayRow) {
  return Array.isArray(row.person) ? row.person[0] : row.person;
}

function rowChecker(row: TodayRow) {
  return Array.isArray(row.checked_in_by) ? row.checked_in_by[0] : row.checked_in_by;
}

function getInitials(first: string, last: string): string {
  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase();
}

function countClasses(category: string): string {
  return categoryColors[category] ?? 'bg-neutral-100 text-neutral-800 border-neutral-200 dark:bg-neutral-900/30 dark:text-neutral-400 dark:border-neutral-800';
}

export default function TodayAttendancePage() {
  const supabase = createClient();
  const member = useShellMember();
  const isAdmin = member?.role === 'Admin';

  const [rows, setRows] = useState<TodayRow[] | null>(null);

  const today = todayISO();

  useEffect(() => {
    let active = false;
    async function load() {
      const { data, error } = await supabase
        .from('attendance')
        .select(
          'id, checked_in_at, checked_in_by:team_members(full_name), person:people!attendance_person_id_fkey(id, first_name, last_name, category, needs_pastor, location)'
        )
        .eq('service_date', today)
        .order('checked_in_at', { ascending: false });
      if (active) return;
      if (error) {
        toast.error(rlsErrorMessage(error));
        setRows([]);
        return;
      }
      setRows(data ?? []);
    }
    load();
    return () => {
      active = true;
    };
  }, [supabase, today]);

  async function removeRow(rowId: string) {
    const { error } = await supabase.from('attendance').delete().eq('id', rowId);
    if (error) {
      toast.error(rlsErrorMessage(error));
      return;
    }
    setRows((prev) => (prev ? prev.filter((r) => r.id !== rowId) : prev));
    toast.success('Check-in removed');
  }

  const counts = {
    total: rows?.length ?? 0,
    visitors: rows?.filter((r) => rowPerson(r)?.category === 'Visitor').length ?? 0,
    newConverts: rows?.filter((r) => rowPerson(r)?.category === 'New Convert').length ?? 0,
    members: rows?.filter((r) => rowPerson(r)?.category === 'Member').length ?? 0,
  };

  const statCards = [
    { label: 'Total', value: counts.total },
    { label: 'Visitors', value: counts.visitors },
    { label: 'New Converts', value: counts.newConverts },
    { label: 'Members', value: counts.members },
  ];

  return (
    <div className="flex h-full flex-col gap-4">
      <ScreenHeader title="Today's Attendance" sub="Who checked in at today's service." />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {statCards.map((c) => (
          <div key={c.label} className="rounded-xl border bg-card p-3">
            <p className="text-[11px] text-muted-foreground">{c.label}</p>
            <p className="text-2xl font-semibold tabular-nums">{c.value}</p>
          </div>
        ))}
      </div>

      {rows === null ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nobody has checked in yet today.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((row) => {
            const person = rowPerson(row);
            const time = new Intl.DateTimeFormat('en-US', {
              hour: 'numeric',
              minute: '2-digit',
            }).format(new Date(row.checked_in_at));
            return (
              <div
                key={row.id}
                className="flex items-center gap-3 rounded-xl border bg-card p-3"
              >
                <Avatar>
                  <AvatarFallback>
                    {person ? getInitials(person.first_name, person.last_name) : '?'}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-medium">
                      {person
                        ? `${person.first_name} ${person.last_name}`
                        : 'Person removed'}
                    </span>
                    {person && (
                      <>
                        <Badge
                          variant="outline"
                          className={countClasses(person.category)}
                        >
                          {person.category}
                        </Badge>
                        {person.needs_pastor && (
                          <Badge variant="outline" className={needsPastorColor}>
                            Pastor
                          </Badge>
                        )}
                      </>
                    )}
                  </div>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <Pin className="size-3 shrink-0" />
                    {person?.location ?? '—'} · Checked in at {time} by{' '}
                    {rowChecker(row)?.full_name ?? 'someone'}
                  </p>
                </div>
                {isAdmin && (
                  <RemoveCheckInButton onRemove={() => void removeRow(row.id)}>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Remove check-in"
                      className="shrink-0 cursor-pointer text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </RemoveCheckInButton>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RemoveCheckInButton({
  children,
  onRemove,
}: {
  children: ReactNode;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <span onClick={() => setOpen(true)}>{children}</span>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this check-in?</AlertDialogTitle>
            <AlertDialogDescription>
              The person can check in again if they were added by mistake.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onRemove}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}