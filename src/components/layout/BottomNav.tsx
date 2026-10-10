import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { visibleNavItems } from './nav';

export default function BottomNav({ role }: { role: string }) {
  const items = visibleNavItems(role, true);

  if (items.length === 0) return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
      {items.map((item) => (
        <NavLink
          key={item.href}
          to={item.href}
          className={({ isActive }) =>
            cn(
              'mx-1 flex flex-1 flex-col items-center gap-1 rounded-lg py-2 text-[11px] font-medium transition-colors',
              isActive
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )
          }
        >
          <item.icon className="size-4" />
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
