'use client';

import { useMemo, useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table';
import { Filter, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type Contact = {
  id: string;
  fullName: string;
  email: string;
  jobTitle: string;
  company: string;
  phone: string;
  lastContacted: string;
};

const CONTACTS: Contact[] = [
  {
    id: '1',
    fullName: 'Sarah Chen',
    email: 'sarah.chen@acmerobotics.com',
    jobTitle: 'VP of Operations',
    company: 'Acme Robotics',
    phone: '+1 (512) 555-0142',
    lastContacted: '2026-08-03',
  },
  {
    id: '2',
    fullName: 'Marcus Webb',
    email: 'm.webb@novatech.io',
    jobTitle: 'CTO',
    company: 'NovaTech Systems',
    phone: '+1 (415) 555-0198',
    lastContacted: '2026-08-04',
  },
  {
    id: '3',
    fullName: 'Elena Rodriguez',
    email: 'elena.r@techcorp.com',
    jobTitle: 'Head of Procurement',
    company: 'TechCorp Industries',
    phone: '+1 (312) 555-0177',
    lastContacted: '2026-07-28',
  },
  {
    id: '4',
    fullName: 'James Okonkwo',
    email: 'james.o@helixbio.com',
    jobTitle: 'Director of IT',
    company: 'Helix Biometrics',
    phone: '+1 (617) 555-0133',
    lastContacted: '2026-08-01',
  },
  {
    id: '5',
    fullName: 'Priya Patel',
    email: 'priya@orbitfin.tech',
    jobTitle: 'CFO',
    company: 'Orbit Fintech',
    phone: '+1 (212) 555-0160',
    lastContacted: '2026-07-22',
  },
  {
    id: '6',
    fullName: 'David Kim',
    email: 'dkim@summitretail.com',
    jobTitle: 'VP of Sales',
    company: 'Summit Retail Group',
    phone: '+1 (206) 555-0184',
    lastContacted: '2026-08-02',
  },
  {
    id: '7',
    fullName: 'Amanda Foster',
    email: 'a.foster@brightpath.co',
    jobTitle: 'Operations Manager',
    company: 'BrightPath Logistics',
    phone: '+1 (404) 555-0119',
    lastContacted: '2026-07-15',
  },
  {
    id: '8',
    fullName: 'Ryan Torres',
    email: 'ryan.torres@cascade.energy',
    jobTitle: 'Plant Manager',
    company: 'Cascade Energy',
    phone: '+1 (720) 555-0155',
    lastContacted: '2026-07-30',
  },
  {
    id: '9',
    fullName: 'Lisa Nguyen',
    email: 'lisa.n@novatech.io',
    jobTitle: 'VP of Sales',
    company: 'NovaTech Systems',
    phone: '+1 (415) 555-0121',
    lastContacted: '2026-08-05',
  },
  {
    id: '10',
    fullName: 'Tom Bradley',
    email: 'tbradley@acmerobotics.com',
    jobTitle: 'Director of IT',
    company: 'Acme Robotics',
    phone: '+1 (512) 555-0190',
    lastContacted: '2026-07-25',
  },
];

const JOB_TITLES = Array.from(new Set(CONTACTS.map((c) => c.jobTitle))).sort();
const COMPANIES = Array.from(new Set(CONTACTS.map((c) => c.company))).sort();

export default function ContactsPage() {
  const [search, setSearch] = useState('');
  const [jobTitle, setJobTitle] = useState('all');
  const [company, setCompany] = useState('all');

  const filtered = useMemo(() => {
    return CONTACTS.filter((c) => {
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        c.fullName.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q);
      const matchesTitle = jobTitle === 'all' || c.jobTitle === jobTitle;
      const matchesCompany = company === 'all' || c.company === company;
      return matchesSearch && matchesTitle && matchesCompany;
    });
  }, [search, jobTitle, company]);

  const columns = useMemo<ColumnDef<Contact>[]>(
    () => [
      {
        accessorKey: 'fullName',
        header: 'Full Name',
        cell: ({ getValue }) => (
          <span className="font-medium text-navy">{getValue<string>()}</span>
        ),
      },
      { accessorKey: 'email', header: 'Email' },
      { accessorKey: 'jobTitle', header: 'Job Title' },
      { accessorKey: 'company', header: 'Linked Company' },
      { accessorKey: 'phone', header: 'Phone' },
      {
        accessorKey: 'lastContacted',
        header: 'Last Contacted',
        cell: ({ getValue }) => (
          <span className="tabular-nums text-muted-foreground">
            {new Date(getValue<string>()).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </span>
        ),
      },
    ],
    [],
  );

  const table = useReactTable({
    data: filtered,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight text-navy">
          Contacts
        </h2>
        <p className="text-sm text-muted-foreground">
          People records linked to companies, campaigns, and conversations.
        </p>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Filter className="h-3.5 w-3.5" />
          Filters
        </div>
        <Select
          className="w-full sm:w-48"
          value={jobTitle}
          onChange={(e) => setJobTitle(e.target.value)}
        >
          <option value="all">All job titles</option>
          {JOB_TITLES.map((title) => (
            <option key={title} value={title}>
              {title}
            </option>
          ))}
        </Select>
        <Select
          className="w-full sm:w-48"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
        >
          <option value="all">All companies</option>
          {COMPANIES.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </Select>
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
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  No contacts match these filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <div className="border-t px-3 py-2 text-xs text-muted-foreground">
          Showing {filtered.length} of {CONTACTS.length} contacts
        </div>
      </div>
    </div>
  );
}
