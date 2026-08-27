import { useState } from 'react';
import {
  User,
  MapPin,
  Phone,
  CircleCheck,
  BookOpen,
  Droplets,
  MessageSquare,
  Calendar,
  Users,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
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
import {
  categoryColors,
  followUpStatusColors,
  categories,
  baptismStatuses,
  m1Statuses,
  genders,
  ageGroups,
} from './constants';
import type { Person } from './columns';

function formatDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(dateStr));
}

interface PersonDetailDrawerProps {
  person: Person | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: (person: Person) => void;
  onDeleted: (id: string) => void;
}

export default function PersonDetailDrawer({
  person,
  open,
  onOpenChange,
  onUpdated,
  onDeleted,
}: PersonDetailDrawerProps) {
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const supabase = createClient();

  if (!person) return null;

  const p: Person = person;
  const personId = p.id;
  const showBaptism =
    person.category === 'New Convert' || person.category === 'M1 Class';

  function startEdit() {
    setEditForm({
      first_name: p.first_name,
      last_name: p.last_name,
      gender: p.gender ?? '',
      phone: p.phone ?? '',
      location: p.location ?? '',
      category: p.category,
      m1_status: p.m1_status ?? '',
      hbf_group: p.hbf_group ?? '',
      baptism_status: p.baptism_status ?? '',
    });
    setEditing(true);
    setError('');
  }

  function cancelEdit() {
    setEditing(false);
    setEditForm({});
    setError('');
  }

  async function saveEdit() {
    setSaving(true);
    setError('');

    const { data, error: err } = await supabase
      .from('people')
      .update({
        first_name: editForm.first_name.trim(),
        last_name: editForm.last_name.trim(),
        gender: editForm.gender || null,
        phone: editForm.phone.trim(),
        location: editForm.location.trim() || null,
        category: editForm.category,
        m1_status: editForm.m1_status || null,
        hbf_group: editForm.hbf_group.trim() || null,
        baptism_status: editForm.baptism_status || null,
      })
      .eq('id', personId)
      .select(
        '*, assigned_to_name:team_members!people_assigned_to_fkey(full_name), registered_by_name:team_members!people_registered_by_fkey(full_name)'
      )
      .single();

    setSaving(false);

    if (err) {
      setError(err.message);
      return;
    }

    onUpdated({
      ...data,
      assigned_to_name: data.assigned_to_name?.full_name ?? null,
      registered_by_name: data.registered_by_name?.full_name ?? null,
    });
    setEditing(false);
    setEditForm({});
  }

  async function handleDelete() {
    setDeleting(true);
    const { error: err } = await supabase
      .from('people')
      .delete()
      .eq('id', personId);
    setDeleting(false);

    if (err) {
      setError(err.message);
      setDeleteOpen(false);
      return;
    }

    onDeleted(personId);
  }

  function setFormField(key: string, value: string) {
    setEditForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:w-[420px] p-0 overflow-y-auto">
          <SheetHeader className="border-b px-4 py-3">
            <SheetTitle>
              {p.first_name} {p.last_name}
            </SheetTitle>
          </SheetHeader>

          <div className="p-4 space-y-4">
            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            {/* Card 1 — Person Profile */}
            <div className="border rounded-lg p-4 space-y-3">
              {editing ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField label="First name">
                      <Input
                        value={editForm.first_name}
                        onChange={(e) => setFormField('first_name', e.target.value)}
                        className="h-8 text-sm"
                      />
                    </FormField>
                    <FormField label="Last name">
                      <Input
                        value={editForm.last_name}
                        onChange={(e) => setFormField('last_name', e.target.value)}
                        className="h-8 text-sm"
                      />
                    </FormField>
                  </div>
                  <FormField label="Category">
                    <Select value={editForm.category} onValueChange={(v) => setFormField('category', v ?? 'Visitor')}>
                      <SelectTrigger className="h-8 w-full">
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
                    <FormField label="Gender">
                      <Select value={editForm.gender} onValueChange={(v) => setFormField('gender', v ?? '')}>
                        <SelectTrigger className="h-8 w-full">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                          {genders.map((g) => (
                            <SelectItem key={g} value={g}>{g}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormField>
                    <FormField label="Age Group">
                      <Select value={editForm.age_group ?? ''} onValueChange={(v) => setFormField('age_group', v ?? '')}>
                        <SelectTrigger className="h-8 w-full">
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
                      value={editForm.phone}
                      onChange={(e) => setFormField('phone', e.target.value)}
                      className="h-8 text-sm"
                    />
                  </FormField>
                  <FormField label="Location">
                    <Input
                      value={editForm.location}
                      onChange={(e) => setFormField('location', e.target.value)}
                      className="h-8 text-sm"
                    />
                  </FormField>
                  <FormField label="M1 Status">
                    <Select value={editForm.m1_status} onValueChange={(v) => setFormField('m1_status', v ?? '')}>
                      <SelectTrigger className="h-8 w-full">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {m1Statuses.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>
                  <FormField label="HBF Group">
                    <Input
                      value={editForm.hbf_group}
                      onChange={(e) => setFormField('hbf_group', e.target.value)}
                      className="h-8 text-sm"
                    />
                  </FormField>
                  {showBaptism && (
                    <FormField label="Baptism Status">
                      <Select value={editForm.baptism_status} onValueChange={(v) => setFormField('baptism_status', v ?? '')}>
                        <SelectTrigger className="h-8 w-full">
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
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" onClick={saveEdit} disabled={saving} className="flex-1">
                      {saving ? 'Saving...' : 'Save'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={cancelEdit} className="flex-1">
                      Cancel
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <h3 className="text-base font-semibold">
                    {p.first_name} {p.last_name}
                  </h3>
                  <Badge variant="outline" className={categoryColors[p.category] ?? ''}>
                    {p.category}
                  </Badge>

                  <div className="space-y-0">
                    <DetailRow icon={User} label="Gender" value={p.gender ?? '—'} />
                    <DetailRow icon={Users} label="Age Group" value={p.age_group ?? '—'} />
                    <DetailRow icon={Phone} label="Phone" value={p.phone ?? '—'} />
                    <DetailRow icon={MapPin} label="Location" value={p.location ?? '—'} />
                    <DetailRow icon={CircleCheck} label="M1 Status" value={p.m1_status ?? '—'} />
                    <DetailRow
                      icon={BookOpen}
                      label="HBF Group"
                      value={p.hbf_group ?? 'Not yet assigned'}
                    />
                    {showBaptism && (
                      <DetailRow
                        icon={Droplets}
                        label="Baptism Status"
                        value={p.baptism_status ?? 'Not set'}
                      />
                    )}
                  </div>

                  <div className="flex gap-2 pt-2 border-t">
                    <Button size="sm" variant="outline" onClick={startEdit} className="flex-1">
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => setDeleteOpen(true)}
                      className="flex-1"
                    >
                      Delete
                    </Button>
                  </div>
                </>
              )}
            </div>

            {/* Card 2 — Record Info */}
            <div className="border rounded-lg p-4 space-y-0">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Record Info
              </h3>
              <DetailRow
                icon={User}
                label="Registered by"
                value={p.registered_by_name ?? '—'}
              />
              <DetailRow
                icon={Calendar}
                label="Date registered"
                value={formatDate(p.date_registered) ?? '—'}
              />
              <DetailRow
                icon={User}
                label="Assigned to"
                value={p.assigned_to_name ?? 'Unassigned'}
              />
              <DetailRow
                icon={CircleCheck}
                label="Follow-up status"
                value={
                  <Badge variant="outline" className={followUpStatusColors[p.follow_up_status] ?? ''}>
                    {p.follow_up_status}
                  </Badge>
                }
              />
              <DetailRow
                icon={MessageSquare}
                label="Last contact"
                value={
                  p.last_contact_date ? (
                    formatDate(p.last_contact_date)
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400">Never contacted</span>
                  )
                }
              />
              {p.contact_preference && (
                <DetailRow
                  icon={MessageSquare}
                  label="Preferred contact"
                  value={p.contact_preference}
                />
              )}
              {p.notes && (
                <DetailRow
                  icon={MessageSquare}
                  label="Notes"
                  value={<p className="whitespace-pre-wrap text-sm">{p.notes}</p>}
                />
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {p.first_name} {p.last_name}'s record?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. The person's record will be permanently
              removed from the database.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-2">
      <Icon className="size-4 mt-0.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="text-sm">{value}</div>
      </div>
    </div>
  );
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
