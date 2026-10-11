import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Search, UserPlus, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { rlsErrorMessage } from '@/lib/rls-error';
import { validateRwandaPhone, phoneDigits } from '@/lib/phone';
import { useShellMember } from '@/components/layout/shell';
import {
  personName,
  fetchClassSessions,
  type M1Person,
  type M1Session,
} from '@/components/m1/m1';
import { contactPreferenceOptions, ageGroups, genders } from '@/components/people/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Checkbox } from '@/components/ui/checkbox';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { InputGroup, InputGroupInput } from '@/components/ui/input-group';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

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
 * "Add" for a class: find someone already on the waiting list (or in the
 * people list), or register a brand new walk-in. Both end in an enrolment.
 */
export default function AddSheet({ open, onOpenChange, classId, onAdded }: AddSheetProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        {open && <AddSheetBody classId={classId} onAdded={onAdded} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

interface AddSheetBodyProps {
  classId: string;
  onAdded: () => void;
  onClose: () => void;
}

/** Mounted fresh each time the dialog opens, so its fields start clean. */
function AddSheetBody({ classId, onAdded, onClose }: AddSheetBodyProps) {
  const member = useShellMember();
  const supabase = createClient();

  const [mode, setMode] = useState<'existing' | 'walkin'>('existing');
  const [query, setQuery] = useState('');
  const [waiting, setWaiting] = useState<M1Person[]>([]);
  const [results, setResults] = useState<M1Person[]>([]);
  const [openSession, setOpenSession] = useState<M1Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState<string | null>(null);
  const [form, setForm] = useState<WalkInForm>(emptyWalkIn);
  const [phoneError, setPhoneError] = useState('');
  const [saving, setSaving] = useState(false);
  const [tickNow, setTickNow] = useState(false);
  const [sudden, setSudden] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      Promise.resolve(supabase.rpc('m1_waiting_list')),
      fetchClassSessions(supabase, classId),
    ])
      .then(([waitingResult, sessions]) => {
        if (cancelled) return;
        if (waitingResult.error) toast.error(rlsErrorMessage(waitingResult.error));
        else setWaiting((waitingResult.data ?? []) as M1Person[]);
        setOpenSession(sessions.find((s) => !s.closed) ?? null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, classId]);

  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    let cancelled = false;
    supabase
      .from('people')
      .select('id, first_name, last_name, phone, age_group, location')
      .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,phone.ilike.%${q}%`)
      .limit(20)
      .then(({ data }) => {
        if (!cancelled) setResults((data ?? []) as M1Person[]);
      });
    return () => {
      cancelled = true;
    };
  }, [query, supabase]);

  const filteredWaiting = waiting.filter((p) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      personName(p).toLowerCase().includes(q) ||
      (p.phone ?? '').toLowerCase().includes(q.replace(/\D/g, '').slice(-9) || q)
    );
  });

  const waitingIds = new Set(waiting.map((p) => p.id));
  const extraResults = (query.trim() ? results : []).filter((p) => !waitingIds.has(p.id));
  const shown = [...filteredWaiting, ...extraResults];

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
      setSudden({ id: match.id, name: `${match.first_name} ${match.last_name}` });
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
    if (error) {
      toast.error(rlsErrorMessage(error));
      setSaving(false);
      return;
    }

    if (tickNow && openSession) {
      const { error: tickErr } = await supabase.from('m1_attendance').insert({
        session_id: openSession.id,
        person_id: inserted.id,
        status: 'Present',
        marked_by: member?.id ?? '',
      });
      if (tickErr) toast.error(rlsErrorMessage(tickErr));
    }

    setSaving(false);
    toast.success(`${name} enrolled as a walk-in`);
    onAdded();
    onClose();
  }

  async function handleEnrollExisting(personId: string) {
    if (!sudden) return;
    await enroll(personId, sudden.name);
    setSudden(null);
  }

  const existingView = loading ? (
    <div className="flex justify-center py-10">
      <Spinner />
    </div>
  ) : shown.length === 0 ? (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Search />
        </EmptyMedia>
        <EmptyTitle>No one found</EmptyTitle>
      </EmptyHeader>
      <EmptyContent>
        <EmptyDescription>
          {query.trim()
            ? 'No match on name or phone. Register them as a new person.'
            : 'The waiting list is empty. Register a new person.'}
        </EmptyDescription>
      </EmptyContent>
    </Empty>
  ) : (
    <div className="flex max-h-[45dvh] flex-col gap-1.5 overflow-y-auto">
      {shown.map((p) => (
        <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{personName(p)}</p>
            <p className="truncate text-xs text-muted-foreground">
              {[p.age_group, p.location, p.phone].filter(Boolean).join(' · ') || 'No contact info'}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={enrolling === p.id}
            onClick={() => enroll(p.id, personName(p))}
          >
            {enrolling === p.id ? <Spinner className="size-4" /> : <Plus className="size-4" />}
            Enrol
          </Button>
        </div>
      ))}
    </div>
  );

  return (
    <>
      <DialogHeader>
        <DialogTitle>Add to M1 Class</DialogTitle>
        <DialogDescription>Enrol someone already known, or register a walk-in.</DialogDescription>
      </DialogHeader>

      <ToggleGroup
        variant="outline"
        value={[mode]}
        onValueChange={(v) => {
          if (v[0]) setMode(v[0] as 'existing' | 'walkin');
        }}
        className="w-full"
      >
        <ToggleGroupItem value="existing" className="flex-1">
          Find existing
        </ToggleGroupItem>
        <ToggleGroupItem value="walkin" className="flex-1">
          New person
        </ToggleGroupItem>
      </ToggleGroup>

      {mode === 'existing' ? (
        <div className="space-y-3">
          <InputGroup>
            <InputGroupInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or phone"
              className="text-base"
            />
          </InputGroup>
          {existingView}
        </div>
      ) : (
        <form onSubmit={handleWalkIn} className="space-y-4">
          {sudden && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
              <p className="text-sm font-medium">
                This number belongs to {sudden.name}. Enrol them instead?
              </p>
              <div className="mt-2 flex gap-2">
                <Button type="button" size="sm" className="flex-1" onClick={() => handleEnrollExisting(sudden.id)}>
                  Enrol {sudden.name}
                </Button>
                <Button type="button" size="sm" variant="outline" className="flex-1" onClick={() => setSudden(null)}>
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
            <Label htmlFor="wi-location">Where do they live?</Label>
            <Input id="wi-location" value={form.location} onChange={(e) => set('location', e.target.value)} className="text-base" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wi-address">Address details (optional)</Label>
            <Input id="wi-address" value={form.address_details} onChange={(e) => set('address_details', e.target.value)} className="text-base" placeholder="Neighbourhood, sector, landmark" />
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
          <div className="space-y-1.5">
            <Label>How should we contact them?</Label>
            <ToggleGroup variant="outline" value={[form.contact_preference]} onValueChange={(v) => set('contact_preference', v[0] ?? 'WhatsApp')} className="w-full">
              {contactPreferenceOptions.map((c) => (
                <ToggleGroupItem key={c} value={c} className="flex-1 text-base">{c}</ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          {openSession && (
            <div className="flex items-center justify-between">
              <Label htmlFor="wi-tick" className="text-sm font-normal">
                Mark present for Day {openSession.day_number} now
              </Label>
              <Checkbox id="wi-tick" checked={tickNow} onCheckedChange={(v) => setTickNow(v === true)} />
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1 text-base" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1 text-base" disabled={saving}>
              {saving ? <Spinner className="size-4" /> : <UserPlus className="size-4" />}
              Save and enrol
            </Button>
          </div>
        </form>
      )}
    </>
  );
}
