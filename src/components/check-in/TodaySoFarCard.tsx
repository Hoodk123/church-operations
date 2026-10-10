import { Undo2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export interface TodayPerson {
  id: string;
  first_name: string;
  last_name: string;
  category: string | null;
}

export interface TodayCheckIn {
  id: string;
  checkedInAt: string;
  person: TodayPerson | null;
}

interface TodaySoFarCardProps {
  rows: TodayCheckIn[] | null;
  canUndo: boolean;
  onUndo: (attendanceId: string) => void;
}

function initials(person: TodayPerson): string {
  return `${person.first_name[0] ?? ''}${person.last_name[0] ?? ''}`.toUpperCase();
}

function timeLabel(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function TodaySoFarCard({ rows, canUndo, onUndo }: TodaySoFarCardProps) {
  const list = rows ?? [];
  const total = list.length;
  const countBy = (category: string) =>
    list.filter((r) => r.person?.category === category).length;

  const stats = [
    { label: 'Visitors', value: countBy('Visitor') },
    { label: 'New converts', value: countBy('New Convert') },
    { label: 'Members', value: countBy('Member') },
    { label: 'Returning', value: countBy('Returning') },
  ];

  const recent = list.slice(0, 8);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Today so far</CardTitle>
        {rows === null ? (
          <Skeleton className="h-10 w-20" />
        ) : (
          <p className="font-heading text-3xl font-semibold tabular-nums">{total}</p>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2">
          {stats.map((s) => (
            <div key={s.label} className="rounded-lg border bg-muted/30 p-2">
              <p className="text-[11px] text-muted-foreground">{s.label}</p>
              <p className="text-lg font-semibold tabular-nums">{s.value}</p>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Just checked in
          </p>
          {rows === null ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : recent.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nobody has checked in yet today.</p>
          ) : (
            <TooltipProvider>
              <ul className="flex flex-col gap-1">
                {recent.map((row) => (
                  <li key={row.id} className="flex items-center gap-2">
                    <Avatar className="size-7">
                      <AvatarFallback className="text-[11px]">
                        {row.person ? initials(row.person) : '?'}
                      </AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {row.person
                        ? `${row.person.first_name} ${row.person.last_name}`
                        : 'Person removed'}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {timeLabel(row.checkedInAt)}
                    </span>
                    {canUndo && (
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label="Undo check-in"
                              className="shrink-0 cursor-pointer text-muted-foreground hover:text-destructive"
                              onClick={() => onUndo(row.id)}
                            >
                              <Undo2 className="size-3.5" />
                            </Button>
                          }
                        />
                        <TooltipContent>Undo check-in</TooltipContent>
                      </Tooltip>
                    )}
                  </li>
                ))}
              </ul>
            </TooltipProvider>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
