import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { MessageCircle, Phone } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { rlsErrorMessage } from '@/lib/rls-error';
import { phoneDigits } from '@/lib/phone';
import { daysSince } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { useShellMember } from '@/components/layout/shell';
import ScreenHeader from '@/components/layout/ScreenHeader';
import LogContactSheet from './LogContactSheet';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/empty';
import {
  categoryColors,
  contactDotColor,
  needsPastorColor,
} from '@/components/people/constants';

interface FollowUpPerson {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  category: string | null;
  location: string | null;
  needs_pastor: boolean;
  last_contact_date: string | null;
}

/** Ask pastor first, then never contacted, then oldest contact. */
function byUrgency(a: FollowUpPerson, b: FollowUpPerson): number {
  if (a.needs_pastor !== b.needs_pastor) return a.needs_pastor ? -1 : 1;
  const aNever = !a.last_contact_date;
  const bNever = !b.last_contact_date;
  if (aNever !== bNever) return aNever ? -1 : 1;
  if (aNever && bNever) return 0;
  return (a.last_contact_date ?? '').localeCompare(b.last_contact_date ?? '');
}

function getInitials(first: string, last: string): string {
  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase();
}

async function fetchFollowups(
  supabase: SupabaseClient,
  memberId: string
) {
  return supabase
    .from('people')
    .select(
      'id, first_name, last_name, phone, category, location, needs_pastor, last_contact_date'
    )
    .eq('assigned_to', memberId)
    .neq('follow_up_status', 'Completed');
}

export default function MyFollowupsPage() {
  const member = useShellMember();
  const supabase = createClient();

  const [people, setPeople] = useState<FollowUpPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [logFor, setLogFor] = useState<FollowUpPerson | null>(null);

  useEffect(() => {
    const memberId = member?.id ?? '';
    if (!memberId) return;
    let active = false;
    async function load() {
      const { data, error } = await fetchFollowups(supabase, memberId);
      if (active) return;
      if (error) {
        toast.error(rlsErrorMessage(error));
      } else {
        setPeople((data ?? []).sort(byUrgency));
      }
      setLoading(false);
    }
    load();
    return () => {
      active = true;
    };
  }, [supabase, member]);

  const refresh = useCallback(async () => {
    const memberId = member?.id ?? '';
    if (!memberId) return;
    const { data, error } = await fetchFollowups(supabase, memberId);
    if (error) {
      toast.error(rlsErrorMessage(error));
    } else {
      setPeople((data ?? []).sort(byUrgency));
    }
  }, [supabase, member]);

  if (!member) return null;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3">
      <ScreenHeader
        title="My Follow-ups"
        sub={`${people.length} ${people.length === 1 ? 'person' : 'people'} waiting`}
      />

      {loading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : people.length === 0 ? (
        <Empty className="rounded-xl border py-10">
          <EmptyTitle>Nobody is waiting on you.</EmptyTitle>
          <EmptyDescription>Thank you for serving.</EmptyDescription>
        </Empty>
      ) : (
        <div className="flex flex-col gap-3">
          {people.map((p) => {
            const name = `${p.first_name} ${p.last_name}`;
            const days = p.last_contact_date
              ? daysSince(p.last_contact_date)
              : null;
            const telHref = p.phone
              ? `tel:${p.phone.replace(/[^\d+]/g, '')}`
              : null;
            const waHref = p.phone ? `https://wa.me/${phoneDigits(p.phone)}` : null;

            return (
              <div
                key={p.id}
                className="flex flex-col gap-2.5 rounded-xl border bg-card p-3"
              >
                <div className="flex items-start gap-2.5">
                  <Avatar>
                    <AvatarFallback>
                      {getInitials(p.first_name, p.last_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{name}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      {p.category && (
                        <Badge
                          variant="outline"
                          className={categoryColors[p.category] ?? ''}
                        >
                          {p.category}
                        </Badge>
                      )}
                      {p.needs_pastor && (
                        <Badge variant="outline" className={needsPastorColor}>
                          Ask pastor
                        </Badge>
                      )}
                      {p.location && (
                        <span className="truncate">{p.location}</span>
                      )}
                    </div>
                  </div>
                  <span
                    className={cn(
                      'mt-1.5 size-2 shrink-0 rounded-full',
                      contactDotColor(days)
                    )}
                    aria-hidden
                  />
                </div>

                {days === null ? (
                  <p className="text-[13px] font-medium text-amber-800 dark:text-amber-300">
                    Never contacted
                  </p>
                ) : (
                  <p className="text-[13px] text-muted-foreground">
                    Last contacted {days} day{days === 1 ? '' : 's'} ago
                  </p>
                )}

                <div className="flex gap-2">
                  {telHref && (
                    <a
                      href={telHref}
                      className={cn(
                        buttonVariants({ variant: 'outline', size: 'sm' }),
                        'h-11 grow md:h-8'
                      )}
                    >
                      <Phone className="size-3.5" />
                      Call
                    </a>
                  )}
                  {waHref && (
                    <a
                      href={waHref}
                      target="_blank"
                      rel="noreferrer"
                      className={cn(
                        buttonVariants({ variant: 'outline', size: 'sm' }),
                        'h-11 grow md:h-8'
                      )}
                    >
                      <MessageCircle className="size-3.5" />
                      WhatsApp
                    </a>
                  )}
                  <Button
                    size="sm"
                    className="h-11 grow md:h-8"
                    onClick={() => setLogFor(p)}
                  >
                    Log
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {logFor && (
        <LogContactSheet
          open
          onOpenChange={(open) => {
            if (!open) setLogFor(null);
          }}
          personId={logFor.id}
          personName={`${logFor.first_name} ${logFor.last_name}`}
          memberId={member.id}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
