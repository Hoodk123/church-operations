import { Link, useNavigate } from 'react-router-dom';
import { Info, PanelLeft, Share2, MoreVertical, LogOut, Settings, HelpCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface NavbarProps {
  fullName: string;
  role: string;
  lastUpdatedText: string;
  onActivityOpen: () => void;
  onSidebarToggle: () => void;
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
}: NavbarProps) {
  const navigate = useNavigate();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate('/login');
  }

  function handleShare() {
    navigator.clipboard.writeText(window.location.href);
  }

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center border-b bg-background px-4 gap-4">
      {/* Left — app identity + sidebar toggle */}
      <div className="flex items-center gap-2 shrink-0">
        <Link to="/dashboard" className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded bg-primary text-primary-foreground text-xs font-medium">
            CO
          </div>
          <span className="text-sm font-medium hidden sm:inline">Church Operations</span>
        </Link>

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
              <Button variant="ghost" size="icon-sm" onClick={handleShare} />
            }
          >
            <Share2 className="size-4" />
            <span className="sr-only">Share</span>
          </TooltipTrigger>
          <TooltipContent side="top">Share</TooltipContent>
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

        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
            <MoreVertical className="size-4" />
            <span className="sr-only">Menu</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem>
              <Settings className="size-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem>
              <HelpCircle className="size-4" />
              Help
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={handleLogout}>
              <LogOut className="size-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
