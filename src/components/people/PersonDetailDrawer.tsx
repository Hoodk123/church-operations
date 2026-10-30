import { useState, useEffect, useMemo } from 'react';
import {
  User,
  MapPin,
  Phone,
  CircleCheck,
  BookOpen,
  Droplets,
  MessageSquare,
  Mail,
  Calendar,
  Users,
  Compass,
  FileText,
  Clock,
  History,
} from 'lucide-react';
import {
  getPersonDetail,
  updatePerson,
  assignPerson,
  deletePerson,
  listTeamMembers,
} from '@/lib/api/people';
import { useShellMember } from '@/components/layout/shell';
import { type SelectOption } from '@/lib/select-items';
import LogContactSheet from '@/components/followups/LogContactSheet';
import { MarkNewConvertButton } from './MarkNewConvertButton';
import {
  contactLogApiToRow,
  personApiToRow,
  teamMemberToOption,
  enumReq,
  enumOrNull,
} from './adapt';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
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
  needsPastorColor,
  contactPreferenceOptions,
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

const OUTCOME_COLORS: Record<string, string> = {
  Reached: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800',
  'No answer': 'bg-neutral-100 text-neutral-800 border-neutral-200 dark:bg-neutral-900/30 dark:text-neutral-400 dark:border-neutral-800',
  'Scheduled visit': 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800',
  'Needs pastor': needsPastorColor,
  'Wrong number': 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',
};

export interface ContactLogRow {
  id: string;
  contacted_at: string;
  method: string;
  outcome: string;
  note: string | null;
  logged_by: { full_name: string } | null;
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
  const [contactLog, setContactLog] = useState<ContactLogRow[]>([]);
  const [logOpen, setLogOpen] = useState(false);
  const [editNeedsM1, setEditNeedsM1] = useState(false);
  const [editNeedsBaptism, setEditNeedsBaptism] = useState(false);
  const [enrolledClass, setEnrolledClass] = useState<{ title: string; status: string } | null>(null);
  const member = useShellMember();
  const memberId = member?.id ?? '';

  const teamItems = useMemo<SelectOption[]>(
    () => [
      { value: '', label: 'Unassigned' },
      ...teamMembers.map((m) => ({ value: m.id, label: m.full_name })),
    ],
    [teamMembers]
  );

  useEffect(() => {
    if (open) {
      void listTeamMembers()
        .then((data) => setTeamMembers(data.map(teamMemberToOption)))
        .catch(() => {/* keep current list on failure */});
    }
  }, [open]);

