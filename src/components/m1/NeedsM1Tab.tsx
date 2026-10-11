import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, UserRound } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { rlsErrorMessage } from '@/lib/rls-error';
import { useShellMember } from '@/components/layout/shell';
import { venueLabel, personName, type M1Class, type M1Person } from '@/components/m1/m1';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle, ItemMedia } from '@/components/ui/item';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { initials } from '@/lib/names';

interface NeedsM1TabProps {
  klass: M1Class;
  isAdmin: boolean;
  onChanged: () => void;
}

export function NeedsM1Tab({ klass, isAdmin, onChanged }: NeedsM1TabProps) {
  const member = useShellMember();
  const supabase = createClient();

  const [waiting, setWaiting] = useState<M1Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState<string | null>(null);

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

  async function enroll(person: M1Person) {
    setEnrolling(person.id);
    const { error } = await supabase.from('m1_enrollments').insert({
      class_id: klass.id,
      person_id: person.id,
      enrolled_by: member?.id ?? null,
      walk_in: false,
      status: 'Enrolled',
    });
    if (!error) {
      await supabase.from('people').update({ needs_m1: false }).eq('id', person.id);
      toast.success(`${personName(person)} enrolled in ${klass.title}`);
      setWaiting((prev) => prev.filter((p) => p.id !== person.id));
      onChanged();
    } else if (error.code === '23505') {
      toast.info(`${personName(person)} is already in ${klass.title}`);
    } else {
      toast.error(rlsErrorMessage(error));
    }
    setEnrolling(null);
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
            Enrolled tab.
          </EmptyDescription>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs text-muted-foreground">
        {waiting.length} waiting · {venueLabel(klass.venue)}
      </p>
      {waiting.map((p) => (
        <Item key={p.id} variant="outline">
          <ItemMedia variant="image">
            <Avatar size="sm">
              <AvatarFallback>{initials(p.first_name, p.last_name)}</AvatarFallback>
            </Avatar>
          </ItemMedia>
          <ItemContent>
            <ItemTitle>
              {personName(p)}
              {p.category && (
                <Badge variant="outline" className="ml-1.5">
                  {p.category}
                </Badge>
              )}
            </ItemTitle>
            <ItemDescription>
              {[p.age_group, p.location].filter(Boolean).join(' · ') || 'No extra details'}
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <Button
              size="sm"
              variant="outline"
              disabled={enrolling === p.id}
              onClick={() => enroll(p)}
            >
              {enrolling === p.id ? <Spinner className="size-3.5" /> : <Plus className="size-3.5" />}
              {isAdmin ? 'Enroll' : 'Add to this class'}
            </Button>
          </ItemActions>
        </Item>
      ))}
    </div>
  );
}