import { useState, useEffect } from 'react';
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
  Compass,
  FileText,
  Clock,
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
  followUpStatuses,
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

interface TeamMemberOption {
  id: string;
  full_name: string;
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
  const [teamMembers, setTeamMembers] = useState<TeamMemberOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
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

  if (!person) return null;

  const p: Person = person;
  const personId = p.id;

  function startEdit() {
    setEditForm({
      first_name: p.first_name,
      last_name: p.last_name,
      gender: p.gender ?? '',
      age_group: p.age_group ?? '',
      phone: p.phone ?? '',
      location: p.location ?? '',
      hbf_group: p.hbf_group ?? '',
      category: p.category,
      m1_status: p.m1_status ?? '',
      baptism_status: p.baptism_status ?? '',
      how_found_church: p.how_found_church ?? '',
      assigned_to: p.assigned_to ?? '',
      follow_up_status: p.follow_up_status ?? 'Not Started',
      contact_preference: p.contact_preference ?? '',
      notes: p.notes ?? '',
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
    if (!editForm.first_name?.trim() || !editForm.last_name?.trim()) {
      setError('First name and last name are required.');
      return;
    }

    setSaving(true);
    setError('');

    const { data, error: err } = await supabase
      .from('people')
      .update({
        first_name: editForm.first_name.trim(),
        last_name: editForm.last_name.trim(),
        gender: editForm.gender || null,
        age_group: editForm.age_group || null,
        phone: editForm.phone.trim(),
        location: editForm.location.trim() || null,
        hbf_group: editForm.hbf_group.trim() || null,
        category: editForm.category,
        m1_status: editForm.m1_status || null,
        baptism_status: editForm.baptism_status || null,
        how_found_church: editForm.how_found_church.trim() || null,
        assigned_to: editForm.assigned_to || null,
        follow_up_status: editForm.follow_up_status,
        contact_preference: editForm.contact_preference || null,
        notes: editForm.notes.trim() || null,
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
        <SheetContent side="right" className="w-full sm:w-[480px] p-0 overflow-y-auto">
          <SheetHeader className="border-b px-4 py-3 sticky top-0 bg-background z-10">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-base font-semibold">
                {editing ? 'Edit Person Details' : `${p.first_name} ${p.last_name}`}
              </SheetTitle>
              {!editing && (
                <div className="flex items-center gap-1.5 pr-6">
                  <Button size="sm" variant="outline" onClick={startEdit} className="h-7 text-xs cursor-pointer">
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => setDeleteOpen(true)}
                    className="h-7 text-xs cursor-pointer"
                  >
                    Delete
                  </Button>
                </div>
              )}
            </div>
          </SheetHeader>

          <div className="p-4 space-y-4">
            {error && (
              <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2 font-medium">
                {error}
              </p>
            )}

            {editing ? (
              /* ==================== EDIT FORM ==================== */
              <div className="space-y-4">
                {/* Profile Card Edit */}
                <div className="border rounded-lg p-4 space-y-3 bg-card">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Profile Information
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField label="First name *">
                      <Input
                        value={editForm.first_name}
                        onChange={(e) => setFormField('first_name', e.target.value)}
                        className="h-8 text-sm"
                        required
                      />
                    </FormField>
                    <FormField label="Last name *">
                      <Input
                        value={editForm.last_name}
                        onChange={(e) => setFormField('last_name', e.target.value)}
                        className="h-8 text-sm"
                        required
                      />
                    </FormField>
                  </div>

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
                      <Select value={editForm.age_group} onValueChange={(v) => setFormField('age_group', v ?? '')}>
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

                  <div className="grid grid-cols-2 gap-3">
                    <FormField label="Phone Number *">
                      <Input
                        value={editForm.phone}
                        onChange={(e) => setFormField('phone', e.target.value)}
                        className="h-8 text-sm"
                        required
                      />
                    </FormField>
                    <FormField label="Preferred Contact">
                      <Select value={editForm.contact_preference} onValueChange={(v) => setFormField('contact_preference', v ?? '')}>
                        <SelectTrigger className="h-8 w-full">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="WhatsApp">WhatsApp</SelectItem>
                          <SelectItem value="SMS">SMS</SelectItem>
                          <SelectItem value="Both">Both (WhatsApp & SMS)</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormField>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <FormField label="Location">
                      <Input
                        value={editForm.location}
                        onChange={(e) => setFormField('location', e.target.value)}
                        className="h-8 text-sm"
                        placeholder="e.g. Kigali"
                      />
                    </FormField>
                    <FormField label="HBF Group">
                      <Input
                        value={editForm.hbf_group}
                        onChange={(e) => setFormField('hbf_group', e.target.value)}
                        className="h-8 text-sm"
                        placeholder="e.g. Remera HBF"
                      />
                    </FormField>
                  </div>

                  <FormField label="How Found Church / Invited by">
                    <Input
                      value={editForm.how_found_church}
                      onChange={(e) => setFormField('how_found_church', e.target.value)}
                      className="h-8 text-sm"
                      placeholder="e.g. Friend, Outreach"
                    />
                  </FormField>
                </div>

                {/* Journey & Follow-up Edit */}
                <div className="border rounded-lg p-4 space-y-3 bg-card">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Category, Journey & Follow-up
                  </h3>

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
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <FormField label="Assigned Follow-up Person">
                      <Select value={editForm.assigned_to} onValueChange={(v) => setFormField('assigned_to', v ?? '')}>
                        <SelectTrigger className="h-8 w-full">
                          <SelectValue placeholder="Unassigned" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">Unassigned</SelectItem>
                          {teamMembers.map((m) => (
                            <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormField>

                    <FormField label="Follow-up Status">
                      <Select value={editForm.follow_up_status} onValueChange={(v) => setFormField('follow_up_status', v ?? 'Not Started')}>
                        <SelectTrigger className="h-8 w-full">
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

                  <FormField label="Notes / Comments">
                    <textarea
                      value={editForm.notes}
                      onChange={(e) => setFormField('notes', e.target.value)}
                      placeholder="Notes, prayer requests, or follow-up logs..."
                      rows={3}
                      className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                    />
                  </FormField>
                </div>

                <div className="flex gap-2 pt-1">
                  <Button size="sm" onClick={saveEdit} disabled={saving} className="flex-1 cursor-pointer">
                    {saving ? 'Saving...' : 'Save Changes'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={cancelEdit} className="flex-1 cursor-pointer">
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              /* ==================== VIEW MODE ==================== */
              <>
                {/* Card 1 — Person Profile */}
                <div className="border rounded-lg p-4 space-y-3 bg-card">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold">
                      {p.first_name} {p.last_name}
                    </h3>
                    <Badge variant="outline" className={categoryColors[p.category] ?? ''}>
                      {p.category}
                    </Badge>
                  </div>

                  <div className="space-y-0.5 border-t pt-2">
                    <DetailRow icon={Phone} label="Phone" value={p.phone ?? '—'} />
                    <DetailRow icon={MessageSquare} label="Preferred contact" value={p.contact_preference ?? '—'} />
                    <DetailRow icon={User} label="Gender" value={p.gender ?? '—'} />
                    <DetailRow icon={Users} label="Age Group" value={p.age_group ?? '—'} />
                    <DetailRow icon={MapPin} label="Location" value={p.location ?? '—'} />
                    <DetailRow
                      icon={BookOpen}
                      label="HBF Group"
                      value={p.hbf_group ?? 'Not yet assigned'}
                    />
                    <DetailRow
                      icon={Compass}
                      label="How found church"
                      value={p.how_found_church ?? '—'}
                    />
                    <DetailRow
                      icon={Droplets}
                      label="Baptism Status"
                      value={p.baptism_status ?? 'Not set'}
                    />
                    <DetailRow
                      icon={CircleCheck}
                      label="M1 Status"
                      value={p.m1_status ?? 'Not set'}
                    />
                  </div>
                </div>

                {/* Card 2 — Record & Ministry Info */}
                <div className="border rounded-lg p-4 space-y-0.5 bg-card">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Record & Ministry Follow-up
                  </h3>
                  <DetailRow
                    icon={User}
                    label="Assigned to"
                    value={p.assigned_to_name ?? <span className="text-muted-foreground italic">Unassigned</span>}
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
                    icon={Clock}
                    label="Last contact"
                    value={
                      p.last_contact_date ? (
                        formatDate(p.last_contact_date)
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400">Never contacted</span>
                      )
                    }
                  />
                  <DetailRow
                    icon={FileText}
                    label="Notes / Comments"
                    value={
                      p.notes ? (
                        <p className="whitespace-pre-wrap text-xs text-foreground bg-muted/40 p-2 rounded-md border mt-0.5">
                          {p.notes}
                        </p>
                      ) : (
                        <span className="text-muted-foreground text-xs italic">No notes entered</span>
                      )
                    }
                  />
                </div>
              </>
            )}
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
    <div className="flex items-start gap-3 py-1.5">
      <Icon className="size-4 mt-0.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <div className="text-xs font-medium text-foreground">{value}</div>
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
      <Label className="text-xs text-muted-foreground font-medium">{label}</Label>
      {children}
    </div>
  );
}
