import type { CSSProperties, KeyboardEvent } from 'react';
import { CheckIcon, MoreHorizontal } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { daysSince } from '@/lib/dates';
import { initials } from '@/lib/names';
import {
  categoryColors,
  contactDotColor,
  followUpStatuses,
} from '../people/constants';
import type { Person } from '../people/columns';

export type BoardStatus = (typeof followUpStatuses)[number];

function statusOf(person: Person): BoardStatus {
  return (followUpStatuses as readonly string[]).includes(person.follow_up_status)
    ? (person.follow_up_status as BoardStatus)
    : 'Not Started';
}

function MoveToMenu({
  status,
  onMoveTo,
}: {
  status: BoardStatus;
  onMoveTo: (status: BoardStatus) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label="Move to another column"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus:outline-hidden"
          >
            <MoreHorizontal className="size-4" />
          </button>
        }
      />
      <DropdownMenuContent align="end" side="top">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Move to</DropdownMenuLabel>
          {followUpStatuses.map((s) => (
            <DropdownMenuItem
              key={s}
              disabled={s === status}
              onClick={() => onMoveTo(s)}
              className="cursor-pointer"
            >
              {s === status ? <CheckIcon className="size-3.5" /> : null}
              {s}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface BoardCardBodyProps {
  person: Person;
  onMoveTo: (status: BoardStatus) => void;
}

export function BoardCardBody({ person, onMoveTo }: BoardCardBodyProps) {
  const days = person.last_contact_date ? daysSince(person.last_contact_date) : null;
  const dayLabel =
    days === null ? 'never' : days === 0 ? 'today' : days === 1 ? '1 day' : `${days} days`;
  const assignedName = person.assigned_to_name;
  const assignedInitials = assignedName
    ? initials(...assignedName.split(' ').filter(Boolean).slice(0, 2))
    : '';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-medium">
          {person.first_name} {person.last_name}
        </span>
        <MoveToMenu status={statusOf(person)} onMoveTo={onMoveTo} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <Badge variant="outline" className={cn('shrink-0', categoryColors[person.category] ?? '')}>
          {person.category}
        </Badge>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            className={cn('size-2 shrink-0 rounded-full', contactDotColor(days))}
            aria-hidden
          />
          {dayLabel}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          {person.location ?? 'No location'}
        </span>
        {assignedName ? (
          <Avatar className="size-6">
            <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
              {assignedInitials}
            </AvatarFallback>
          </Avatar>
        ) : (
          <span className="shrink-0 text-xs text-muted-foreground">Unassigned</span>
        )}
      </div>
    </div>
  );
}

interface CardActions {
  person: Person;
  onOpen: (person: Person) => void;
  onMoveTo: (status: BoardStatus) => void;
}

function openOnKey(e: KeyboardEvent<HTMLDivElement>, open: () => void) {
  if (e.target !== e.currentTarget) return;
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    open();
  }
}
export function DragCard({ person, onOpen, onMoveTo }: CardActions) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: person.id,
  });
  const style: CSSProperties = {
    transition,
    zIndex: isDragging ? 40 : undefined,
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(person)}
      onKeyDown={(e) => openOnKey(e, () => onOpen(person))}
      className={cn(
        'relative cursor-grab rounded-xl border bg-card p-3 shadow-sm touch-none transition-shadow select-none focus:outline-hidden',
        'hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring/50',
        isDragging && 'border-2 border-dashed border-muted-foreground/40 bg-transparent opacity-60 shadow-none'
      )}
    >
      <BoardCardBody person={person} onMoveTo={onMoveTo} />
    </div>
  );
}

export function PlainCard({ person, onOpen, onMoveTo }: CardActions) {
  return (
    <div
    role="button"
    tabIndex={0}
    onClick={() => onOpen(person)}
    onKeyDown={(e) => openOnKey(e, () => onOpen(person))}
    className="cursor-pointer rounded-xl border bg-card p-3 shadow-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus:outline-hidden active:bg-accent/60"
  >
      <BoardCardBody person={person} onMoveTo={onMoveTo} />
    </div>
  );
}