import { useId, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NAV_GROUPS, visibleNavItems, type NavItem } from './nav';

interface SidebarProps {
  collapsed: boolean;
  role: string;
}

type GroupEntry = { kind: 'group'; name: string; items: NavItem[] };
type Entry = { kind: 'item'; item: NavItem } | GroupEntry;

/** Plain items keep their order; grouped items collect under one entry placed where the group first appears. */
function buildEntries(items: NavItem[]): Entry[] {
  const entries: Entry[] = [];
  const groups = new Map<string, GroupEntry>();
  for (const item of items) {
    if (!item.group) {
      entries.push({ kind: 'item', item });
      continue;
    }
    let group = groups.get(item.group);
    if (!group) {
      group = { kind: 'group', name: item.group, items: [] };
      groups.set(item.group, group);
      entries.push(group);
    }
    group.items.push(item);
  }
  return entries;
}

function NavLink({
  item,
  active,
  collapsed,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
}) {
  return (
    <Link
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
}

function NavGroup({
  group,
  collapsed,
  pathname,
}: {
  group: GroupEntry;
  collapsed: boolean;
  pathname: string;
}) {
  const [open, setOpen] = useState(true);
  const panelId = useId();
  const Icon = NAV_GROUPS[group.name]?.icon ?? group.items[0].icon;
  const hasActive = group.items.some((item) => item.href === pathname);

  // Icon-only sidebar: no room for a dropdown, so show the items as icons.
  if (collapsed) {
    return (
      <>
        {group.items.map((item) => (
          <NavLink key={item.href} item={item} active={item.href === pathname} collapsed />
        ))}
      </>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        className={cn(
          // Same size as the other rows, slightly bolder (semibold) so it reads as a heading.
          'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
          hasActive
            ? 'text-foreground'
            : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
        )}
      >
        <Icon className="size-4 shrink-0" />
        <span className="flex-1 text-left">{group.name}</span>
        <ChevronDown
          className={cn(
            'size-4 shrink-0 transition-transform duration-200',
            !open && '-rotate-90'
          )}
        />
      </button>

      <div
        id={panelId}
        inert={!open}
        className={cn(
          'grid transition-[grid-template-rows] duration-200 ease-out',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        )}
      >
        <div className="overflow-hidden">
          {/* Guide line sits under the parent icon; child text lines up with the parent label. */}
          <ul className="ml-5 mt-1 flex flex-col gap-1 border-l pl-2">
            {group.items.map((item) => {
              const active = item.href === pathname;
              return (
                <li key={item.href}>
                  <Link
                    to={item.href}
                    className={cn(
                      'block rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      active
                        ? 'bg-muted text-foreground'
                        : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default function Sidebar({ collapsed, role }: SidebarProps) {
  const location = useLocation();
  const entries = buildEntries(visibleNavItems(role));

  return (
    <aside
      className={cn(
        'sticky top-14 z-30 hidden h-[calc(100vh-3.5rem)] shrink-0 border-r bg-background transition-all duration-200 md:block print:hidden',
        collapsed ? 'w-14' : 'w-56'
      )}
    >
      <nav className="flex flex-col gap-1 p-2">
        {entries.map((entry) =>
          entry.kind === 'item' ? (
            <NavLink
              key={entry.item.href}
              item={entry.item}
              active={location.pathname === entry.item.href}
              collapsed={collapsed}
            />
          ) : (
            <NavGroup
              key={entry.name}
              group={entry}
              collapsed={collapsed}
              pathname={location.pathname}
            />
          )
        )}

        {/* Placeholder items for future expansion */}
        {!collapsed && (
          <>
            <div className="my-2 h-px border-t border-border" />
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