import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Search, UserPlus, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { rlsErrorMessage } from '@/lib/rls-error';
import { validateRwandaPhone, phoneDigits } from '@/lib/phone';
import { useIsMobile } from '@/lib/use-is-mobile';
import { useShellMember } from '@/components/layout/shell';
import { personName, type M1Person } from '@/components/m1/m1';
import { contactPreferenceOptions, ageGroups, genders } from '@/components/people/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '@/components/ui/item';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { InputGroup, InputGroupInput } from '@/components/ui/input-group';
import { initials } from '@/lib/names';
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

interface AddSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classId: string;
  /** Parent refetches everything after an enrolment. */
  onAdded: () => void;
}

interface WalkInForm {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  gender: string;
  age_group: string;
  location: string;
  contact_preference: string;
  address_details: string;
}

const emptyWalkIn: WalkInForm = {
  first_name: '',
  last_name: '',
  phone: '',
  email: '',
  gender: '',
  age_group: '',
  location: 'Kagugu',
  contact_preference: 'WhatsApp',
  address_details: '',
};

/**
 * "Add" for a class: pick someone from the waiting list, or register a brand
 * new walk-in. Both end in an enrolment for this class.
 */
export default function AddSheet({
  open,
  onOpenChange,
  classId,
  onAdded,
}: AddSheetProps) {
  const isMobile = useIsMobile();
  const member = useShellMember();
  const supabase = createClient();

  const [mode, setMode] = useState<'existing' | 'walkin'>('existing');
  const [query, setQuery] = useState('');
  const [waiting, setWaiting] = useState<M1Person[]>([]);
  const [loading, setLoading] = useState(false);
  const [enrolling, setEnrolling] = useState<string | null>(null);
  const [form, setForm] = useState<WalkInForm>(emptyWalkIn);
  const [phoneError, setPhoneError] = useState('');
  const [saving, setSaving] = useState(false);
  const [sudden, setSudden] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setMode('existing');
    setForm(emptyWalkIn);
    setSudden(null);
    setPhoneError('');
    setLoading(true);
    Promise.resolve(supabase.rpc('m1_waiting_list'))
      .then(({ data, error }) => {
        if (error) toast.error(rlsErrorMessage(error));
        else setWaiting((data ?? []) as M1Person[]);
      })
      .finally(() => setLoading(false));
  }, [open, supabase]);

  const filtered = waiting.filter((p) => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return (
      personName(p).toLowerCase().includes(q) ||
      (p.phone ?? '').toLowerCase().includes(q.replace(/\D/g, '').slice(-9) || q)
    );
  });

  function set<K extends keyof WalkInForm>(key: K, value: WalkInForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key === 'phone') setPhoneError('');
  }

  async function enroll(personId: string, name: string) {
    setEnrolling(personId);
    const { error } = await supabase.from('m1_enrollments').insert({
      class_id: classId,
      person_id: personId,
      enrolled_by: member?.id ?? null,
      walk_in: false,
      status: 'Enrolled',
    });
    setEnrolling(null);
    if (error) {
      if (error.code === '23505') {
        toast.info(`${name} is already in this class`);
        return;
      }
      toast.error(rlsErrorMessage(error));
      return;
    }
    await supabase.from('people').update({ needs_m1: false }).eq('id', personId);
    toast.success(`${name} enrolled`);
    onAdded();
  }

  async function handleWalkIn(e: React.FormEvent) {
    e.preventDefault();
    setPhoneError('');

    if (!form.first_name.trim() || !form.last_name.trim()) {
      toast.error('First name and last name are required.');
      return;
    }
    const phoneValidation = validateRwandaPhone(form.phone);
    if (!phoneValidation.valid) {
      setPhoneError(phoneValidation.error!);
      return;
    }

    setSaving(true);
    const name = personName({ first_name: form.first_name.trim(), last_name: form.last_name.trim() });
    const digits = phoneDigits(phoneValidation.formatted).slice(-9);

    const { data: candidates } = await supabase
      .from('people')
      .select('id, first_name, last_name, phone')
      .ilike('phone', `%${digits}%`)
      .limit(5);
    const match = candidates?.find((p) => phoneDigits(p.phone ?? '').endsWith(digits));
    if (match) {
      setSudden({
        id: match.id,
        name: `${match.first_name} ${match.last_name}`,
      });
      setSaving(false);
      return;
    }

    const { data: inserted, error: insertErr } = await supabase
      .from('people')
      .insert({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        phone: phoneValidation.formatted,
        email: form.email.trim() || null,
        gender: form.gender || null,
        age_group: form.age_group || null,
        location: form.location.trim() || null,
        address_details: form.address_details.trim() || null,
        contact_preference: form.contact_preference || 'WhatsApp',
        category: 'M1 Class',
        needs_m1: true,
        registered_by: member?.id ?? null,
      })
      .select('id')
      .single();

    if (insertErr) {
      toast.error(rlsErrorMessage(insertErr));
      setSaving(false);
      return;
    }

    const { error } = await supabase.from('m1_enrollments').insert({
      class_id: classId,
      person_id: inserted.id,
      enrolled_by: member?.id ?? null,
      walk_in: true,
      status: 'Enrolled',
    });
    setSaving(false);
    if (error) {
      toast.error(rlsErrorMessage(error));
      return;
    }
    toast.success(`${name} enrolled as a walk-in`);
    onAdded();
    onOpenChange(false);
  }

  async function handleEnrollExisting(personId: string) {
    if (!sudden) return;
    await enroll(personId, sudden.name);
    setSudden(null);
  }

  const existingView =
    loading ? (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    ) : filtered.length === 0 ? (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Search />
          </EmptyMedia>
          <EmptyTitle>No one waiting</EmptyTitle>
        </EmptyHeader>
        <EmptyContent>
          <EmptyDescription>
            {query.trim()
              ? 'No match in the waiting list. Try a different name, or register a walk-in.'
              : 'The waiting list is empty. Register a walk-in below.'}
          </EmptyDescription>
        </EmptyContent>
      </Empty>
    ) : (
      <div className="flex flex-col gap-1.5">
        {filtered.map((p) => (
          <Item key={p.id} variant="outline">
            <ItemMedia variant="image">
              <Avatar size="sm">
                <AvatarFallback>{initials(p.first_name, p.last_name)}</AvatarFallback>
              </Avatar>
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{personName(p)}</ItemTitle>
              <ItemDescription>
                {[p.age_group, p.location, p.phone].filter(Boolean).join(' · ') || 'No contact info'}
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <Button
                size="sm"
                variant="outline"
                disabled={enrolling === p.id}
                onClick={() => enroll(p.id, personName(p))}
              >
                {enrolling === p.id ? <Spinner className="size-4" /> : <Plus className="size-4" />}
                Enroll
              </Button>
            </ItemActions>
          </Item>
        ))}
      </div>
    );

  const walkInView = (
    <form onSubmit={handleWalkIn} className="space-y-4">
      {sudden && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
          <p className="text-sm font-medium">
            This phone is already registered as {sudden.name}.
          </p>
          <div className="mt-2 flex gap-2">
            <Button
              type="button"
              size="sm"
              className="flex-1"
              onClick={() => handleEnrollExisting(sudden.id)}
            >
              Enroll {sudden.name} instead
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={() => setSudden(null)}
            >
              Use a different number
            </Button>
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="wi-first">First name</Label>
          <Input id="wi-first" value={form.first_name} onChange={(e) => set('first_name', e.target.value)} className="text-base" autoComplete="off" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wi-last">Last name</Label>
          <Input id="wi-last" value={form.last_name} onChange={(e) => set('last_name', e.target.value)} className="text-base" autoComplete="off" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="wi-phone">Phone</Label>
        <InputGroup>
          <InputGroupInput
            id="wi-phone"
            type="tel"
            inputMode="tel"
            value={form.phone}
            onChange={(e) => set('phone', e.target.value)}
            placeholder="+250 7XX XXX XXX"
            className="text-base"
          />
        </InputGroup>
        {phoneError && <p className="text-[11px] text-destructive">{phoneError}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="wi-email">Email (optional)</Label>
        <Input id="wi-email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} className="text-base" placeholder="name@example.com" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Gender</Label>
          <ToggleGroup variant="outline" value={form.gender ? [form.gender] : []} onValueChange={(v) => set('gender', v[0] ?? '')} className="w-full">
            {genders.map((g) => (
              <ToggleGroupItem key={g} value={g} className="flex-1 text-base">{g}</ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <div className="space-y-1.5">
          <Label>Age group</Label>
          <ToggleGroup variant="outline" value={form.age_group ? [form.age_group] : []} onValueChange={(v) => set('age_group', v[0] ?? '')} className="w-full">
            {ageGroups.map((a) => (
              <ToggleGroupItem key={a} value={a} className="flex-1 text-base">{a}</ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="wi-location">Location</Label>
          <Input id="wi-location" value={form.location} onChange={(e) => set('location', e.target.value)} className="text-base" />
        </div>
        <div className="space-y-1.5">
          <Label>Prefers contact by</Label>
          <ToggleGroup variant="outline" value={[form.contact_preference]} onValueChange={(v) => set('contact_preference', v[0] ?? 'WhatsApp')} className="w-full">
            {contactPreferenceOptions.map((c) => (
              <ToggleGroupItem key={c} value={c} className="flex-1 text-base">{c}</ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="wi-address">Address details (optional)</Label>
        <Input id="wi-address" value={form.address_details} onChange={(e) => set('address_details', e.target.value)} className="text-base" placeholder="Neighbourhood, sector, landmark" />
      </div>
      <div className="flex gap-2 pt-1">
        <Button type="button" variant="outline" className="flex-1 text-base" onClick={() => setMode('existing')}>
          Back to list
        </Button>
        <Button type="submit" className="flex-1 text-base" disabled={saving}>
          {saving ? <Spinner className="size-4" /> : <UserPlus className="size-4" />}
          Save and enroll
        </Button>
      </div>
    </form>
  );

  const body = (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant={mode === 'existing' ? 'default' : 'outline'}
          className="flex-1"
          onClick={() => setMode('existing')}
        >
          Waiting list
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === 'walkin' ? 'default' : 'outline'}
          className="flex-1"
          onClick={() => setMode('walkin')}
        >
          Walk-in
        </Button>
      </div>
      {mode === 'existing' ? (
        <>
          <InputGroup>
            <InputGroupInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or phone"
              className="text-base"
            />
          </InputGroup>
          {existingView}
        </>
      ) : (
        walkInView
      )}
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[92dvh]">
          <DrawerHeader>
            <DrawerTitle>Add to class</DrawerTitle>
            <DrawerDescription>
              Enrol from the waiting list, or register a walk-in.
            </DrawerDescription>
          </DrawerHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{body}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Add to class</SheetTitle>
          <SheetDescription>
            Enrol from the waiting list, or register a walk-in.
          </SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-4">{body}</div>
      </SheetContent>
    </Sheet>
  );
}