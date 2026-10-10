import { useState } from 'react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { rlsErrorMessage } from '@/lib/rls-error';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
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

interface MarkNewConvertButtonProps {
  person: { id: string; first_name: string; last_name: string };
  className?: string;
  /** Called after the update succeeds so the parent can refresh its state. */
  onSaved: () => void;
}

export function MarkNewConvertButton({
  person,
  className,
  onSaved,
}: MarkNewConvertButtonProps) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function confirm() {
    setSaving(true);
    const { error } = await supabase
      .from('people')
      .update({ category: 'New Convert', needs_pastor: true })
      .eq('id', person.id);
    setSaving(false);
    if (error) {
      toast.error(rlsErrorMessage(error));
      return;
    }
    toast.success(`${person.first_name} ${person.last_name} marked as a New Convert`);
    setOpen(false);
    onSaved();
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className={className}
        onClick={() => setOpen(true)}
      >
        New Convert
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Mark {person.first_name} {person.last_name} as a New Convert?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The category changes to New Convert and the record is flagged for the
              pastor to follow up.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirm} disabled={saving}>
              {saving && <Spinner className="size-4" />}
              {saving ? 'Marking…' : 'Mark'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}