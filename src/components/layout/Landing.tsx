import { Navigate } from 'react-router-dom';
import { useShellMember } from './shell';

/** Where each role starts after login. */
function landingPath(role: string | null | undefined): string {
  switch (role) {
    case 'Admin':
      return '/home';
    case 'Info Desk':
      return '/check-in';
    default:
      return '/my-followups';
  }
}

export default function Landing() {
  const member = useShellMember();
  return <Navigate to={landingPath(member?.role)} replace />;
}
