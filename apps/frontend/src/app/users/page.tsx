'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { ApiError, api } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type AccountStatus = 'ACTIVE' | 'SUSPENDED';
type PlanStatus = 'PURCHASED' | 'NOT_PURCHASED';
type Filter = 'ALL' | AccountStatus | PlanStatus;

type DirectoryUser = {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  role: string;
  accountStatus: AccountStatus;
  planStatus: PlanStatus;
  planName?: string | null;
  workspaceId: string;
  workspaceName: string;
  createdAt: string;
};

const PLANS = ['Starter', 'Growth', 'Scale'] as const;

const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  SALES_REP: 'Sales Rep',
};

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'ALL', label: 'All users' },
  { id: 'ACTIVE', label: 'Active' },
  { id: 'SUSPENDED', label: 'Suspended' },
  { id: 'PURCHASED', label: 'Bought a plan' },
  { id: 'NOT_PURCHASED', label: 'No plan' },
];

function displayName(user: DirectoryUser) {
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return name || user.email;
}

function errorMessage(error: unknown) {
  if (error instanceof ApiError && error.body && typeof error.body === 'object') {
    const message = (error.body as { message?: string | string[] }).message;
    if (Array.isArray(message)) return message.join(', ');
    if (typeof message === 'string') return message;
  }
  if (error instanceof Error) return error.message;
  return 'Could not update this user.';
}

export default function UsersPage() {
  const role = useAuthStore((s) => s.user?.role);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const canManage = role === 'OWNER' || role === 'ADMIN';
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>('ALL');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const usersQuery = useQuery({
    queryKey: ['users', 'directory'],
    queryFn: () => api.get<DirectoryUser[]>('/users/directory'),
    enabled: canManage,
  });

  const updateStatus = useMutation({
    mutationFn: (input: {
      id: string;
      accountStatus?: AccountStatus;
      planStatus?: PlanStatus;
      planName?: string;
    }) => {
      const { id, ...body } = input;
      return api.patch<DirectoryUser>(`/users/${id}/status`, body);
    },
    onSuccess: async () => {
      setNotice(null);
      await queryClient.invalidateQueries({ queryKey: ['users', 'directory'] });
    },
    onError: (error) => setNotice(errorMessage(error)),
    onSettled: () => setPendingId(null),
  });

  const users = usersQuery.data ?? [];

  const counts = useMemo(
    () => ({
      total: users.length,
      active: users.filter((user) => user.accountStatus === 'ACTIVE').length,
      suspended: users.filter((user) => user.accountStatus === 'SUSPENDED').length,
      purchased: users.filter((user) => user.planStatus === 'PURCHASED').length,
      notPurchased: users.filter((user) => user.planStatus === 'NOT_PURCHASED').length,
    }),
    [users],
  );

  const visible = users.filter((user) => {
    if (filter === 'ALL') return true;
    if (filter === 'ACTIVE' || filter === 'SUSPENDED') {
      return user.accountStatus === filter;
    }
    return user.planStatus === filter;
  });

  function save(id: string, patch: {
    accountStatus?: AccountStatus;
    planStatus?: PlanStatus;
    planName?: string;
  }) {
    setPendingId(id);
    setNotice(null);
    updateStatus.mutate({ id, ...patch });
  }

  if (!canManage) {
    return (
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle>Users</CardTitle>
          <CardDescription>
            Only an owner or admin can open the user panel.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight text-navy">Users</h2>
        <p className="text-sm text-muted-foreground">
          Every account. See who bought a plan, and set each person to active or suspended.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="All users" value={counts.total} />
        <Stat label="Active" value={counts.active} />
        <Stat label="Suspended" value={counts.suspended} />
        <Stat
          label="Plan"
          value={`${counts.purchased} bought`}
          hint={`${counts.notPurchased} have no plan`}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <Button
            key={item.id}
            type="button"
            size="sm"
            variant={filter === item.id ? 'default' : 'outline'}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </Button>
        ))}
      </div>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle>User panel</CardTitle>
          <CardDescription>
            {usersQuery.isLoading
              ? 'Loading accounts…'
              : `${visible.length} shown · an admin can change account and plan status`}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {usersQuery.isLoading ? (
            <div className="flex items-center gap-2 px-6 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading users…
            </div>
          ) : null}

          {usersQuery.isError ? (
            <p className="px-6 py-8 text-sm text-destructive">
              Could not load users. Sign in as an owner or admin and try again.
            </p>
          ) : null}

          {notice ? (
            <p className="px-6 pt-4 text-sm text-destructive">{notice}</p>
          ) : null}

          {!usersQuery.isLoading && !usersQuery.isError && visible.length === 0 ? (
            <p className="px-6 py-8 text-sm text-muted-foreground">
              No users match this filter.
            </p>
          ) : null}

          {visible.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Workspace</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Plan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((user) => {
                  const isSelf = user.id === currentUserId;
                  const busy = pendingId === user.id;
                  const planValue =
                    user.planStatus === 'PURCHASED'
                      ? user.planName && PLANS.includes(user.planName as (typeof PLANS)[number])
                        ? user.planName
                        : 'Growth'
                      : 'NOT_PURCHASED';

                  return (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="min-w-0">
                          <p className="font-medium text-navy">
                            {displayName(user)}
                            {isSelf ? (
                              <Badge variant="outline" className="ml-2">
                                You
                              </Badge>
                            ) : null}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {user.email}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-navy">{user.workspaceName}</TableCell>
                      <TableCell>{ROLE_LABELS[user.role] ?? user.role}</TableCell>
                      <TableCell>
                        <Select
                          aria-label={`Account status for ${displayName(user)}`}
                          className="h-9 w-[140px]"
                          value={user.accountStatus}
                          disabled={busy || isSelf}
                          title={isSelf ? 'You cannot suspend your own account' : undefined}
                          onChange={(event) =>
                            save(user.id, {
                              accountStatus: event.target.value as AccountStatus,
                            })
                          }
                        >
                          <option value="ACTIVE">Active</option>
                          <option value="SUSPENDED">Suspended</option>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Select
                            aria-label={`Plan for ${displayName(user)}`}
                            className="h-9 w-[160px]"
                            value={planValue}
                            disabled={busy}
                            onChange={(event) => {
                              const value = event.target.value;
                              if (value === 'NOT_PURCHASED') {
                                save(user.id, { planStatus: 'NOT_PURCHASED' });
                                return;
                              }
                              save(user.id, {
                                planStatus: 'PURCHASED',
                                planName: value,
                              });
                            }}
                          >
                            <option value="NOT_PURCHASED">No plan</option>
                            {PLANS.map((plan) => (
                              <option key={plan} value={plan}>
                                {plan}
                              </option>
                            ))}
                          </Select>
                          {busy ? (
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-md border border-border bg-card px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold text-navy">{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
