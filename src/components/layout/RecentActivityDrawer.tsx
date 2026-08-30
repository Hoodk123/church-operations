import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { timeAgo } from '@/lib/time-ago';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

interface ActivityRow {
  id: string;
  first_name: string;
  last_name: string;
  category: string;
  created_at: string;
  updated_at: string;
  registered_by_name: string | null;
}

function isToday(dateStr: string): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function formatDateTime(dateStr: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(dateStr));
}

function getInitials(first: string, last: string): string {
  return (first[0] + last[0]).toUpperCase();
}

interface RecentActivityDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function RecentActivityDrawer({
  open,
  onOpenChange,
}: RecentActivityDrawerProps) {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    supabase
      .from('people')
      .select('id, first_name, last_name, category, created_at, updated_at, registered_by_name:team_members!people_registered_by_fkey(full_name)')
      .order('updated_at', { ascending: false })
      .limit(15)
      .then(({ data }: { data: any[] | null }) => {
        if (cancelled) return;
        if (data) {
          setRows(
            data.map((r: any) => ({
              ...r,
              registered_by_name: r.registered_by_name?.full_name ?? null,
            }))
          );
        }
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [open, supabase]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[380px] sm:w-[420px] p-0">
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle>Recent Activity</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading && (
            <p className="text-sm text-muted-foreground text-center py-8">
              Loading...
            </p>
          )}

          {!loading && rows.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No activity yet.
            </p>
          )}

          {!loading &&
            rows.map((row) => {
              const isRegistration =
                Math.abs(
                  new Date(row.created_at).getTime() -
                    new Date(row.updated_at).getTime()
                ) < 60_000;

              const actionText = isRegistration
                ? `${row.first_name} ${row.last_name} registered as a ${row.category.toLowerCase()}.`
                : `${row.first_name} ${row.last_name}'s record was updated.`;

              return (
                <div
                  key={row.id}
                  className="border rounded-lg p-4 space-y-2"
                >
                  <div className="flex items-start gap-2">
                    <span
                      className={`mt-1 size-2 shrink-0 rounded-full ${
                        isToday(row.updated_at)
                          ? 'bg-green-500'
                          : 'bg-muted-foreground/50'
                      }`}
                    />
                    <p className="text-sm font-medium leading-snug">
                      {actionText}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground pl-4">
                    {formatDateTime(row.updated_at)} ({timeAgo(row.updated_at)})
                  </p>
                  {row.registered_by_name && (
                    <div className="flex items-center gap-1.5 pl-4">
                      <Avatar size="sm">
                        <AvatarFallback className="text-[9px]">
                          {getInitials(
                            row.registered_by_name.split(' ')[0] ?? '',
                            row.registered_by_name.split(' ')[1] ?? ''
                          )}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-xs text-muted-foreground">
                        {row.registered_by_name}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
