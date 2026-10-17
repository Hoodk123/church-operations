import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { MessageCircle, Plus, UserRound } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { rlsErrorMessage } from '@/lib/rls-error';
import { useShellMember } from '@/components/layout/shell';
import { venueLabel, personName, fmtDate, type M1Class, type M1Person } from '@/components/m1/m1';
import { fillTemplate } from '@/lib/templates';
import { fetchTemplate } from '@/components/classes/templates';
import { pickChannel, messageHref } from '@/lib/messaging';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Spinner } from '@/components/ui/spinner';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';

interface NeedsM1TabProps {
  klass: M1Class;
  isAdmin: boolean;
  onChanged: () => void;
}

export function NeedsM1Tab({ klass, isAdmin, onChanged }: NeedsM1TabProps) {
  const member = useShellMember();
  const supabase = createClient();

  const [waiting, setWaiting] = useState<M1Person[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reminding, setReminding] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.resolve(supabase.rpc('m1_waiting_list'))
      .then(({ data, error }) => {
        if (error) toast.error(rlsErrorMessage(error));
        else setWaiting((data ?? []) as M1Person[]);
      })
      .finally(() => setLoading(false));
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function enrollOne(person: M1Person): Promise<boolean> {
    const { error } = await supabase.from('m1_enrollments').insert({
      class_id: klass.id,
      person_id: person.id,
      enrolled_by: member?.id ?? null,
      walk_in: false,
      status: 'Enrolled',
    });
    if (error && error.code !== '23505') {
      toast.error(rlsErrorMessage(error));
      return false;
    }
    await supabase.from('people').update({ needs_m1: false }).eq('id', person.id);
    return true;
  }

  async function enroll(person: M1Person) {
    setBusy(true);
    const ok = await enrollOne(person);
    setBusy(false);
    if (ok) {
      toast.success(`${personName(person)} enrolled in ${klass.title}`);
      setWaiting((prev) => prev.filter((p) => p.id !== person.id));
      onChanged();
    }
  }

  async function enrollSelected() {
    const people = waiting.filter((p) => selected.has(p.id));
    if (people.length === 0) {
      toast.info('Choose who to enrol.');
      return;
    }
    setBusy(true);
    let count = 0;
    for (const person of people) {
      if (await enrollOne(person)) count += 1;
    }
    setBusy(false);
    toast.success(`Enrolled ${count} ${count === 1 ? 'person' : 'people'}`);
    setSelected(new Set());
    load();
    onChanged();
  }

  async function remind(person: M1Person) {
    const channel = pickChannel({
      phone: person.phone,
      email: person.email,
      contact_preference: person.contact_preference,
    });
    if (!channel) {
      toast.error('No phone or email on file.');
      return;
    }
    setReminding(person.id);
    const template = await fetchTemplate(supabase, 'm1_reminder');
    const body = fillTemplate(template?.body ?? '', {
      name: person.first_name,
      class: klass.title,
      venue: venueLabel(klass.venue),
      date: fmtDate(new Date().toISOString()),
      volunteer: member?.full_name ?? '',
    });
    const href = messageHref(
      channel,
      { phone: person.phone, email: person.email },
      { subject: `${klass.title} · starting soon`, body }
    );
    if (!href) {
      setReminding(null);
      toast.error('Could not open a message.');
      return;
    }
    window.open(href, '_blank', 'noopener');
    await supabase.from('m1_message_log').insert({
      class_id: klass.id,
      person_id: person.id,
      purpose: 'reminder',
      channel,
      sent_by: member?.id ?? null,
    });
    setReminding(null);
    toast.success(`Message ready for ${person.first_name}`);
  }

  const allSelected = useMemo(
    () => waiting.length > 0 && selected.size === waiting.length,
    [waiting, selected]
  );

  function toggle(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }

  if (waiting.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <UserRound />
          </EmptyMedia>
          <EmptyTitle>No one on the waiting list</EmptyTitle>
        </EmptyHeader>
        <EmptyContent>
          <EmptyDescription>
            Everyone flagged “Needs M1” is already enrolled or completed. Add new faces from the
            Add member button.
          </EmptyDescription>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-muted/40 px-3 py-2">
        <label className="flex items-center gap-2 text-sm font-medium">
          <Checkbox
            checked={allSelected}
            onCheckedChange={(v) => setSelected(v === true ? new Set(waiting.map((p) => p.id)) : new Set())}
          />
          {waiting.length} waiting
        </label>
        <span className="text-xs text-muted-foreground">{venueLabel(klass.venue)}</span>
        <Button
          size="sm"
          className="ml-auto"
          disabled={busy || selected.size === 0}
          onClick={enrollSelected}
        >
          {busy ? <Spinner className="size-4" /> : <Plus className="size-4" />}
          Enrol selected{selected.size > 0 ? ` (${selected.size})` : ''}
        </Button>
      </div>

      <div className="min-w-0 overflow-hidden rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="w-8 px-3 py-2" />
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Phone</th>
              <th className="px-3 py-2 font-medium">Address</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {waiting.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="px-3 py-2">
                  <Checkbox checked={selected.has(p.id)} onCheckedChange={(v) => toggle(p.id, v === true)} />
                </td>
                <td className="px-3 py-2 font-medium">{personName(p)}</td>
                <td className="px-3 py-2 text-muted-foreground">{p.phone ?? '—'}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {[p.address_details, p.location].filter(Boolean).join(', ') || '—'}
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={reminding === p.id}
                      onClick={() => remind(p)}
                    >
                      {reminding === p.id ? <Spinner className="size-3.5" /> : <MessageCircle className="size-3.5" />}
                      Remind
                    </Button>
                    <Button size="sm" disabled={busy} onClick={() => enroll(p)}>
                      <Plus className="size-3.5" />
                      {isAdmin ? 'Enrol' : 'Add'}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
