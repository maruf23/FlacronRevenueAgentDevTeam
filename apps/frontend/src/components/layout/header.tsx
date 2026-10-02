'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Bell, LogOut, Menu, User } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import { useAlertsStore } from '@/store/alertsStore';
import { findNavItem } from '@/lib/navigation';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
type AlertsResponse = {
  workspacePaused: boolean;
  pauseReason: string | null;
  pausedAt: string | null;
  unreadCount: number;
  alerts: Array<{
    id: string;
    title: string;
    body: string;
    type?: string;
    metadata?: { campaignId?: string; href?: string } | null;
    createdAt: string;
  }>;
};

type HeaderProps = {
  onMenuClick?: () => void;
};

export function Header({ onMenuClick }: HeaderProps) {
  const pathname = usePathname();
  const { user, logout, isLoading } = useAuth();
  const {
    unreadCount,
    workspacePaused,
    pauseReason,
    alerts,
    setFromServer,
    clear,
  } = useAlertsStore();

  const alertsQuery = useQuery({
    queryKey: ['alerts'],
    queryFn: () => api.get<AlertsResponse>('/alerts'),
    enabled: Boolean(user),
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (alertsQuery.data) {
      setFromServer(alertsQuery.data);
    }
  }, [alertsQuery.data, setFromServer]);

  const initials =
    user?.name
      ?.split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() ?? 'U';

  const badgeCount = unreadCount;
  const title = findNavItem(pathname)?.title ?? 'Flacron Lead Agent';

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-card/80 px-3 backdrop-blur-sm sm:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-9 w-9 shrink-0 lg:hidden"
          onClick={onMenuClick}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold tracking-tight text-navy sm:text-lg">
            {title}
          </h1>
          {workspacePaused ? (
            <p className="truncate text-sm text-destructive">
              Outbound paused
              {pauseReason ? ` — ${pauseReason}` : ''}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="relative h-9 w-9"
              aria-label="Alerts"
            >
              <Bell className="h-4 w-4" />
              {badgeCount > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
                  {badgeCount > 9 ? '9+' : badgeCount}
                </span>
              ) : null}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>Alerts</span>
              {badgeCount > 0 ? (
                <button
                  type="button"
                  className="text-xs font-normal text-muted-foreground hover:text-foreground"
                  onClick={() => clear()}
                >
                  Clear
                </button>
              ) : null}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {alerts.length === 0 && !workspacePaused ? (
              <div className="px-2 py-6 text-center text-xs text-muted-foreground">
                No active alerts
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto">
                {workspacePaused ? (
                  <div className="border-b px-3 py-2">
                    <p className="text-xs font-medium text-destructive">
                      Workspace paused
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {pauseReason ?? 'Outbound sending is halted.'}
                    </p>
                  </div>
                ) : null}
                {alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="border-b px-3 py-2 last:border-0"
                  >
                    <p className="text-xs font-medium text-navy">
                      {alert.title}
                    </p>
                    <p className="mt-0.5 line-clamp-3 text-xs text-muted-foreground">
                      {alert.body}
                    </p>
                    {alert.href ? (
                      <Link
                        href={alert.href}
                        className="mt-1 inline-block text-xs font-medium text-primary hover:underline"
                      >
                        Open campaign
                      </Link>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {isLoading ? (
          <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="relative h-9 gap-2 rounded-full px-2"
              >
                <Avatar className="h-8 w-8">
                  {user?.avatarUrl ? (
                    <AvatarImage src={user.avatarUrl} alt={user.name} />
                  ) : null}
                  <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                </Avatar>
                <span className="hidden max-w-[140px] truncate text-sm font-medium text-navy sm:inline">
                  {user?.name ?? 'Guest'}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none text-navy">
                    {user?.name ?? 'Guest'}
                  </p>
                  <p className="text-xs leading-none text-muted-foreground">
                    {user?.email ?? 'Not signed in'}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/settings" className="cursor-pointer">
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="cursor-pointer text-destructive focus:text-destructive"
                onClick={logout}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}
