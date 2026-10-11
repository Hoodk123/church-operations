import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Award, Printer } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { rlsErrorMessage } from '@/lib/rls-error';
import { useShellMember } from '@/components/layout/shell';
import {
  personName,
  fetchEnrollments,
  fetchPresentCounts,
  progressFor,
  dayStatusColor,
  type M1Class,
  type M1Enrollment,
} from '@/components/m1/m1';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle, ItemMedia } from '@/components/ui/item';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { initials } from '@/lib/names';

interface CertificatesTabProps {
  klass: M1Class;
  onChanged: () => void;
}

interface CertRow extends M1Enrollment {
  present: number;
  eligible: boolean;
}

export function CertificatesTab({ klass, onChanged }: CertificatesTabProps) {
  const member = useShellMember();
  const supabase = createClient();
  const navigate = useNavigate();

  const canIssue = member?.role === 'Admin' || member?.role === 'Pastor';

  const [rows, setRows] = useState<CertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetchEnrollments(supabase, klass.id),
      fetchPresentCounts(supabase, klass.id),
    ])
      .then(([enrollments, counts]) => {
        setRows(
          enrolleesWithCounts(enrollments, counts, klass.required_days)
        );
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [supabase, klass.id, klass.required_days]);

  useEffect(() => {
    load();
  }, [load]);

  const eligibleRows = useMemo(() => rows.filter((r) => r.eligible && !r.certificate_no), [rows]);

  async function issue() {
    if (eligibleRows.length === 0) return;
    setIssuing(true);
    const { error } = await supabase.rpc('issue_m1_certificates', {
      p_enrollment_ids: eligibleRows.map((r) => r.id),
    });
    setIssuing(false);
    if (error) {
      toast.error(rlsErrorMessage(error));
      return;
    }
    toast.success(`Issued ${eligibleRows.length} certificate${eligibleRows.length === 1 ? '' : 's'}`);
    load();
    onChanged();
  }

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Award />
          </EmptyMedia>
          <EmptyTitle>No students to certificate</EmptyTitle>
        </EmptyHeader>
        <EmptyContent>
          <EmptyDescription>Enrolled students with enough days appear here.</EmptyDescription>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div className="space-y-3">
      {canIssue && eligibleRows.length > 0 && (
        <Button onClick={issue} disabled={issuing}>
          {issuing ? <Spinner className="size-4" /> : <Award className="size-4" />}
          Issue certificates for {eligibleRows.length} eligible
        </Button>
      )}

      <div className="flex flex-col gap-1.5">
        {rows.map((row) => {
          const progress = progressFor({ [row.person_id]: row.present }, klass.required_days, row.person_id);
          return (
            <Item key={row.id} variant="outline">
              <ItemMedia variant="image">
                <Avatar size="sm">
                  <AvatarFallback>{initials(row.people.first_name, row.people.last_name)}</AvatarFallback>
                </Avatar>
              </ItemMedia>
              <ItemContent>
                <ItemTitle>
                  {personName(row.people)}
                  {row.certificate_no && (
                    <span className="ml-1.5 text-xs text-muted-foreground">{row.certificate_no}</span>
                  )}
                </ItemTitle>
                <ItemDescription className="flex items-center gap-1.5">
                  <span
                    className={`inline-block h-1.5 w-16 rounded-full ${dayStatusColor(
                      row.present,
                      klass.required_days
                    )}`}
                    style={{ width: `${Math.round(progress * 100)}%` }}
                  />
                  <span>
                    {row.present}/{klass.required_days}
                  </span>
                  {row.status !== 'Enrolled' && <Badge variant="outline">{row.status}</Badge>}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                {row.certificate_no ? (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button size="sm" variant="outline" onClick={() => navigate(`/m1/certificates/print?e=${row.id}`)}>
                          <Printer className="size-3.5" />
                          Print
                        </Button>
                      }
                    />
                    <TooltipContent>Open print view</TooltipContent>
                  </Tooltip>
                ) : canIssue && row.eligible ? (
                  <Badge className="bg-emerald-600">Eligible</Badge>
                ) : (
                  <Badge variant="outline">Needs {Math.max(0, klass.required_days - row.present)} more</Badge>
                )}
              </ItemActions>
            </Item>
          );
        })}
      </div>
    </div>
  );
}

function enrolleesWithCounts(
  enrollments: M1Enrollment[],
  counts: Record<string, number>,
  requiredDays: number
): CertRow[] {
  return enrollments.map((e) => ({
    ...e,
    present: counts[e.person_id] ?? 0,
    eligible: (counts[e.person_id] ?? 0) >= requiredDays,
  }));
}