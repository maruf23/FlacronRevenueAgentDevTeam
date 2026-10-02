'use client';

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table';
import { CheckCircle2, Circle, ListTodo, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

type ApiTask = {
  id: string;
  title: string;
  description: string | null;
  status: 'PENDING' | 'COMPLETED' | 'CANCELLED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  dueAt: string | null;
  assignedTo: string;
  leadEmail: string | null;
  leadCompany: string | null;
};

type Priority = 'High' | 'Medium' | 'Low';
type TaskStatus = 'Pending' | 'Completed';

type TaskRow = {
  id: string;
  description: string;
  assignedTo: string;
  dueDate: string;
  priority: Priority;
  status: TaskStatus;
};

const PRIORITY_STYLES: Record<Priority, string> = {
  High: 'border-transparent bg-red-100 text-red-800',
  Medium: 'border-transparent bg-amber-100 text-amber-900',
  Low: 'border-transparent bg-secondary text-navy',
};

function mapPriority(p: ApiTask['priority']): Priority {
  if (p === 'HIGH') return 'High';
  if (p === 'LOW') return 'Low';
  return 'Medium';
}

function mapTask(t: ApiTask): TaskRow {
  return {
    id: t.id,
    description: t.description?.trim() || t.title,
    assignedTo: t.assignedTo,
    dueDate: t.dueAt || new Date().toISOString(),
    priority: mapPriority(t.priority),
    status: t.status === 'COMPLETED' ? 'Completed' : 'Pending',
  };
}

export default function TasksPage() {
  const queryClient = useQueryClient();

  const tasksQuery = useQuery({
    queryKey: ['tasks'],
    queryFn: () => api.get<ApiTask[]>('/tasks'),
  });

  const completeMutation = useMutation({
    mutationFn: (id: string) => api.post(`/tasks/${id}/complete`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const rows = useMemo(
    () => (tasksQuery.data ?? []).map(mapTask),
    [tasksQuery.data],
  );

  const columns = useMemo<ColumnDef<TaskRow>[]>(
    () => [
      {
        accessorKey: 'description',
        header: 'Task Description',
        cell: ({ row }) => (
          <div className="flex max-w-md items-start gap-2">
            {row.original.status === 'Completed' ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            ) : (
              <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <span
              className={cn(
                'font-medium text-navy',
                row.original.status === 'Completed' &&
                  'text-muted-foreground line-through',
              )}
            >
              {row.original.description}
            </span>
          </div>
        ),
      },
      { accessorKey: 'assignedTo', header: 'Assigned To' },
      {
        accessorKey: 'dueDate',
        header: 'Due Date',
        cell: ({ getValue }) => (
          <span className="tabular-nums">
            {new Date(getValue<string>()).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </span>
        ),
      },
      {
        accessorKey: 'priority',
        header: 'Priority',
        cell: ({ getValue }) => {
          const priority = getValue<Priority>();
          return (
            <Badge className={PRIORITY_STYLES[priority]}>{priority}</Badge>
          );
        },
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const status = row.original.status;
          return (
            <div className="flex items-center gap-2">
              <Badge
                className={
                  status === 'Completed'
                    ? 'border-transparent bg-emerald-100 text-emerald-800'
                    : 'border-transparent bg-primary/15 text-primary'
                }
              >
                {status}
              </Badge>
              {status === 'Pending' ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={completeMutation.isPending}
                  onClick={() => completeMutation.mutate(row.original.id)}
                >
                  Done
                </Button>
              ) : null}
            </div>
          );
        },
      },
    ],
    [completeMutation],
  );

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const pending = rows.filter((t) => t.status === 'Pending').length;
  const completed = rows.filter((t) => t.status === 'Completed').length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight text-navy">
            Tasks
          </h2>
          <p className="text-sm text-muted-foreground">
            Operator to-dos generated from inbox replies, campaigns, and
            automations.
          </p>
        </div>
        <Button variant="outline" disabled>
          <ListTodo className="h-4 w-4" />
          Auto-created from replies
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <Badge variant="secondary">{pending} pending</Badge>
        <Badge className="border-transparent bg-emerald-100 text-emerald-800">
          {completed} completed
        </Badge>
      </div>

      <div className="rounded-lg border border-border bg-card shadow-sm">
        {tasksQuery.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading tasks…
          </div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-muted-foreground">
            No follow-up tasks yet. They appear when replies are classified or
            sent from Inbox.
          </div>
        ) : (
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="hover:bg-transparent">
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
