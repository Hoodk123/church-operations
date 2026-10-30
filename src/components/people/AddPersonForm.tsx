import { useState, useEffect, useMemo } from 'react';
import { listTeamMembers, createPerson } from '@/lib/api/people';
import { teamMemberToOption, enumReq, enumOrNull } from './adapt';
import { validateRwandaPhone } from '@/lib/phone';
import { type SelectOption } from '@/lib/select-items';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  categories,
  ageGroups,
  genders,
  m1Statuses,
  baptismStatuses,
  followUpStatuses,
  contactPreferenceOptions,
} from './constants';

interface AddPersonFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

interface TeamMemberOption {
  id: string;
  full_name: string;
}

interface FormState {
  first_name: string;
  last_name: string;
  gender: string;
  phone: string;
  location: string;
  hbf_group: string;
  category: string;
  follow_up_status: string;
  assigned_to: string;
  age_group: string;
  m1_status: string;
  how_found_church: string;
  baptism_status: string;
  contact_preference: string;
  email: string;
  address_details: string;
  needs_m1: boolean;
  needs_baptism: boolean;
  notes: string;
}

const emptyForm: FormState = {
  first_name: '',
  last_name: '',
  gender: '',
  phone: '',
  location: '',
  hbf_group: '',
  category: 'Visitor',
  follow_up_status: 'Not Started',
  assigned_to: '',
  age_group: '',
  m1_status: '',
  how_found_church: '',
  baptism_status: '',
  contact_preference: '',
  email: '',
  address_details: '',
  needs_m1: false,
  needs_baptism: false,
  notes: '',
};

