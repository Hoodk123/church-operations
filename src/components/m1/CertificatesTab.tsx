import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Award, Printer } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { rlsErrorMessage } from '@/lib/rls-error';
import { useShellMember } from '@/components/layout/shell';
import {
  personName,
  fetchClassSessions,
  fetchEnrollments,
  fetchAttendance,
  venueLabel,
  fmtDateFull,
  type M1Class,
  type M1Enrollment,
} from '@/components/m1/m1';
import { CHURCH_NAME, CERTIFICATE_SIGNATORIES } from '@/lib/church';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface CertificatesTabProps {
  klass: M1Class;
  onChanged: () => void;
}

interface CertRow {
  enrollment: M1Enrollment;
  present: number;
  missedDays: number[];
  eligible: boolean;
  overrideNote: string | null;
}

export function CertificatesTab({ klass, onChanged }: CertificatesTabProps) {
  const member = useShellMember();
  const supabase = createClient();
  const classId = klass.id;
  const requiredDays = klass.required_days;

  const canIssue = member?.role === 'Admin' || member?.role === 'Pastor';
  const canAllowMakeUp = member?.role === 'Admin' || member?.role === 'Pastor' || member?.role === 'Follow-up Coordinator';

  const [rows, setRows] = useState<CertRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [makeUpFor, setMakeUpFor] = useState<CertRow | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetchClassSessions(supabase, classId),
      fetchEnrollments(supabase, classId),
      fetchAttendance(supabase, classId),
    ])
      .then(([s, enrollments, attendanceBySession]) => {
        const closedIds = new Set(s.filter((row) => row.closed).map((row) => row.id));
        const present = new Map<string, number>();
        const missed = new Map<string, number[]>();
        for (const [sessionId, attendance] of Object.entries(attendanceBySession)) {
          const session = s.find((row) => row.id === sessionId);
          for (const row of attendance) {
            if (row.status === 'Present') {
              present.set(row.person_id, (present.get(row.person_id) ?? 0) + 1);
            } else if (closedIds.has(sessionId) && session) {
              const list = missed.get(row.person_id) ?? [];
              list.push(session.day_number);
              missed.set(row.person_id, list);
            }
          }
        }
        const built: CertRow[] = enrollments.map((e) => {
          const count = present.get(e.person_id) ?? 0;
          const overrideNote = (e as M1Enrollment & { certificate_override_note?: string | null })
            .certificate_override_note ?? null;
          return {
            enrollment: e,
            present: count,
            missedDays: (missed.get(e.person_id) ?? []).sort((a, b) => a - b),
            eligible: count >= requiredDays || !!overrideNote,
            overrideNote,
          };
        });
        setRows(built);
        setSelected(
          new Set(
            built
              .filter((r) => r.eligible && !r.enrollment.certificate_no)
              .map((r) => r.enrollment.id)
          )
        );
      })
      .catch((err) => toast.error(rlsErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [supabase, classId, requiredDays]);

  useEffect(() => {
    load();
  }, [load]);

  const ready = useMemo(() => rows.filter((r) => r.eligible), [rows]);
  const notReady = useMemo(() => rows.filter((r) => !r.eligible), [rows]);
  const unissuedReady = useMemo(() => ready.filter((r) => !r.enrollment.certificate_no), [ready]);
  const selectedReady = useMemo(
    () => ready.filter((r) => selected.has(r.enrollment.id)),
    [ready, selected]
  );

  function toggle(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(ready.map((r) => r.enrollment.id)) : new Set());
  }

  async function issue() {
    const ids = unissuedReady.filter((r) => selected.has(r.enrollment.id)).map((r) => r.enrollment.id);
    if (ids.length === 0) {
      toast.info('Nothing to mark as issued.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc('issue_m1_certificates', { p_enrollment_ids: ids });
    setBusy(false);
    if (error) {
      toast.error(rlsErrorMessage(error));
      return;
    }
    toast.success(`Marked ${ids.length} certificate${ids.length === 1 ? '' : 's'} as issued`);
    load();
    onChanged();
  }

  function print() {
    const ids = selectedReady.map((r) => r.enrollment.id);
    if (ids.length === 0) {
      toast.info('Choose who to print.');
      return;
    }
    window.open(`/m1/certificates/print?e=${ids.join(',')}`, '_blank', 'noopener');
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

  const previewRow = selectedReady[0] ?? ready[0] ?? null;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-muted/40 px-3 py-2">
          <label className="flex items-center gap-2 text-sm font-medium">
            <Checkbox
              checked={ready.length > 0 && selectedReady.length === ready.length}
              onCheckedChange={(v) => toggleAll(v === true)}
            />
            {unissuedReady.length} ready
          </label>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={print} disabled={selectedReady.length === 0}>
              <Printer className="size-4" />
              Print certificates
            </Button>
            {canIssue && (
              <Button size="sm" onClick={issue} disabled={busy || unissuedReady.length === 0}>
                {busy ? <Spinner className="size-4" /> : <Award className="size-4" />}
                Mark as issued
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-2">
          {ready.map((row) => (
            <div
              key={row.enrollment.id}
              className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5 text-sm"
            >
              {row.enrollment.certificate_no ? (
                <span className="size-4" />
              ) : (
                <Checkbox
                  checked={selected.has(row.enrollment.id)}
                  onCheckedChange={(v) => toggle(row.enrollment.id, v === true)}
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-medium">{personName(row.enrollment.people)}</p>
                <p className="text-xs text-muted-foreground">
                  {row.present} of {requiredDays} days
                  {row.overrideNote && !row.enrollment.certificate_no ? ' · make-up allowed' : ''}
                </p>
              </div>
              {row.enrollment.certificate_no ? (
                <Badge className="border-green-500/40 bg-green-500/10 text-green-700">
                  Issued · {row.enrollment.certificate_no}
                </Badge>
              ) : (
                <Badge variant="outline">Not issued</Badge>
              )}
            </div>
          ))}
        </div>

        {notReady.length > 0 && (
          <>
            <p className="pt-2 text-xs font-semibold text-muted-foreground">
              Not ready · {notReady.length}
            </p>
            <div className="space-y-2">
              {notReady.map((row) => (
                <div
                  key={row.enrollment.id}
                  className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{personName(row.enrollment.people)}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.present} of {requiredDays} days
                      {row.missedDays.length > 0 &&
                        `, missed ${row.missedDays.map((d) => `Day ${d}`).join(' and ')}`}
                    </p>
                  </div>
                  {canAllowMakeUp && (
                    <Button size="sm" variant="outline" onClick={() => setMakeUpFor(row)}>
                      Allow make-up
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="space-y-2">
        <Card className="border-2">
          <CardContent className="flex flex-col items-center gap-2 py-6 text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              {CHURCH_NAME}
            </p>
            <p className="text-xl font-semibold">Certificate of Completion</p>
            <p className="text-sm text-muted-foreground">This certifies that</p>
            <p className="text-lg font-semibold">
              {previewRow ? personName(previewRow.enrollment.people) : '—'}
            </p>
            <p className="text-sm text-muted-foreground">
              attended {requiredDays} days of {klass.title}, held{' '}
              {previewRow?.enrollment.certificate_issued_at
                ? fmtDateFull(previewRow.enrollment.certificate_issued_at)
                : 'in this class'}{' '}
              at {venueLabel(klass.venue)}.
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              Certificate no. {previewRow?.enrollment.certificate_no ?? 'assigned on issue'}
            </p>
            <div className="mt-4 flex w-full justify-between gap-4">
              {CERTIFICATE_SIGNATORIES.map((sig) => (
                <div key={sig.label} className="flex-1 border-t pt-1 text-xs text-muted-foreground">
                  {sig.label}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground">
          Church name and signatories are placeholders. Set the real values in{' '}
          <span className="font-mono">src/lib/church.ts</span> before printing.
        </p>
      </div>

      {makeUpFor && (
        <MakeUpDialog
          klass={klass}
          row={makeUpFor}
          onClose={() => setMakeUpFor(null)}
          onSaved={() => {
            setMakeUpFor(null);
            load();
            onChanged();
          }}
        />
      )}
    </div>
  );
}

interface MakeUpDialogProps {
  klass: M1Class;
  row: CertRow;
  onClose: () => void;
  onSaved: () => void;
}

function MakeUpDialog({ klass, row, onClose, onSaved }: MakeUpDialogProps) {
  const supabase = createClient();
  const member = useShellMember();
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const override = note.trim()
      ? `${note.trim()} (allowed by ${member?.full_name ?? 'a leader'})`
      : `Make-up allowed by ${member?.full_name ?? 'a leader'}`;
    const { error } = await supabase
      .from('m1_enrollments')
      .update({ certificate_override_note: override })
      .eq('id', row.enrollment.id);
    setSaving(false);
    if (error) {
      toast.error(rlsErrorMessage(error));
      return;
    }
    toast.success(`${personName(row.enrollment.people)} can be certificated`);
    onSaved();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Allow a make-up</DialogTitle>
          <DialogDescription>
            {personName(row.enrollment.people)} · {klass.title} · {row.present} of {klass.required_days} days
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="makeup-note">Why this is allowed (optional)</Label>
          <Textarea
            id="makeup-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="For example: attended the make-up session on 2 Nov"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={saving} onClick={save}>
            {saving ? <Spinner className="size-4" /> : null}
            Allow make-up
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
