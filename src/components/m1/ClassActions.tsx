import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Archive, ArchiveRestore, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { rlsErrorMessage } from '@/lib/rls-error';
import {
  deleteM1Class,
  listM1AbsenceReplies,
  listM1Attendance,
  listM1Enrollments,
  listM1Materials,
  updateM1Class,
} from '@/lib/api/m1';
import { type M1Class, type M1Session } from '@/components/m1/m1';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ClassMenuProps {
  klass: M1Class;
  sessions: M1Session[];
  isAdmin: boolean;
  onChanged: () => void;
}

export function ClassMenu({ klass, sessions, isAdmin, onChanged }: ClassMenuProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);

  if (!isAdmin) return null;

  const archived = !!klass.archived_at;

  async function toggleArchive() {
    setArchiving(true);
    try {
      await updateM1Class(klass.id, { archived: !archived });
    } catch (error) {
      toast.error(rlsErrorMessage(error));
      setArchiving(false);
      return;
    }
    setArchiving(false);
    toast.success(archived ? `${klass.title} restored` : `${klass.title} archived`);
    onChanged();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" size="icon" aria-label="Class menu" disabled={archiving}>
              {archiving ? <Spinner className="size-4" /> : <MoreHorizontal className="size-4" />}
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <Pencil className="size-4" />
            Edit class
          </DropdownMenuItem>
          <DropdownMenuItem onClick={toggleArchive}>
            {archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
            {archived ? 'Restore class' : 'Archive class'}
          </DropdownMenuItem>
          {isAdmin && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="size-4" />
                Delete class
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {editOpen && (
        <EditClassDialog
          klass={klass}
          sessions={sessions}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            onChanged();
          }}
        />
      )}

      {deleteOpen && (
        <DeleteClassDialog
          klass={klass}
          onClose={() => setDeleteOpen(false)}
          onDeleted={() => {
            setDeleteOpen(false);
            onChanged();
          }}
        />
      )}
    </>
  );
}

interface EditClassDialogProps {
  klass: M1Class;
  sessions: M1Session[];
  onClose: () => void;
  onSaved: () => void;
}

interface SessionEdit {
  id: string;
  day_number: number;
  session_date: string;
  start_time: string;
}

