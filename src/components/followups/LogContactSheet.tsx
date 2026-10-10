import { useState } from 'react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { rlsErrorMessage } from '@/lib/rls-error';
import { useIsMobile } from '@/lib/use-is-mobile';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { CONTACT_METHODS, CONTACT_OUTCOMES } from '@/components/people/constants';

interface LogContactSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  personId: string;
  personName: string;
  memberId: string;
  /** Called after a successful insert so the parent can refetch. */
  onSaved?: () => void;
}

export default function LogContactSheet({
  open,
  onOpenChange,
  personId,
  personName,
  memberId,
  onSaved,
}: LogContactSheetProps) {
  const isMobile = useIsMobile();
  const supabase = createClient();
  const [method, setMethod] = useState<string>('Call');
  const [outcome, setOutcome] = useState<string>('Reached');
  const [note, setNote] = useState('');
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setMethod('Call');
    setOutcome('Reached');
    setNote('');
    setFinished(false);
    setError('');
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    const { error: insertErr } = await supabase.from('contact_log').insert({
      person_id: personId,
      contacted_by: memberId,
      method,
      outcome,
      note: note.trim() || null,
      finished,
    });

    setSubmitting(false);

    if (insertErr) {
      const msg = rlsErrorMessage(insertErr);
      setError(msg);
      toast.error(msg);
      return;
    }

    toast.success(`Contact logged for ${personName}`);
    onSaved?.();
    handleOpenChange(false);
  }

  const body = (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <p className="rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs font-medium text-destructive">
          {error}
        </p>
      )}

      <div className="space-y-1.5">
        <Label>How did you reach out?</Label>
        <ToggleGroup
          variant="outline"
          value={[method]}
          onValueChange={(v) => {
            if (v[0]) setMethod(v[0]);
          }}
          className="flex w-full flex-wrap"
        >
          {CONTACT_METHODS.map((m) => (
            <ToggleGroupItem key={m} value={m} className="grow text-base">
              {m}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="space-y-1.5">
        <Label>What happened?</Label>
        <Select value={outcome} onValueChange={(v) => v && setOutcome(v)}>
          <SelectTrigger className="w-full text-base">
            <SelectValue placeholder="Select an outcome" />
          </SelectTrigger>
          <SelectContent>
            {CONTACT_OUTCOMES.map((o) => (
              <SelectItem key={o} value={o} className="text-base">
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="lc-note">Note (optional)</Label>
        <Textarea
          id="lc-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Wants to join M1 class next month."
          className="min-h-[76px] text-base"
        />
      </div>

      <div className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">Finished with this person</p>
          <p className="text-xs text-muted-foreground">
            Marks the follow-up Completed. The log stays as the record.
          </p>
        </div>
        <Switch
          checked={finished}
          onCheckedChange={setFinished}
          aria-label="Finished with this person"
        />
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1 text-base"
          onClick={() => handleOpenChange(false)}
        >
          Cancel
        </Button>
        <Button type="submit" className="flex-1 text-base" disabled={submitting}>
          {submitting && <Spinner className="size-4" />}
          {submitting ? 'Saving...' : 'Save'}
        </Button>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        {finished
          ? 'This person moves to Completed and leaves your list.'
          : 'Saving moves a Not Started person to Contacted.'}
      </p>
    </form>
  );

  // Phone: bottom drawer. Desktop: side sheet (per design).
  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={handleOpenChange}>
        <DrawerContent className="max-h-[90dvh]">
          <DrawerHeader>
            <DrawerTitle>Log contact</DrawerTitle>
            <DrawerDescription>{personName}</DrawerDescription>
          </DrawerHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{body}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Log contact</SheetTitle>
          <SheetDescription>{personName}</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-4">{body}</div>
      </SheetContent>
    </Sheet>
  );
}
