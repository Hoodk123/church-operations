import { Link, useLocation } from 'react-router-dom';
import { Users } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SidebarProps {
  collapsed: boolean;
}

const navItems = [
  { label: 'People', icon: Users, href: '/dashboard' },
];

export default function Sidebar({ collapsed }: SidebarProps) {
  const location = useLocation();

  return (
    <aside
      className={cn(
        'sticky top-14 z-30 h-[calc(100vh-3.5rem)] border-r bg-background transition-all duration-200 shrink-0',
        collapsed ? 'w-14' : 'w-56'
      )}
    >
      <nav className="flex flex-col gap-1 p-2">
        {navItems.map((item) => {
          const active = location.pathname === item.href;
          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                collapsed && 'justify-center px-0'
              )}
              title={collapsed ? item.label : undefined}
            >
              <item.icon className="size-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}

        {/* Placeholder items for future expansion */}
        {!collapsed && (
          <>
            <div className="my-2 h-px bg-border" />
            <span className="px-3 py-1 text-xs text-muted-foreground/50 font-medium uppercase tracking-wider">
              Coming soon
            </span>
            <span className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground/40 cursor-not-allowed">
              <div className="size-4" />
              HBF Groups
            </span>
            <span className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground/40 cursor-not-allowed">
              <div className="size-4" />
              Reports
            </span>
          </>
        )}
      </nav>
    </aside>
  );
}
