import { useState } from 'react';
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
import { categories, followUpStatuses, ageGroups, genders, m1Statuses, baptismStatuses } from './constants';

interface AddPersonFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

interface FormState {
  first_name: string;
  last_name: string;
  gender: string;
  phone: string;
  location: string;
  category: string;
  follow_up_status: string;
  age_group: string;
  m1_status: string;
  how_found_church: string;
  baptism_status: string;
  contact_preference: string;
}

const emptyForm: FormState = {
  first_name: '',
  last_name: '',
  gender: '',
  phone: '',
  location: '',
  category: 'Visitor',
  follow_up_status: 'Not Started',
  age_group: '',
  m1_status: '',
  how_found_church: '',
  baptism_status: '',
  contact_preference: '',
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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const supabase = createClient();

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

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError('Not authenticated.');
      setSubmitting(false);
      return;
    }

    const { data: member } = await supabase
      .from('team_members')
      .select('id')
      .eq('auth_user_id', user.id)
      .single();

    const { error: err } = await supabase.from('people').insert({
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      gender: form.gender || null,
      phone: phoneValidation.formatted,
      location: form.location.trim() || null,
      category: form.category,
      follow_up_status: form.follow_up_status,
      age_group: form.age_group || null,
      m1_status: form.m1_status || null,
      how_found_church: form.how_found_church.trim() || null,
      baptism_status: form.baptism_status || null,
      contact_preference: form.contact_preference || null,
      registered_by: member?.id ?? null,
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

  const showBaptism = form.category === 'New Convert' || form.category === 'M1 Class';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Register New Person</DialogTitle>
        </DialogHeader>

        <ScrollArea className="w-full max-h-[70vh] pr-3">
          <form onSubmit={handleSubmit} className="space-y-3">
          {error && (
            <p className="text-xs text-destructive bg-destructive/10 rounded-md px-2 py-1.5">
              {error}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <FormField label="First name *">
              <Input
                value={form.first_name}
                onChange={(e) => set('first_name', e.target.value)}
                placeholder="John"
              />
            </FormField>
            <FormField label="Last name *">
              <Input
                value={form.last_name}
                onChange={(e) => set('last_name', e.target.value)}
                placeholder="Doe"
              />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Gender">
              <Select value={form.gender} onValueChange={(v) => set('gender', v ?? '')}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {genders.map((g) => (
                    <SelectItem key={g} value={g}>{g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Age group">
              <Select value={form.age_group} onValueChange={(v) => set('age_group', v ?? '')}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {ageGroups.map((a) => (
                    <SelectItem key={a} value={a}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </div>

          <FormField label="Phone *">
            <Input
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              placeholder="+250 7XX XXX XXX"
            />
            {phoneError && (
              <p className="text-[11px] text-destructive mt-1">{phoneError}</p>
            )}
          </FormField>

          <FormField label="Location">
            <Input
              value={form.location}
              onChange={(e) => set('location', e.target.value)}
              placeholder="Kigali, Rwanda"
            />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
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
            <FormField label="Follow-up status">
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

          <FormField label="How did they find the church?">
            <Input
              value={form.how_found_church}
              onChange={(e) => set('how_found_church', e.target.value)}
              placeholder="e.g. Friend, Social media, Walk-in"
            />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="M1 Status">
              <Select value={form.m1_status} onValueChange={(v) => set('m1_status', v ?? '')}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {m1Statuses.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            {showBaptism && (
              <FormField label="Baptism Status">
                <Select value={form.baptism_status} onValueChange={(v) => set('baptism_status', v ?? '')}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {baptismStatuses.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            )}
          </div>

          <FormField label="How to reach you?">
            <Select value={form.contact_preference} onValueChange={(v) => set('contact_preference', v ?? '')}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select preferred contact method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="WhatsApp">WhatsApp</SelectItem>
                <SelectItem value="SMS">SMS</SelectItem>
                <SelectItem value="Both">Both (WhatsApp & SMS)</SelectItem>
              </SelectContent>
            </Select>
          </FormField>

          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? 'Saving...' : 'Register person'}
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
