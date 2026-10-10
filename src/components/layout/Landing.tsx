import { Navigate } from 'react-router-dom';
import { useShellMember } from './shell';
import { landingPath } from './roles';

export default function Landing() {
  const member = useShellMember();
  return <Navigate to={landingPath(member?.role)} replace />;
}
