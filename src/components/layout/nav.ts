import type { LucideIcon } from 'lucide-react';
import { Users, UserCheck, Phone, Columns3, TriangleAlert, CalendarDays } from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Shown in the phone bottom nav (design shows exactly four). */
  mobile: boolean;
  /** Omitted = every role can see it. */
  roles?: string[];
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'People', href: '/dashboard', icon: Users, mobile: false },
  {
    label: 'Check-in',
    href: '/check-in',
    icon: UserCheck,
    mobile: true,
    roles: ['Admin', 'Info Desk', 'Follow-up Coordinator'],
  },
  { label: 'Follow-ups', href: '/my-followups', icon: Phone, mobile: true },
  { label: 'Board', href: '/board', icon: Columns3, mobile: true },
  { label: 'Attention', href: '/needs-attention', icon: TriangleAlert, mobile: true },
  { label: 'Today', href: '/today', icon: CalendarDays, mobile: false },
];

export function visibleNavItems(role: string | null, mobile = false): NavItem[] {
  return NAV_ITEMS.filter(
    (item) =>
      (!mobile || item.mobile) &&
      (!item.roles || (!!role && item.roles.includes(role)))
  );
}
