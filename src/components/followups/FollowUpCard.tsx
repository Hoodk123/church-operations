import type { MouseEvent } from 'react';
import { MessageCircle, Phone } from 'lucide-react';
import { daysSince } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  categoryColors,
  contactDotColor,
  followUpStatusColors,
  needsPastorColor,
} from '@/components/people/constants';
import {
  fullName,
  initialsOf,
  isNewAssignment,
  lastContactLabel,
  newAssignmentLabel,
  telHref,
  waHref,
  type FollowUpPerson,
} from './utils';

/** Blue "New · assigned N days ago by X" tag, only within 7 days and no contact yet. */
function NewTag({ person }: { person: FollowUpPerson }) {
  if (!isNewAssignment(person)) return null;
  return (
    <Badge
      variant="outline"
      className="border-blue-200 bg-blue-100 text-blue-800 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
    >
      {newAssignmentLabel(person)}
    </Badge>
  );
}

interface CardProps {
  person: FollowUpPerson;
  onLog: (person: FollowUpPerson) => void;
  onFocus: (person: FollowUpPerson) => void;
}

function stop(e: MouseEvent) {
  e.stopPropagation();
}

/** Full card for "Needs you now". */
export function FollowUpCard({ person, onLog, onFocus }: CardProps) {
  const days = person.last_contact_date ? daysSince(person.last_contact_date) : null;
  const tel = telHref(person.phone);
  const wa = waHref(person.phone);

  return (
    <div
      className="flex flex-col gap-2.5 rounded-xl border bg-card p-3 transition-colors hover:border-foreground/20"
      onMouseEnter={() => onFocus(person)}
      onFocus={() => onFocus(person)}
    >
      <div className="flex items-start gap-2.5">
        <Avatar>
          <AvatarFallback>{initialsOf(person.first_name, person.last_name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{fullName(person)}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {person.category && (
              <Badge variant="outline" className={categoryColors[person.category] ?? ''}>
                {person.category}
              </Badge>
            )}
            {person.needs_pastor && (
              <Badge variant="outline" className={needsPastorColor}>
                Ask pastor
              </Badge>
            )}
            {person.location && <span className="truncate">{person.location}</span>}
          </div>
        </div>
        <span
          className={cn('mt-1.5 size-2 shrink-0 rounded-full', contactDotColor(days))}
          aria-hidden
        />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <NewTag person={person} />
        {person.follow_up_status === 'Not Started' && (
          <Badge variant="outline" className={followUpStatusColors['Not Started']}>
            Not started
          </Badge>
        )}
      </div>

      <p
        className={cn(
          'text-[13px]',
          days === null
            ? 'font-medium text-amber-800 dark:text-amber-300'
            : 'text-muted-foreground'
        )}
      >
        {lastContactLabel(person)}
      </p>

      <div className="flex gap-2" onClick={stop}>
        {tel && (
          <a
            href={tel}
            className={cn(
              buttonVariants({ variant: 'outline', size: 'sm' }),
              'h-11 grow md:h-8'
            )}
          >
            <Phone className="size-3.5" />
            Call
          </a>
        )}
        {wa && (
          <a
            href={wa}
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
        <Button size="sm" className="h-11 grow md:h-8" onClick={() => onLog(person)}>
          Log
        </Button>
      </div>
    </div>
  );
}

/** Compact row for "This week". */
export function FollowUpRow({ person, onLog, onFocus }: CardProps) {
  const days = person.last_contact_date ? daysSince(person.last_contact_date) : null;
  const tel = telHref(person.phone);
  const wa = waHref(person.phone);

  return (
    <div
      className="flex items-center gap-2.5 rounded-lg border bg-card p-2.5 transition-colors hover:border-foreground/20"
      onMouseEnter={() => onFocus(person)}
      onFocus={() => onFocus(person)}
    >
      <Avatar className="size-8">
        <AvatarFallback className="text-xs">
          {initialsOf(person.first_name, person.last_name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{fullName(person)}</p>
        <p className="truncate text-xs text-muted-foreground">
          {person.category ? `${person.category} · ` : ''}
          {lastContactLabel(person)}
        </p>
      </div>
      <span
        className={cn('size-2 shrink-0 rounded-full', contactDotColor(days))}
        aria-hidden
      />
      <div className="flex shrink-0 items-center gap-1">
        {tel && (
          <a
            href={tel}
            aria-label={`Call ${fullName(person)}`}
            className={cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }))}
          >
            <Phone className="size-4" />
          </a>
        )}
        {wa && (
          <a
            href={wa}
            target="_blank"
            rel="noreferrer"
            aria-label={`WhatsApp ${fullName(person)}`}
            className={cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }))}
          >
            <MessageCircle className="size-4" />
          </a>
        )}
        <Button size="sm" className="h-8" onClick={() => onLog(person)}>
          Log
        </Button>
      </div>
    </div>
  );
}
