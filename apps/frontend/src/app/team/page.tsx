'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Mail, UserPlus } from 'lucide-react';
import { api } from '@/lib/api';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

type WorkspaceUser = {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  role: string;
  workspaceId: string;
  createdAt: string;
};

const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  SALES_REP: 'Sales Rep',
};

const ROLE_STYLES: Record<string, string> = {
  OWNER: 'border-transparent bg-primary text-primary-foreground',
  ADMIN: 'border-transparent bg-navy text-navy-foreground',
  MANAGER: 'border-transparent bg-amber-100 text-amber-900',
  SALES_REP: 'border-transparent bg-secondary text-navy',
};

function displayName(user: WorkspaceUser) {
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return name || user.email;
}

function initials(user: WorkspaceUser) {
  const first = user.firstName?.[0] ?? user.email[0] ?? '?';
  const last = user.lastName?.[0] ?? user.email.split('@')[0]?.[1] ?? '';
  return `${first}${last}`.toUpperCase();
}

export default function TeamPage() {
  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<WorkspaceUser[]>('/users'),
  });

  const members = usersQuery.data ?? [];

  const counts = useMemo(() => {
    return {
      total: members.length,
      owners: members.filter((m) => m.role === 'OWNER').length,
      reps: members.filter((m) => m.role === 'SALES_REP').length,
    };
  }, [members]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight text-navy">
            Team
          </h2>
          <p className="text-sm text-muted-foreground">
            Workspace members and roles from your tenant.
          </p>
        </div>
        <Button disabled title="Invite API not available yet">
          <UserPlus className="h-4 w-4" />
          Invite Member
        </Button>
      </div>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>
            {usersQuery.isLoading
              ? 'Loading…'
              : `${counts.total} member${counts.total === 1 ? '' : 's'} · ${counts.owners} owner · ${counts.reps} sales rep${counts.reps === 1 ? '' : 's'}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 p-4 pt-0">
          {usersQuery.isLoading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading team…
            </div>
          ) : null}

          {usersQuery.isError ? (
            <p className="py-6 text-center text-sm text-destructive">
              Could not load team members.
            </p>
          ) : null}

          {!usersQuery.isLoading && !usersQuery.isError && members.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No users found in this workspace.
            </p>
          ) : null}

          {members.map((member) => (
            <div
              key={member.id}
              className="flex flex-col gap-3 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarFallback>{initials(member)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="font-medium text-navy">{displayName(member)}</p>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Mail className="h-3 w-3" />
                    {member.email}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <Badge
                  className={
                    ROLE_STYLES[member.role] ??
                    'border-transparent bg-secondary text-navy'
                  }
                >
                  {ROLE_LABELS[member.role] ?? member.role}
                </Badge>
                <Badge className="border-transparent bg-emerald-100 text-emerald-800">
                  Active
                </Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