function EditClassDialog({ klass, sessions: initialSessions, onClose, onSaved }: EditClassDialogProps) {
  const [title, setTitle] = useState(klass.title);
  const [venue, setVenue] = useState(klass.venue ?? '');
  const [status, setStatus] = useState<'Open' | 'Closed'>(klass.status === 'Closed' ? 'Closed' : 'Open');
  const [sessions, setSessions] = useState<SessionEdit[]>(() =>
    [...initialSessions]
      .sort((a, b) => a.day_number - b.day_number)
      .map((s) => ({
        id: s.id,
        day_number: s.day_number,
        session_date: s.session_date,
        start_time: (s.start_time ?? '').slice(0, 5),
      }))
  );
  const [saving, setSaving] = useState(false);

  function setSession(id: string, patch: Partial<SessionEdit>) {
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  async function save() {
    if (!title.trim()) {
      toast.error('Give the class a name.');
      return;
    }
    setSaving(true);
    try {
      await updateM1Class(klass.id, {
        title: title.trim(),
        venue: venue.trim() || null,
        status,
        sessions: sessions.map((s) => ({
          id: s.id,
          sessionDate: s.session_date,
          startTime: s.start_time || null,
        })),
      });
    } catch (error) {
      setSaving(false);
      toast.error(rlsErrorMessage(error));
      return;
    }
    setSaving(false);
    toast.success('Class updated');
    onSaved();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit class</DialogTitle>
          <DialogDescription>Changing dates keeps every attendance tick.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="edit-title">Class name</Label>
            <Input id="edit-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="edit-venue">Venue</Label>
              <Input id="edit-venue" value={venue} onChange={(e) => setVenue(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v ?? 'Open')}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Open">Open</SelectItem>
                  <SelectItem value="Closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Days and times</Label>
            {sessions.map((s) => (
              <div key={s.id} className="grid grid-cols-[4.5rem_1fr_1fr] items-center gap-2">
                <span className="text-sm text-muted-foreground">Day {s.day_number}</span>
                <Input
                  type="date"
                  value={s.session_date}
                  onChange={(e) => setSession(s.id, { session_date: e.target.value })}
                />
                <Input
                  type="time"
                  value={s.start_time}
                  onChange={(e) => setSession(s.id, { start_time: e.target.value })}
                />
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={saving} onClick={save}>
            {saving ? <Spinner className="size-4" /> : null}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface DeleteClassDialogProps {
  klass: M1Class;
  onClose: () => void;
  onDeleted: () => void;
}

interface DeleteCounts {
  enrolled: number;
  ticks: number;
  files: number;
  replies: number;
  certificates: number;
}

function DeleteClassDialog({ klass, onClose, onDeleted }: DeleteClassDialogProps) {
  const [counts, setCounts] = useState<DeleteCounts | null>(null);
  const [confirmName, setConfirmName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [enrollments, attendance, files, replies] = await Promise.all([
          listM1Enrollments(klass.id),
          listM1Attendance(klass.id),
          listM1Materials(klass.id),
          listM1AbsenceReplies(klass.id),
        ]);
        if (!cancelled) {
          setCounts({
            enrolled: enrollments.length,
            ticks: attendance.length,
            files: files.length,
            replies: replies.length,
            certificates: enrollments.filter((row) => row.certificateNo !== null).length,
          });
        }
      } catch (error) {
        if (!cancelled) toast.error(rlsErrorMessage(error));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [klass.id]);

  const hasHistory =
    !!counts && (counts.ticks > 0 || counts.replies > 0 || counts.certificates > 0);
  const canDelete = !hasHistory || confirmName.trim() === klass.title;

  async function archiveInstead() {
    setBusy(true);
    try {
      await updateM1Class(klass.id, { archived: true });
    } catch (error) {
      setBusy(false);
      toast.error(rlsErrorMessage(error));
      return;
    }
    setBusy(false);
    toast.success(`${klass.title} archived`);
    onDeleted();
  }

  async function destroy() {
    setBusy(true);
    try {
      await deleteM1Class(klass.id);
    } catch (error) {
      setBusy(false);
      toast.error(rlsErrorMessage(error));
      return;
    }
    setBusy(false);
    toast.success(`${klass.title} deleted`);
    onDeleted();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete {klass.title}?</DialogTitle>
          <DialogDescription>
            This permanently removes the class and everything that belongs to it. People are never
            deleted.
          </DialogDescription>
        </DialogHeader>

        {!counts ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : (
          <div className="grid gap-3">
            <p className="text-sm">
              {klass.title} has {counts.enrolled} enrolled{' '}
              {counts.enrolled === 1 ? 'person' : 'people'}, {counts.ticks} attendance{' '}
              {counts.ticks === 1 ? 'tick' : 'ticks'}, {counts.files}{' '}
              {counts.files === 1 ? 'file' : 'files'}, {counts.replies}{' '}
              {counts.replies === 1 ? 'reply' : 'replies'} and {counts.certificates} issued{' '}
              {counts.certificates === 1 ? 'certificate' : 'certificates'}.
            </p>

            {hasHistory && (
              <div className="grid gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  This class has history. Archiving keeps it safe and can be undone. To delete it
                  forever, type the class name.
                </p>
                <Input
                  value={confirmName}
                  onChange={(e) => setConfirmName(e.target.value)}
                  placeholder={klass.title}
                />
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <div className="flex flex-wrap justify-end gap-2">
            {hasHistory && (
              <Button disabled={busy} onClick={archiveInstead}>
                <Archive className="size-4" />
                Archive instead
              </Button>
            )}
            <Button variant="destructive" disabled={busy || !canDelete} onClick={destroy}>
              {busy ? <Spinner className="size-4" /> : <Trash2 className="size-4" />}
              Delete class
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
