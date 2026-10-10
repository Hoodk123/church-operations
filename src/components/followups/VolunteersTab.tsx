import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { rlsErrorMessage } from '@/lib/rls-error';
import { relativeDays } from '@/lib/dates';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import VolunteerSheet from './VolunteerSheet';

export interface OverviewRow {
  team_member_id: string;
  full_name: string;
  role: string;
  assigned: number;
  contacted_this_week: number;
  overdue: number;
  last_active: string | null;
}

function lastActiveLabel(ts: string | null): string {
  if (!ts) return 'Never';
  return relativeDays(ts);
}

function fetchOverview(supabase: SupabaseClient) {
  return supabase.rpc('get_volunteer_overview');
}

export default function VolunteersTab() {
  const supabase = createClient();
  const [rows, setRows] = useState<OverviewRow[] | null>(null);
  const [sheetTeam, setSheetTeam] = useState<OverviewRow | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await fetchOverview(supabase);
    if (error) {
      toast.error(rlsErrorMessage(error));
      setRows([]);
      return;
    }
    setRows((data ?? []) as OverviewRow[]);
  }, [supabase]);

  useEffect(() => {
    async function run() {
      await load();
    }
    void run();
  }, [load]);

  const totalAssigned = (rows ?? []).reduce((sum, r) => sum + r.assigned, 0);

  if (rows === null) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {rows.length} {rows.length === 1 ? 'volunteer' : 'volunteers'} ·{' '}
        {totalAssigned} {totalAssigned === 1 ? 'person' : 'people'} assigned
      </p>

      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Volunteer</TableHead>
              <TableHead className="text-right">Assigned</TableHead>
              <TableHead className="text-right">Contacted this week</TableHead>
              <TableHead className="text-right">Overdue</TableHead>
              <TableHead className="text-right">Last active</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  No volunteers yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow
                  key={r.team_member_id}
                  className="cursor-pointer"
                  onClick={() => setSheetTeam(r)}
                >
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{r.full_name}</span>
                      <span className="text-xs text-muted-foreground">{r.role}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.assigned}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.contacted_this_week}
                  </TableCell>
                  <TableCell className="text-right">
                    {r.overdue > 0 ? (
                      <Badge variant="destructive" className="tabular-nums">
                        {r.overdue}
                      </Badge>
                    ) : (
                      <span className="tabular-nums text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {lastActiveLabel(r.last_active)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <VolunteerSheet
        key={sheetTeam?.team_member_id ?? 'none'}
        team={sheetTeam}
        open={sheetTeam !== null}
        onOpenChange={(open) => {
          if (!open) setSheetTeam(null);
        }}
        onChanged={load}
      />
    </div>
  );
}
