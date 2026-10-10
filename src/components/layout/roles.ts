/** Where each role lands after login and when redirected from a hidden page. */
export function landingPath(role: string | null | undefined): string {
  switch (role) {
    case 'Admin':
      return '/home';
    case 'Info Desk':
      return '/check-in';
    default:
      return '/my-followups';
  }
}

/** Paths each role may open. Kept in sync with the sidebar in nav.ts. */
const ALLOWED_PATHS: Record<string, string[]> = {
  Admin: ['/home', '/check-in', '/dashboard', '/my-followups', '/board', '/needs-attention'],
  'Info Desk': ['/check-in', '/dashboard'],
  'Follow-up Coordinator': ['/my-followups', '/board', '/dashboard'],
  Pastor: ['/my-followups', '/board'],
};

export function canAccess(role: string | null | undefined, path: string): boolean {
  if (path === '/') return true;
  if (!role) return false;
  const allowed = ALLOWED_PATHS[role];
  if (!allowed) return true;
  return allowed.includes(path);
}
