import type { ReactNode } from 'react';

interface ScreenHeaderProps {
  title: string;
  sub?: string;
  action?: ReactNode;
}

export default function ScreenHeader({ title, sub, action }: ScreenHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-3 pb-4">
      <div className="min-w-0">
        <h1 className="truncate font-heading text-lg font-semibold tracking-tight sm:text-xl">
          {title}
        </h1>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
      {action}
    </div>
  );
}
