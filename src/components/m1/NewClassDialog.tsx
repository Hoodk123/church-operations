import { useState } from 'react';
import { toast } from 'sonner';
import { CalendarPlus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { rlsErrorMessage } from '@/lib/rls-error';
import { useShellMember } from '@/components/layout/shell';
import {
  addDaysISO,
  DEFAULT_REQUIRED_DAYS,
  DEFAULT_START_TIME,
  DEFAULT_VENUE,
  nextSundayISO,
} from '@/components/m1/m1';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface NewClassDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Parent switches to the new class and refetches. */
  onCreated: (classId: string) => void;
}

export default function NewClassDialog({
  open,
  onOpenChange,
  onCreated,
}: NewClassDialogProps) {
  const member = useShellMember();
  const supabase = createClient();

  const today = new Date();
  const [title, setTitle] = useState(`M1 ${MONTHS[today.getMonth()]} cohort`);
  const [venue, setVenue] = useState(DEFAULT_VENUE);
  const [requiredDays, setRequiredDays] = useState(DEFAULT_REQUIRED_DAYS);
  const [startTime, setStartTime] = useState(DEFAULT_START_TIME);
  const [firstDate, setFirstDate] = useState(nextSundayISO());
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    if (!requiredDays || requiredDays < 1 || requiredDays > 10) {
      toast.error('Days must be between 1 and 10.');
      setSubmitting(false);
      return;
    }

    const { data, error } = await supabase
      .from('m1_classes')
      .insert({
        title: title.trim() || 'M1 class',
        venue: venue.trim() || null,
        required_days: requiredDays,
        status: 'Open',
        created_by: member?.id ?? null,
      })
      .select('id')
      .single();

    if (error) {
      toast.error(rlsErrorMessage(error));
      setSubmitting(false);
      return;
    }

    const rows = Array.from({ length: requiredDays }, (_, i) => ({
      class_id: data.id,
      day_number: i + 1,
      session_date: addDaysISO(firstDate, i * 7),
      start_time: startTime || null,
    }));

    const { error: sessErr } = await supabase.from('m1_sessions').insert(rows);
    if (sessErr) {
      toast.error(rlsErrorMessage(sessErr));
      setSubmitting(false);
      return;
    }

    toast.success(`${title.trim() || 'M1 class'} scheduled for ${requiredDays} weeks`);
    onOpenChange(false);
    onCreated(data.id);
    setSubmitting(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New M1 class</DialogTitle>
          <DialogDescription>
            Weekly sessions are created for you, starting on the first date.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="class-title">Class title</Label>
            <Input
              id="class-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-base"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="class-start">First day</Label>
              <Input
                id="class-start"
                type="date"
                value={firstDate}
                onChange={(e) => setFirstDate(e.target.value)}
                className="text-base"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="class-time">Start time</Label>
              <Input
                id="class-time"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="text-base"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="class-venue">Venue</Label>
            <Input
              id="class-venue"
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              className="text-base"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="class-days">Days required to finish</Label>
            <Input
              id="class-days"
              type="number"
              min={1}
              max={10}
              value={requiredDays}
              onChange={(e) => setRequiredDays(Number(e.target.value))}
              className="text-base"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              className="flex-1 text-base"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" className="flex-1 text-base" disabled={submitting}>
              {submitting ? <Spinner className="size-4" /> : <CalendarPlus className="size-4" />}
              Create class
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}