export default function AddPersonForm({ open, onOpenChange, onCreated }: AddPersonFormProps) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [teamMembers, setTeamMembers] = useState<TeamMemberOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [phoneError, setPhoneError] = useState('');

  useEffect(() => {
    if (open) {
      void listTeamMembers()
        .then((data) => setTeamMembers(data.map(teamMemberToOption)))
        .catch(() => {/* keep current list on failure */});
    }
  }, [open]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key === 'phone') setPhoneError('');
  }

  const teamItems = useMemo<SelectOption[]>(
    () => [
      { value: '', label: 'Unassigned' },
      ...teamMembers.map((m) => ({ value: m.id, label: m.full_name })),
    ],
    [teamMembers]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.first_name.trim() || !form.last_name.trim() || !form.gender) {
      setError('First name, last name and gender are required.');
      return;
    }

    const phoneValidation = validateRwandaPhone(form.phone);
    if (!phoneValidation.valid) {
      setPhoneError(phoneValidation.error!);
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      // registeredBy is set server-side from the session user.
      await createPerson({
        firstName: form.first_name.trim(),
        lastName: form.last_name.trim(),
        gender: enumReq(genders, form.gender),
        phone: phoneValidation.formatted,
        location: form.location.trim() || null,
        hbfGroup: form.hbf_group.trim() || null,
        category: enumReq(categories, form.category),
        followUpStatus: enumReq(followUpStatuses, form.follow_up_status),
        assignedTo: form.assigned_to || null,
        ageGroup: enumOrNull(ageGroups, form.age_group),
        m1Status: enumOrNull(m1Statuses, form.m1_status),
        howFoundChurch: form.how_found_church.trim() || null,
        baptismStatus: enumOrNull(baptismStatuses, form.baptism_status),
        contactPreference: enumOrNull(contactPreferenceOptions, form.contact_preference),
        email: form.email.trim() || null,
        addressDetails: form.address_details.trim() || null,
        needsM1: form.needs_m1,
        needsBaptism: form.needs_baptism,
        notes: form.notes.trim() || null,
      });
      setForm(emptyForm);
      onCreated();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add person');
    } finally {
      setSubmitting(false);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) setForm(emptyForm);
    setError('');
    setPhoneError('');
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="text-lg">Register New Person</DialogTitle>
        </DialogHeader>

        <ScrollArea className="w-full max-h-[72vh] pr-3.5">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <p className="text-xs text-destructive bg-destructive/10 rounded-md px-2.5 py-1.5 font-medium">
                {error}
              </p>
            )}

            {/* Section 1: Who are we registering */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-foreground">
                Personal Information
              </Label>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="First name *">
                  <Input
                    value={form.first_name}
                    onChange={(e) => set('first_name', e.target.value)}
                    placeholder="John"
                    required
                  />
                </FormField>
                <FormField label="Last name *">
                  <Input
                    value={form.last_name}
                    onChange={(e) => set('last_name', e.target.value)}
                    placeholder="Doe"
                    required
                  />
                </FormField>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Gender">
                  <Select value={form.gender} onValueChange={(v) => set('gender', v ?? '')}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      {genders.map((g) => (
                        <SelectItem key={g} value={g}>{g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="Age Group">
                  <Select value={form.age_group} onValueChange={(v) => set('age_group', v ?? '')}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select age group" />
                    </SelectTrigger>
                    <SelectContent>
                      {ageGroups.map((a) => (
                        <SelectItem key={a} value={a}>{a}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
              </div>
            </div>

            {/* Section 2: Contact Details */}
            <div className="space-y-2 border-t pt-3">
              <Label className="text-xs font-semibold text-foreground">
                Contact Details
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormField label="Phone Number *">
                  <Input
                    value={form.phone}
                    onChange={(e) => set('phone', e.target.value)}
                    placeholder="+250 7XX XXX XXX"
                    required
                  />
                  {phoneError && (
                    <p className="text-[11px] text-destructive mt-1">{phoneError}</p>
                  )}
                </FormField>
                <FormField label="Email">
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => set('email', e.target.value)}
                    placeholder="name@example.com"
                  />
                </FormField>
              </div>
              <FormField label="Preferred Contact Method">
                <ToggleGroup
                  variant="outline"
                  className="w-full"
                  value={form.contact_preference ? [form.contact_preference] : []}
                  onValueChange={(v) => set('contact_preference', v[0] ?? '')}
                >
                  {contactPreferenceOptions.map((method) => {
                    const needsEmail = method === 'Email';
                    const disabled = needsEmail ? !form.email.trim() : !form.phone.trim();
                    return (
                      <ToggleGroupItem
                        key={method}
                        value={method}
                        disabled={disabled}
                        className="flex-1"
                      >
                        {method}
                      </ToggleGroupItem>
                    );
                  })}
                </ToggleGroup>
              </FormField>
            </div>

            {/* Section 3: Location & Fellowship */}
            <div className="space-y-2 border-t pt-3">
              <Label className="text-xs font-semibold text-foreground">
                Location & Fellowship
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormField label="Location / Neighborhood">
                  <Input
                    value={form.location}
                    onChange={(e) => set('location', e.target.value)}
                    placeholder="e.g. Kigali, Kicukiro"
                  />
                </FormField>
                <FormField label="Address details">
                  <Input
                    value={form.address_details}
                    onChange={(e) => set('address_details', e.target.value)}
                    placeholder="Street, landmark, sector"
                  />
                </FormField>
              </div>
              <FormField label="HBF Group (Home Bible Fellowship)">
                <Input
                  value={form.hbf_group}
                  onChange={(e) => set('hbf_group', e.target.value)}
                  placeholder="e.g. Remera HBF, Kicukiro HBF"
                />
              </FormField>
              <FormField label="How did they hear about us / Who invited them?">
                <Input
                  value={form.how_found_church}
                  onChange={(e) => set('how_found_church', e.target.value)}
                  placeholder="e.g. Invited by friend, Social media, Outreach"
                />
              </FormField>
            </div>

            {/* Section 4: Category & Journey */}
            <div className="space-y-2 border-t pt-3">
              <Label className="text-xs font-semibold text-foreground">
                Category & Spiritual Journey
              </Label>
              <FormField label="Category">
                <Select value={form.category} onValueChange={(v) => set('category', v ?? 'Visitor')}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>

              <div className="grid grid-cols-2 gap-3">
                <FormField label="Baptism Status">
                  <Select value={form.baptism_status} onValueChange={(v) => set('baptism_status', v ?? '')}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      {baptismStatuses.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="M1 Class Status">
                  <Select value={form.m1_status} onValueChange={(v) => set('m1_status', v ?? '')}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      {m1Statuses.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Needs M1 class</p>
                  <p className="text-[11px] text-muted-foreground">
                    Show this person in the M1 waiting list.
                  </p>
                </div>
                <Switch
                  checked={form.needs_m1}
                  onCheckedChange={(checked) => set('needs_m1', checked)}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Needs baptism</p>
                  <p className="text-[11px] text-muted-foreground">
                    Add to the baptism list on the Baptism page.
                  </p>
                </div>
                <Switch
                  checked={form.needs_baptism}
                  onCheckedChange={(checked) => set('needs_baptism', checked)}
                />
              </div>
            </div>

            {/* Section 5: Follow-up Assignment & Notes */}
            <div className="space-y-2 border-t pt-3">
              <Label className="text-xs font-semibold text-foreground">
                Ministry Assignment & Follow-up
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormField label="Assigned Follow-up Person">
                  <Select items={teamItems} value={form.assigned_to} onValueChange={(v) => set('assigned_to', v ?? '')}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Assign team member" />
                    </SelectTrigger>
                    <SelectContent>
                      {teamItems.map((m) => (
                        <SelectItem key={m.value || 'unassigned'} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="Initial Follow-up Status">
                  <Select value={form.follow_up_status} onValueChange={(v) => set('follow_up_status', v ?? 'Not Started')}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {followUpStatuses.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
              </div>

              <FormField label="Pastoral Notes / Prayer Requests / Comments">
                <textarea
                  value={form.notes}
                  onChange={(e) => set('notes', e.target.value)}
                  placeholder="Enter any additional notes, prayer requests, or background information..."
                  rows={2}
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                />
              </FormField>
            </div>

            <Button type="submit" disabled={submitting} className="w-full cursor-pointer mt-2">
              {submitting && <Spinner className="size-4" />}
              {submitting ? 'Registering...' : 'Register Person'}
            </Button>
          </form>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
