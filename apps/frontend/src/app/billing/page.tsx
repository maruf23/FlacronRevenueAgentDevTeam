'use client';

import { useMemo } from 'react';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table';
import { CreditCard, Download, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type Invoice = {
  id: string;
  date: string;
  amount: string;
  status: 'Paid' | 'Open' | 'Failed';
  invoiceNumber: string;
};

const USAGE = [
  { label: 'Lead Credits', used: 1840, limit: 2500 },
  { label: 'Emails Sent', used: 6120, limit: 10000 },
  { label: 'AI Drafts', used: 428, limit: 1000 },
  { label: 'Team Seats', used: 6, limit: 10 },
];

const INVOICES: Invoice[] = [
  {
    id: '1',
    invoiceNumber: 'INV-2026-008',
    date: '2026-08-01',
    amount: '$249.00',
    status: 'Paid',
  },
  {
    id: '2',
    invoiceNumber: 'INV-2026-007',
    date: '2026-07-01',
    amount: '$249.00',
    status: 'Paid',
  },
  {
    id: '3',
    invoiceNumber: 'INV-2026-006',
    date: '2026-06-01',
    amount: '$249.00',
    status: 'Paid',
  },
  {
    id: '4',
    invoiceNumber: 'INV-2026-005',
    date: '2026-05-01',
    amount: '$149.00',
    status: 'Paid',
  },
  {
    id: '5',
    invoiceNumber: 'INV-2026-004',
    date: '2026-04-01',
    amount: '$149.00',
    status: 'Paid',
  },
];

export default function BillingPage() {
  const columns = useMemo<ColumnDef<Invoice>[]>(
    () => [
      {
        accessorKey: 'invoiceNumber',
        header: 'Invoice',
        cell: ({ getValue }) => (
          <span className="font-medium text-navy">{getValue<string>()}</span>
        ),
      },
      {
        accessorKey: 'date',
        header: 'Date',
        cell: ({ getValue }) =>
          new Date(getValue<string>()).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          }),
      },
      { accessorKey: 'amount', header: 'Amount' },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ getValue }) => (
          <Badge className="border-transparent bg-emerald-100 text-emerald-800">
            {getValue<string>()}
          </Badge>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: () => (
          <Button variant="ghost" size="sm">
            <Download className="h-4 w-4" />
            PDF
          </Button>
        ),
      },
    ],
    [],
  );

  const table = useReactTable({
    data: INVOICES,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight text-navy">
            Billing
          </h2>
          <p className="text-sm text-muted-foreground">
            Plan, usage, and invoice history for this workspace.
          </p>
        </div>
        <Button>
          <ExternalLink className="h-4 w-4" />
          Manage Subscription
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="shadow-none lg:col-span-1">
          <CardHeader>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
              <CreditCard className="h-5 w-5" />
            </div>
            <CardTitle>Growth Plan</CardTitle>
            <CardDescription>Billed monthly · renews Sep 1, 2026</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-3xl font-semibold tabular-nums text-navy">
              $249
              <span className="text-base font-normal text-muted-foreground">
                /mo
              </span>
            </p>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li>· 2,500 lead credits / month</li>
              <li>· 10,000 outbound emails</li>
              <li>· 10 team seats</li>
              <li>· Priority deliverability support</li>
            </ul>
            <Badge className="border-transparent bg-emerald-100 text-emerald-800">
              Active
            </Badge>
          </CardContent>
        </Card>

        <Card className="shadow-none lg:col-span-2">
          <CardHeader>
            <CardTitle>Usage this period</CardTitle>
            <CardDescription>
              Resets on the 1st of each month with your subscription cycle.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {USAGE.map((item) => {
              const pct = Math.round((item.used / item.limit) * 100);
              return (
                <div key={item.label} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-navy">{item.label}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {item.used.toLocaleString()} / {item.limit.toLocaleString()}
                    </span>
                  </div>
                  <Progress value={pct} />
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle>Invoice history</CardTitle>
          <CardDescription>Download past invoices for accounting.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
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
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
