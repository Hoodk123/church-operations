import { useState } from 'react';
import { toast } from 'sonner';
import { Check, MapPin, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { validateRwandaPhone, phoneDigits } from '@/lib/phone';
import { rlsErrorMessage } from '@/lib/rls-error';
import { useIsMobile } from '@/lib/use-is-mobile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Spinner } from '@/components/ui/spinner';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group';
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
import { ageGroups, genders } from '@/components/people/constants';

interface NewVisitorDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Parent refetches attendance + today count. */
  onCheckedIn: () => void;
  memberId: string;
}

interface DuplicatePerson {
  id: string;
  name: string;
}

interface FormState {
  first_name: string;
  last_name: string;
  phone: string;
  gender: string;
  age_group: string;
  location: string;
  how_found_church: string;
  giveToChrist: boolean;
}

const emptyForm: FormState = {
  first_name: '',
  last_name: '',
  phone: '',
  gender: '',
  age_group: '',
  location: '',
  how_found_church: '',
  giveToChrist: false,
};

function getFullName(first: string, last: string): string {
  return `${first.trim()} ${last.trim()}`.trim();
}

export default function NewVisitorDrawer({
  open,
  onOpenChange,
  onCheckedIn,
  memberId,
}: NewVisitorDrawerProps) {
  const isMobile = useIsMobile();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [phoneError, setPhoneError] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [duplicate, setDuplicate] = useState<DuplicatePerson | null>(null);
  const [savedName, setSavedName] = useState<string | null>(null);
  const supabase = createClient();

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key === 'phone') {
      setPhoneError('');
      setDuplicate(null);
    }
  }

  function resetAll() {
    setForm(emptyForm);
    setPhoneError('');
    setError('');
    setDuplicate(null);
    setSavedName(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) resetAll();
    onOpenChange(nextOpen);
  }

  async function checkInPerson(personId: string, name: string): Promise<boolean> {
    const { error: attErr } = await supabase
      .from('attendance')
      .insert({ person_id: personId, checked_in_by: memberId });

    if (attErr && attErr.code === '23505') {
      toast.info(`${name} is already checked in today`);
      onCheckedIn();
      return false;
    }
    if (attErr) {
      toast.error(rlsErrorMessage(attErr));
      return false;
    }
    toast.success(`${name} checked in`);
    onCheckedIn();
    return true;
  }

  async function handleDuplicateCheckIn() {
    if (!duplicate) return;
    setSubmitting(true);
    const ok = await checkInPerson(duplicate.id, duplicate.name);
    setSubmitting(false);
    if (ok) handleOpenChange(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!form.first_name.trim() || !form.last_name.trim()) {
      setError('First name and last name are required.');
      return;
    }

    const phoneValidation = validateRwandaPhone(form.phone);
    if (!phoneValidation.valid) {
      setPhoneError(phoneValidation.error!);
      return;
    }

    setSubmitting(true);

    const name = getFullName(form.first_name, form.last_name);
    const digits = phoneDigits(phoneValidation.formatted).slice(-9);

    // Duplicate guard: same phone already registered?
    const { data: candidates, error: dupErr } = await supabase
      .from('people')
      .select('id, first_name, last_name, phone')
      .ilike('phone', `%${digits}%`)
      .limit(5);

    if (dupErr) {
      toast.error(rlsErrorMessage(dupErr));
      setSubmitting(false);
      return;
    }

    const match = candidates?.find((p) => phoneDigits(p.phone ?? '').endsWith(digits));
    if (match) {
      setDuplicate({
        id: match.id,
        name: getFullName(match.first_name, match.last_name),
      });
      setSubmitting(false);
      return;
    }

    // 1. Insert the person
    const { data: inserted, error: insertErr } = await supabase
      .from('people')
      .insert({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        phone: phoneValidation.formatted,
        gender: form.gender || null,
        age_group: form.age_group || null,
        location: form.location.trim() || null,
        how_found_church: form.how_found_church.trim() || null,
        category: form.giveToChrist ? 'New Convert' : 'Visitor',
        needs_pastor: form.giveToChrist,
        registered_by: memberId,
      })
      .select('id')
      .single();

    if (insertErr) {
      toast.error(rlsErrorMessage(insertErr));
      setSubmitting(false);
      return;
    }

    // 2. Check them in for today's service
    await checkInPerson(inserted.id, name);

    // 3. Reset and offer "Register another"
    setForm(emptyForm);
    setPhoneError('');
    setSavedName(name);
    setSubmitting(false);
  }

  const body = savedName ? (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <div className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Check className="size-5" />
      </div>
      <p className="text-sm font-medium">{savedName} checked in</p>
      <div className="flex w-full gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1 text-base"
          onClick={resetAll}
        >
          <Plus className="size-4" />
          Register another
        </Button>
        <Button
          type="button"
          className="flex-1 text-base"
          onClick={() => handleOpenChange(false)}
        >
          Done
        </Button>
      </div>
    </div>
  ) : (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <p className="rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs font-medium text-destructive">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="nv-first">First name</Label>
          <Input
            id="nv-first"
            value={form.first_name}
            onChange={(e) => set('first_name', e.target.value)}
            placeholder="Eric"
            className="text-base"
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nv-last">Last name</Label>
          <Input
            id="nv-last"
            value={form.last_name}
            onChange={(e) => set('last_name', e.target.value)}
            placeholder="Mugisha"
            className="text-base"
            autoComplete="off"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="nv-phone">Phone</Label>
        <InputGroup>
          <InputGroupAddon align="inline-start">
            <InputGroupText>+250</InputGroupText>
          </InputGroupAddon>
          <InputGroupInput
            id="nv-phone"
            type="tel"
            inputMode="tel"
            value={form.phone}
            onChange={(e) => set('phone', e.target.value)}
            placeholder="788 123 456"
            className="text-base"
            autoComplete="off"
          />
        </InputGroup>
        {phoneError && (
          <p className="text-[11px] text-destructive">{phoneError}</p>
        )}
      </div>

      {duplicate && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
          <p className="text-sm font-medium">
            This phone is already registered as {duplicate.name}.
          </p>
          <div className="mt-2 flex gap-2">
            <Button
              type="button"
              size="sm"
              className="flex-1"
              disabled={submitting}
              onClick={handleDuplicateCheckIn}
            >
              Check in {duplicate.name.split(' ')[0]}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={() => setDuplicate(null)}
            >
              Use a different number
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Gender</Label>
          <ToggleGroup
            variant="outline"
            value={form.gender ? [form.gender] : []}
            onValueChange={(v) => set('gender', v[0] ?? '')}
            className="w-full"
          >
            {genders.map((g) => (
              <ToggleGroupItem key={g} value={g} className="flex-1 text-base">
                {g}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <div className="space-y-1.5">
          <Label>Age group</Label>
          <ToggleGroup
            variant="outline"
            value={form.age_group ? [form.age_group] : []}
            onValueChange={(v) => set('age_group', v[0] ?? '')}
            className="w-full"
          >
            {ageGroups.map((a) => (
              <ToggleGroupItem key={a} value={a} className="flex-1 text-base">
                {a}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="nv-location">Location</Label>
        <InputGroup>
          <InputGroupAddon align="inline-start">
            <MapPin className="size-4 text-muted-foreground" />
          </InputGroupAddon>
          <InputGroupInput
            id="nv-location"
            value={form.location}
            onChange={(e) => set('location', e.target.value)}
            placeholder="Kagugu"
            className="text-base"
            autoComplete="off"
          />
        </InputGroup>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="nv-how">How did they find the church?</Label>
        <Input
          id="nv-how"
          value={form.how_found_church}
          onChange={(e) => set('how_found_church', e.target.value)}
          placeholder="Invited by a friend, outreach..."
          className="text-base"
          autoComplete="off"
        />
      </div>

      <div className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3">
        <span className="text-sm">Gave their life to Christ today</span>
        <Switch
          checked={form.giveToChrist}
          onCheckedChange={(checked) => set('giveToChrist', checked)}
          aria-label="Gave their life to Christ today"
        />
      </div>

      <div className="flex gap-2 pt-1">
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
          {submitting ? 'Saving...' : 'Save and check in'}
        </Button>
      </div>
    </form>
  );

  // Phone: bottom drawer. Desktop: side sheet (per design).
  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={handleOpenChange}>
        <DrawerContent className="max-h-[90dvh]">
          <DrawerHeader>
            <DrawerTitle>New visitor</DrawerTitle>
            <DrawerDescription>Name and phone are required.</DrawerDescription>
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
          <SheetTitle>New visitor</SheetTitle>
          <SheetDescription>Name and phone are required.</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-4">{body}</div>
      </SheetContent>
    </Sheet>
  );
}
