import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useShellMember } from './shell';
import { canAccess, landingPath } from './roles';

/** Sends a role away from a page it may not open to its landing page. */
export default function RoleGate() {
  const member = useShellMember();
  const location = useLocation();

  if (!canAccess(member?.role, location.pathname)) {
    return <Navigate to={landingPath(member?.role)} replace />;
  }

  return <Outlet />;
}
