import type { LucideIcon } from 'lucide-react';
import {
  Users,
  UserCheck,
  Phone,
  Columns3,
  TriangleAlert,
  Home,
  GraduationCap,
  Droplets,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Shown in the phone bottom nav (design shows exactly four). */
  mobile: boolean;
  /** Omitted = every role can see it. */
  roles?: string[];
  /** Section heading shown above the first item of the group. */
  group?: string;
}

/**
 * Collapsible sidebar groups. A nav item joins a group by setting
 * `group: '<name>'`; to add another class later (M2, Siloam, ...) add one
 * item below with `group: 'Classes'` and it appears under the dropdown.
 */
export const NAV_GROUPS: Record<string, { icon: LucideIcon }> = {
  Classes: { icon: GraduationCap },
};

export const NAV_ITEMS: NavItem[] = [
  { label: 'Home', href: '/home', icon: Home, mobile: false, roles: ['Admin'] },
  {
    label: 'People',
    href: '/dashboard',
    icon: Users,
    mobile: false,
    roles: ['Admin', 'Info Desk', 'Follow-up Coordinator'],
  },
  {
    label: 'Check-in',
    href: '/check-in',
    icon: UserCheck,
    mobile: true,
    roles: ['Admin', 'Info Desk'],
  },
  {
    label: 'Follow-ups',
    href: '/my-followups',
    icon: Phone,
    mobile: true,
    roles: ['Admin', 'Follow-up Coordinator', 'Pastor'],
  },
  {
    label: 'Board',
    href: '/board',
    icon: Columns3,
    mobile: true,
    roles: ['Admin', 'Follow-up Coordinator', 'Pastor'],
  },
  {
    label: 'Attention',
    href: '/needs-attention',
    icon: TriangleAlert,
    mobile: true,
    roles: ['Admin'],
  },
  {
    label: 'M1 Class',
    href: '/m1',
    icon: GraduationCap,
    mobile: false,
    group: 'Classes',
    roles: ['Admin', 'Pastor', 'Follow-up Coordinator', 'Info Desk'],
  },
  {
    label: 'Baptism',
    href: '/baptism',
    icon: Droplets,
    mobile: false,
    group: 'Classes',
    roles: ['Admin', 'Pastor', 'Follow-up Coordinator'],
  },
];

export function visibleNavItems(role: string | null, mobile = false): NavItem[] {
  return NAV_ITEMS.filter(
    (item) =>
      (!mobile || item.mobile) &&
      (!item.roles || (!!role && item.roles.includes(role)))
  );
}
