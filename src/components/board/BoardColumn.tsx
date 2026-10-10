import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { followUpStatusColors } from '../people/constants';
import { DragCard, type BoardStatus } from './BoardCard';
import type { Person } from '../people/columns';

interface BoardColumnProps {
  status: BoardStatus;
  cards: Person[];
  onOpen: (person: Person) => void;
  onMoveTo: (person: Person, status: BoardStatus) => void;
}

export function BoardColumn({ status, cards, onOpen, onMoveTo }: BoardColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex h-full w-[270px] shrink-0 flex-col rounded-xl border bg-muted/30',
        isOver && 'bg-muted/60 ring-2 ring-ring/60'
      )}
    >
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <Badge variant="outline" className={cn('rounded-md', followUpStatusColors[status])}>
          {status}
        </Badge>
        <span className="text-sm font-medium text-muted-foreground tabular-nums">
          {cards.length}
        </span>
      </div>
      {status === 'Completed' && (
        <p className="px-3 pb-1 text-xs text-muted-foreground">Last 30 days only</p>
      )}
      <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-1 flex-col gap-2 p-2 pt-1">
          {cards.map((c) => (
            <DragCard
              key={c.id}
              person={c}
              onOpen={onOpen}
              onMoveTo={(to) => onMoveTo(c, to)}
            />
          ))}
          {cards.length === 0 && (
            <div
              className={cn(
                'flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground',
                isOver && 'border-ring text-foreground'
              )}
            >
              {isOver ? 'Drop here' : 'Nothing here yet'}
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

