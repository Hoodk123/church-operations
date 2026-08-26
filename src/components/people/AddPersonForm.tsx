import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
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
import { categories, followUpStatuses, ageGroups, genders } from './constants';

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
};

export default function AddPersonForm({ open, onOpenChange, onCreated }: AddPersonFormProps) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const supabase = createClient();

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.first_name.trim() || !form.last_name.trim()) {
      setError('First name and last name are required.');
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
      phone: form.phone.trim(),
      location: form.location.trim() || null,
      category: form.category,
      follow_up_status: form.follow_up_status,
      age_group: form.age_group || null,
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
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Register New Person</DialogTitle>
        </DialogHeader>

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

          <FormField label="Phone">
            <Input
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              placeholder="+250..."
            />
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

          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? 'Saving...' : 'Register person'}
          </Button>
        </form>
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
