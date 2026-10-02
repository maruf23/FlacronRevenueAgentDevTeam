'use client';

import { useMemo } from 'react';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table';
import { Building2, Download, Plus } from 'lucide-react';
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

type Company = {
  id: string;
  name: string;
  industry: string;
  location: string;
  website: string;
  contacts: number;
  activeCampaigns: number;
  status: 'Active' | 'Inactive';
};

const COMPANIES: Company[] = [
  {
    id: '1',
    name: 'Acme Robotics',
    industry: 'Manufacturing',
    location: 'Austin, TX',
    website: 'acmerobotics.com',
    contacts: 14,
    activeCampaigns: 2,
    status: 'Active',
  },
  {
    id: '2',
    name: 'NovaTech Systems',
    industry: 'SaaS',
    location: 'San Francisco, CA',
    website: 'novatech.io',
    contacts: 22,
    activeCampaigns: 3,
    status: 'Active',
  },
  {
    id: '3',
    name: 'TechCorp Industries',
    industry: 'Industrial IoT',
    location: 'Chicago, IL',
    website: 'techcorp.com',
    contacts: 9,
    activeCampaigns: 1,
    status: 'Active',
  },
  {
    id: '4',
    name: 'BrightPath Logistics',
    industry: 'Logistics',
    location: 'Atlanta, GA',
    website: 'brightpath.co',
    contacts: 6,
    activeCampaigns: 0,
    status: 'Inactive',
  },
  {
    id: '5',
    name: 'Helix Biometrics',
    industry: 'Healthcare',
    location: 'Boston, MA',
    website: 'helixbio.com',
    contacts: 11,
    activeCampaigns: 2,
    status: 'Active',
  },
  {
    id: '6',
    name: 'Summit Retail Group',
    industry: 'Retail',
    location: 'Seattle, WA',
    website: 'summitretail.com',
    contacts: 18,
    activeCampaigns: 1,
    status: 'Active',
  },
  {
    id: '7',
    name: 'Orbit Fintech',
    industry: 'Financial Services',
    location: 'New York, NY',
    website: 'orbitfin.tech',
    contacts: 7,
    activeCampaigns: 0,
    status: 'Inactive',
  },
  {
    id: '8',
    name: 'Cascade Energy',
    industry: 'Energy',
    location: 'Denver, CO',
    website: 'cascade.energy',
    contacts: 5,
    activeCampaigns: 1,
    status: 'Active',
  },
];

export default function CompaniesPage() {
  const columns = useMemo<ColumnDef<Company>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Company Name',
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary text-navy">
              <Building2 className="h-4 w-4" />
            </div>
            <span className="font-medium text-navy">{row.original.name}</span>
          </div>
        ),
      },
      { accessorKey: 'industry', header: 'Industry' },
      { accessorKey: 'location', header: 'Location' },
      {
        accessorKey: 'website',
        header: 'Website',
        cell: ({ getValue }) => (
          <span className="text-primary">{getValue<string>()}</span>
        ),
      },
      {
        accessorKey: 'contacts',
        header: 'Contacts',
        cell: ({ getValue }) => (
          <span className="tabular-nums">{getValue<number>()}</span>
        ),
      },
      {
        accessorKey: 'activeCampaigns',
        header: 'Active Campaigns',
        cell: ({ getValue }) => (
          <span className="tabular-nums">{getValue<number>()}</span>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ getValue }) => {
          const status = getValue<'Active' | 'Inactive'>();
          return (
            <Badge
              className={
                status === 'Active'
                  ? 'border-transparent bg-emerald-100 text-emerald-800'
                  : 'border-transparent bg-muted text-muted-foreground'
              }
            >
              {status}
            </Badge>
          );
        },
      },
    ],
    [],
  );

  const table = useReactTable({
    data: COMPANIES,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight text-navy">
            Companies
          </h2>
          <p className="text-sm text-muted-foreground">
            Account-level company records linked to leads and campaigns.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline">
            <Download className="h-4 w-4" />
            Export
          </Button>
          <Button>
            <Plus className="h-4 w-4" />
            Add Company
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card shadow-sm">
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
        <div className="border-t px-3 py-2 text-xs text-muted-foreground">
          Showing {COMPANIES.length} companies
        </div>
      </div>
    </div>
  );
}
