import { Link } from 'react-router-dom';
import {
  UserCheck,
  Users,
  Phone,
  Columns3,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import PageHeader from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';

interface LinkTile {
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
}

const links: LinkTile[] = [
  { label: 'Check-in', description: "Record who is here today", href: '/check-in', icon: UserCheck },
  { label: 'People', description: 'All registered people', href: '/dashboard', icon: Users },
  { label: 'Follow-ups', description: 'Contact and care for people', href: '/my-followups', icon: Phone },
  { label: 'Board', description: 'Follow-up status at a glance', href: '/board', icon: Columns3 },
  { label: 'Attention', description: 'People who need a volunteer', href: '/needs-attention', icon: TriangleAlert },
];

export default function HomePlaceholder() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader />

      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">
            The Home dashboard is coming soon. For now, jump to a page below.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {links.map((tile) => (
              <Link
                key={tile.href}
                to={tile.href}
                className="group flex items-center gap-3 rounded-xl border bg-card p-3 transition-colors hover:bg-accent/60"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <tile.icon className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{tile.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {tile.description}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
