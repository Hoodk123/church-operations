import { Link } from 'react-router-dom';
import { Info, LogOut, PanelLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface NavbarProps {
  fullName: string;
  role: string;
  lastUpdatedText: string;
  onActivityOpen: () => void;
  onSidebarToggle: () => void;
  onLogout: () => void;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export default function Navbar({
  fullName,
  role,
  lastUpdatedText,
  onActivityOpen,
  onSidebarToggle,
  onLogout,
}: NavbarProps) {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center border-b bg-background px-4 gap-4">
      {/* Left — app identity + breadcrumb as one cluster */}
      <div className="flex items-center gap-3 shrink-0">
        <Link to="/dashboard" className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded bg-primary text-primary-foreground text-xs font-medium">
            CO
          </div>
          <span className="text-sm font-medium hidden sm:inline">Church Operations</span>
        </Link>

        <span className="text-muted-foreground/40 text-xs hidden sm:inline">&rsaquo;</span>

        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link to="/dashboard" />}>
                Home
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>People</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      {/* Right — cluster */}
      <div className="flex-1" />

      <div className="flex items-center gap-3 shrink-0">
        <span className="text-xs text-muted-foreground hidden md:inline">
          {lastUpdatedText}
        </span>

        <div className="flex items-center gap-2">
          <Avatar size="sm">
            <AvatarFallback>{getInitials(fullName)}</AvatarFallback>
          </Avatar>
          <Badge variant="secondary" className="hidden sm:inline-flex text-[10px]">
            {role}
          </Badge>
        </div>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button variant="ghost" size="icon-sm" onClick={onSidebarToggle} />
            }
          >
            <PanelLeft className="size-4" />
            <span className="sr-only">Toggle sidebar</span>
          </TooltipTrigger>
          <TooltipContent side="top">Toggle sidebar</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button variant="ghost" size="icon-sm" onClick={onActivityOpen} />
            }
          >
            <Info className="size-4" />
            <span className="sr-only">Recent activity</span>
          </TooltipTrigger>
          <TooltipContent side="top">Recent activity</TooltipContent>
        </Tooltip>

        <Button variant="ghost" size="icon-sm" onClick={onLogout}>
          <LogOut className="size-4" />
          <span className="sr-only">Sign out</span>
        </Button>
      </div>
    </header>
  );
}