  useEffect(() => {
    const id = person?.id;
    if (!open || !id) {
      setEnrolledClass(null);
      return;
    }
    let active = false;
    void getPersonDetail(id)
      .then((detail) => {
        if (active) return;
        setContactLog(detail.contactLogs.map(contactLogApiToRow));
        const le = detail.latestEnrollment;
        setEnrolledClass(le && le.classTitle ? { title: le.classTitle, status: le.status } : null);
      })
      .catch(() => {/* keep stale history on failure */});
    return () => {
      active = true;
    };
  }, [open, person]);

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
      email: p.email ?? '',
      address_details: p.address_details ?? '',
      notes: p.notes ?? '',
    });
    setEditNeedsM1(p.needs_m1);
    setEditNeedsBaptism(p.needs_baptism);
    setEditing(true);
    setError('');
  }

  function cancelEdit() {
    setEditing(false);
    setEditForm({});
    setEditNeedsM1(false);
    setEditNeedsBaptism(false);
    setError('');
  }

  async function saveEdit() {
    if (!editForm.first_name?.trim() || !editForm.last_name?.trim()) {
      setError('First name and last name are required.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      await updatePerson(personId, {
        firstName: editForm.first_name.trim(),
        lastName: editForm.last_name.trim(),
        gender: enumReq(genders, editForm.gender || null),
        ageGroup: enumOrNull(ageGroups, editForm.age_group),
        phone: editForm.phone.trim(),
        location: editForm.location.trim() || null,
        hbfGroup: editForm.hbf_group.trim() || null,
        category: enumReq(categories, editForm.category),
        m1Status: enumOrNull(m1Statuses, editForm.m1_status),
        baptismStatus: enumOrNull(baptismStatuses, editForm.baptism_status),
        howFoundChurch: editForm.how_found_church.trim() || null,
        followUpStatus: enumReq(followUpStatuses, editForm.follow_up_status),
        contactPreference: enumOrNull(contactPreferenceOptions, editForm.contact_preference),
        email: editForm.email.trim() || null,
        addressDetails: editForm.address_details.trim() || null,
        needsM1: editNeedsM1,
        needsBaptism: editNeedsBaptism,
        notes: editForm.notes.trim() || null,
      });
      // Changing the assignee is a separate action (setAssign) that stamps
      // assignedAt/assignedBy; skip it when the value did not change.
      if (editForm.assigned_to !== (p.assigned_to ?? '')) {
        await assignPerson(personId, editForm.assigned_to || null);
      }
      // Re-fetch so the parent gets the whole row with names filled in,
      // exactly like the old single round-trip did.
      const detail = await getPersonDetail(personId);
      onUpdated(personApiToRow(detail.person));
      setEditing(false);
      setEditForm({});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deletePerson(personId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete');
      setDeleteOpen(false);
      return;
    } finally {
      setDeleting(false);
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
                <div className="flex flex-wrap items-center gap-1.5 pr-6">
                  {p.category !== 'New Convert' && (
                    <MarkNewConvertButton
                      person={p}
                      className="h-7 text-xs"
                      onSaved={() =>
                        onUpdated({ ...p, category: 'New Convert', needs_pastor: true })
                      }
                    />
                  )}
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
                    <FormField label="Email">
                      <Input
                        type="email"
                        value={editForm.email}
                        onChange={(e) => setFormField('email', e.target.value)}
                        className="h-8 text-sm"
                        placeholder="name@example.com"
                      />
                    </FormField>
                  </div>

                  <FormField label="Preferred Contact">
                    <ToggleGroup
                      variant="outline"
                      className="w-full"
                      value={editForm.contact_preference ? [editForm.contact_preference] : []}
                      onValueChange={(v) => setFormField('contact_preference', v[0] ?? '')}
                    >
                      {contactPreferenceOptions.map((method) => {
                        const needsEmail = method === 'Email';
                        const disabled = needsEmail
                          ? !editForm.email?.trim()
                          : !editForm.phone?.trim();
                        return (
                          <ToggleGroupItem
                            key={method}
                            value={method}
                            disabled={disabled}
                            className="flex-1 text-xs"
                          >
                            {method}
                          </ToggleGroupItem>
                        );
                      })}
                    </ToggleGroup>
                  </FormField>

                  <div className="grid grid-cols-2 gap-3">
                    <FormField label="Location">
                      <Input
                        value={editForm.location}
                        onChange={(e) => setFormField('location', e.target.value)}
                        className="h-8 text-sm"
                        placeholder="e.g. Kigali"
                      />
                    </FormField>
                    <FormField label="Address details">
                      <Input
                        value={editForm.address_details}
                        onChange={(e) => setFormField('address_details', e.target.value)}
                        className="h-8 text-sm"
                        placeholder="Street, landmark"
                      />
                    </FormField>
                  </div>

                  <FormField label="HBF Group">
                    <Input
                      value={editForm.hbf_group}
                      onChange={(e) => setFormField('hbf_group', e.target.value)}
                      className="h-8 text-sm"
                      placeholder="e.g. Remera HBF"
                    />
                  </FormField>

                  <FormField label="How Found Church / Invited by">
                    <Input
                      value={editForm.how_found_church}
                      onChange={(e) => setFormField('how_found_church', e.target.value)}
                      className="h-8 text-sm"
                      placeholder="e.g. Friend, Outreach"
                    />
                  </FormField>

                  <div className="flex items-center justify-between rounded-md border p-2.5">
                    <span className="text-xs font-medium">Needs M1 class</span>
                    <Switch
                      checked={editNeedsM1}
                      onCheckedChange={(checked) => setEditNeedsM1(checked)}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-md border p-2.5">
                    <span className="text-xs font-medium">Needs baptism</span>
                    <Switch
                      checked={editNeedsBaptism}
                      onCheckedChange={(checked) => setEditNeedsBaptism(checked)}
                    />
                  </div>
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
                      <Select items={teamItems} value={editForm.assigned_to} onValueChange={(v) => setFormField('assigned_to', v ?? '')}>
                        <SelectTrigger className="h-8 w-full">
                          <SelectValue placeholder="Unassigned" />
                        </SelectTrigger>
                        <SelectContent>
                          {teamItems.map((m) => (
                            <SelectItem key={m.value || 'unassigned'} value={m.value}>{m.label}</SelectItem>
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
                    {saving && <Spinner className="size-4" />}
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
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-semibold">
                      {p.first_name} {p.last_name}
                    </h3>
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {enrolledClass && (
                        <Badge variant="outline" className="border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                          {enrolledClass.title}
                        </Badge>
                      )}
                      <Badge variant="outline" className={categoryColors[p.category] ?? ''}>
                        {p.category}
                      </Badge>
                    </div>
                  </div>

                  <div className="space-y-0.5 border-t pt-2">
                    <DetailRow icon={Phone} label="Phone" value={p.phone ?? '—'} />
                    <DetailRow icon={Mail} label="Email" value={p.email ?? '—'} />
                    <DetailRow icon={MessageSquare} label="Preferred contact" value={p.contact_preference ?? '—'} />
                    <DetailRow icon={User} label="Gender" value={p.gender ?? '—'} />
                    <DetailRow icon={Users} label="Age Group" value={p.age_group ?? '—'} />
                    <DetailRow icon={MapPin} label="Location" value={p.location ?? '—'} />
                    <DetailRow icon={MapPin} label="Address details" value={p.address_details ?? '—'} />
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

                {/* Card 3 — Contact History */}
                <div className="border rounded-lg p-4 space-y-3 bg-card">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Contact History
                    </h3>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setLogOpen(true)}
                      className="h-7 text-xs cursor-pointer"
                    >
                      Log contact
                    </Button>
                  </div>
                  {contactLog.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">
                      No contacts logged yet.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {contactLog.map((log) => (
                        <div key={log.id} className="space-y-1 rounded-md border bg-muted/20 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5 text-xs font-medium">
                              <History className="size-3.5 shrink-0 text-muted-foreground" />
                              {log.method}
                            </span>
                            <Badge
                              variant="outline"
                              className={OUTCOME_COLORS[log.outcome] ?? ''}
                            >
                              {log.outcome}
                            </Badge>
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            {formatDate(log.contacted_at)} ·{' '}
                            {log.logged_by?.full_name ?? 'Team member'}
                          </p>
                          {log.note && (
                            <p className="whitespace-pre-wrap rounded-md bg-muted/40 p-2 text-xs">
                              {log.note}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <LogContactSheet
        open={logOpen}
        onOpenChange={setLogOpen}
        personId={personId}
        personName={`${p.first_name} ${p.last_name}`}
        memberId={memberId}
        onSaved={() => {
          void getPersonDetail(personId)
            .then((detail) => setContactLog(detail.contactLogs.map(contactLogApiToRow)))
            .catch(() => {/* keep current log on failure */});
        }}
      />

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
              {deleting && <Spinner className="size-4" />}
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
