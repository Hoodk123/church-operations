import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { parsePhoneNumber } from 'libphonenumber-js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  notes: '',
};

function validateRwandaPhone(value: string): { valid: boolean; formatted: string; error?: string } {
  const trimmed = value.trim();
  if (!trimmed) return { valid: false, formatted: '', error: 'Phone number is required' };

  // Try parsing with Rwanda country code
  const withCode = trimmed.startsWith('+') ? trimmed : `+250${trimmed.replace(/^0/, '')}`;
  const parsed = parsePhoneNumber(withCode);

  if (parsed && parsed.isValid()) {
    return { valid: true, formatted: parsed.formatInternational() };
  }

  // Fallback: regex check for Rwanda format
  const rwRegex = /^(?:\+250|0)?7[2398]\d{7}$/;
  if (rwRegex.test(trimmed)) {
    const digits = trimmed.replace(/^(?:\+250|0)/, '');
    return { valid: true, formatted: `+250 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}` };
  }

  return {
    valid: false,
    formatted: trimmed,
    error: 'Invalid Rwanda phone number. Use format: +250 7XX XXX XXX or 07XXXXXXXX',
  };
}

export default function AddPersonForm({ open, onOpenChange, onCreated }: AddPersonFormProps) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [teamMembers, setTeamMembers] = useState<TeamMemberOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const supabase = createClient();

  useEffect(() => {
    async function loadTeam() {
      const { data } = await supabase
        .from('team_members')
        .select('id, full_name')
        .order('full_name', { ascending: true });
      if (data) {
        setTeamMembers(data);
      }
    }
    if (open) {
      loadTeam();
    }
  }, [open, supabase]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key === 'phone') setPhoneError('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
    setError('');

    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData?.session?.user;
    if (!user) {
      setError('Not authenticated.');
      setSubmitting(false);
      return;
    }

    let registeredById: string | null = null;
    try {
      const { data: member } = await supabase
        .from('team_members')
        .select('id')
        .eq('auth_user_id', user.id)
        .maybeSingle();
      registeredById = member?.id ?? null;
    } catch {
      // Offline / network fallback
    }

    const { error: err } = await supabase.from('people').insert({
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      gender: form.gender || null,
      phone: phoneValidation.formatted,
      location: form.location.trim() || null,
      hbf_group: form.hbf_group.trim() || null,
      category: form.category,
      follow_up_status: form.follow_up_status,
      assigned_to: form.assigned_to || null,
      age_group: form.age_group || null,
      m1_status: form.m1_status || null,
      how_found_church: form.how_found_church.trim() || null,
      baptism_status: form.baptism_status || null,
      contact_preference: form.contact_preference || null,
      notes: form.notes.trim() || null,
      registered_by: registeredById,
    });

    setSubmitting(false);

    if (err) {
      setError(err.message);
      return;
    }

    setForm(emptyForm);
    onCreated();
    onOpenChange(false);
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
                <FormField label="Preferred Contact Method">
                  <Select value={form.contact_preference} onValueChange={(v) => set('contact_preference', v ?? '')}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select contact method" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="WhatsApp">WhatsApp</SelectItem>
                      <SelectItem value="SMS">SMS</SelectItem>
                      <SelectItem value="Both">Both (WhatsApp & SMS)</SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
              </div>
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
                <FormField label="HBF Group (Home Bible Fellowship)">
                  <Input
                    value={form.hbf_group}
                    onChange={(e) => set('hbf_group', e.target.value)}
                    placeholder="e.g. Remera HBF, Kicukiro HBF"
                  />
                </FormField>
              </div>
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
            </div>

            {/* Section 5: Follow-up Assignment & Notes */}
            <div className="space-y-2 border-t pt-3">
              <Label className="text-xs font-semibold text-foreground">
                Ministry Assignment & Follow-up
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormField label="Assigned Follow-up Person">
                  <Select value={form.assigned_to} onValueChange={(v) => set('assigned_to', v ?? '')}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Assign team member" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Unassigned</SelectItem>
                      {teamMembers.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
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
