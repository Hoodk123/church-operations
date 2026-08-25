import { useState } from 'react';
import { User, MapPin, Phone, Tag, CircleCheck, BookOpen, Droplets, MessageSquare } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { categoryColors, followUpStatusColors, categories, followUpStatuses, baptismStatuses } from './constants';
import type { Person } from './columns';

function formatDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(dateStr));
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

interface PersonDetailDrawerProps {
  person: Person | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: (person: Person) => void;
}

export default function PersonDetailDrawer({
  person,
  open,
  onOpenChange,
  onUpdated,
}: PersonDetailDrawerProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState('');
  const supabase = createClient();

  if (!person) return null;

  const personId = person.id;

  async function updateField(field: string, value: string | null) {
    setError('');
    const { data, error: err } = await supabase
      .from('people')
      .update({ [field]: value })
      .eq('id', personId)
      .select('*, assigned_to_name:team_members!people_assigned_to_fkey(full_name)')
      .single();

    if (err) {
      setError(err.message);
      return;
    }

    onUpdated({
      ...data,
      assigned_to_name: data.assigned_to_name?.full_name ?? null,
    });
    setEditing(null);
  }

  const showBaptism = person.category === 'New Convert' || person.category === 'M1 Class';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:w-[420px] p-0 overflow-y-auto">
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle>
            {person.first_name} {person.last_name}
          </SheetTitle>
        </SheetHeader>

        <div className="p-4 space-y-4">
          {error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {/* Card 1 — Identity */}
          <div className="border rounded-lg p-4 space-y-1">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Identity
            </h3>
            <DetailRow
              icon={User}
              label="Name"
              value={`${person.first_name} ${person.last_name}`}
            />
            <DetailRow icon={User} label="Gender" value={person.gender} />
            {person.age_group && (
              <DetailRow icon={User} label="Age Group" value={person.age_group} />
            )}
            <DetailRow icon={Phone} label="Phone" value={person.phone} />
            <DetailRow
              icon={MapPin}
              label="Location"
              value={person.location ?? <span className="text-muted-foreground">—</span>}
            />
          </div>

          {/* Card 2 — Church Journey */}
          <div className="border rounded-lg p-4 space-y-1">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Church Journey
            </h3>
            <DetailRow
              icon={Tag}
              label="Category"
              value={
                editing === 'category' ? (
                  <Select
                    value={person.category}
                    onValueChange={(v) => updateField('category', v)}
                  >
                    <SelectTrigger className="h-7 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge
                    variant="outline"
                    className={`${categoryColors[person.category] ?? ''} cursor-pointer`}
                    onClick={() => setEditing('category')}
                  >
                    {person.category}
                  </Badge>
                )
              }
            />
            <DetailRow
              icon={CircleCheck}
              label="M1 Status"
              value={person.m1_status ?? <span className="text-muted-foreground">—</span>}
            />
            <DetailRow
              icon={BookOpen}
              label="HBF Group"
              value={person.hbf_group ?? <span className="text-muted-foreground">Not yet assigned</span>}
            />
            {showBaptism && (
              <DetailRow
                icon={Droplets}
                label="Baptism Status"
                value={
                  editing === 'baptism_status' ? (
                    <Select
                      value={person.baptism_status ?? ''}
                      onValueChange={(v) => updateField('baptism_status', v || null)}
                    >
                      <SelectTrigger className="h-7 w-full">
                        <SelectValue placeholder="Not set" />
                      </SelectTrigger>
                      <SelectContent>
                        {baptismStatuses.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span
                      className="cursor-pointer hover:underline"
                      onClick={() => setEditing('baptism_status')}
                    >
                      {person.baptism_status ?? <span className="text-muted-foreground">Not set</span>}
                    </span>
                  )
                }
              />
            )}
          </div>

          {/* Card 3 — Follow-up */}
          <div className="border rounded-lg p-4 space-y-1">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Follow-up
            </h3>
            <DetailRow
              icon={CircleCheck}
              label="Follow-up Status"
              value={
                editing === 'follow_up_status' ? (
                  <Select
                    value={person.follow_up_status}
                    onValueChange={(v) => updateField('follow_up_status', v)}
                  >
                    <SelectTrigger className="h-7 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {followUpStatuses.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge
                    variant="outline"
                    className={`${followUpStatusColors[person.follow_up_status] ?? ''} cursor-pointer`}
                    onClick={() => setEditing('follow_up_status')}
                  >
                    {person.follow_up_status}
                  </Badge>
                )
              }
            />
            <DetailRow
              icon={User}
              label="Assigned To"
              value={
                person.assigned_to_name ?? <span className="text-muted-foreground">Unassigned</span>
              }
            />
            <DetailRow
              icon={MessageSquare}
              label="Last Contact"
              value={
                person.last_contact_date ? (
                  formatDate(person.last_contact_date)
                ) : (
                  <span className="text-amber-600 dark:text-amber-400">Never contacted</span>
                )
              }
            />
            {person.notes && (
              <DetailRow
                icon={MessageSquare}
                label="Notes"
                value={<p className="whitespace-pre-wrap text-sm">{person.notes}</p>}
              />
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
