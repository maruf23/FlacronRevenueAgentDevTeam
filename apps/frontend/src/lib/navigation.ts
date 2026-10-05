import {
  LayoutDashboard,
  Users,
  Building2,
  ContactRound,
  Inbox,
  Megaphone,
  Kanban,
  Sparkles,
  CalendarDays,
  ListTodo,
  BarChart3,
  Workflow,
  Plug,
  Bell,
  CreditCard,
  UsersRound,
  UserCog,
  Bot,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  description?: string;
  /** When set, only these roles see the item. */
  roles?: string[];
};

export type NavSection = {
  id: string;
  label: string;
  items: NavItem[];
};

export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'core',
    label: 'Core',
    items: [
      { title: 'Dashboard', href: '/', icon: LayoutDashboard },
      { title: 'Leads', href: '/leads', icon: Users },
      { title: 'Companies', href: '/companies', icon: Building2 },
      { title: 'Contacts', href: '/contacts', icon: ContactRound },
      { title: 'Inbox', href: '/inbox', icon: Inbox },
      { title: 'Pipeline', href: '/pipeline', icon: Kanban },
      { title: 'Campaigns', href: '/campaigns', icon: Megaphone },
    ],
  },
  {
    id: 'growth',
    label: 'Growth',
    items: [
      { title: 'Ads AI', href: '/ads-ai', icon: Sparkles },
      { title: 'Calendar', href: '/calendar', icon: CalendarDays },
      { title: 'Tasks', href: '/tasks', icon: ListTodo },
      { title: 'Analytics', href: '/analytics', icon: BarChart3 },
      { title: 'Deliverability', href: '/deliverability', icon: ShieldCheck },
    ],
  },
  {
    id: 'automation',
    label: 'Automation',
    items: [
      { title: 'Autopilot', href: '/automations', icon: Workflow },
      { title: 'Integrations', href: '/integrations', icon: Plug },
      { title: 'AI Copilot', href: '/ai-copilot', icon: Bot },
    ],
  },
  {
    id: 'workspace',
    label: 'Workspace',
    items: [
      { title: 'Notifications', href: '/notifications', icon: Bell },
      { title: 'Team', href: '/team', icon: UsersRound },
      {
        title: 'Users',
        href: '/users',
        icon: UserCog,
        roles: ['OWNER', 'ADMIN'],
      },
      { title: 'Billing', href: '/billing', icon: CreditCard },
      { title: 'Settings', href: '/settings', icon: Settings },
    ],
  },
];

/** Flat list for title lookups and active-route matching */
export const NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);

export function findNavItem(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find((item) =>
    item.href === '/' ? pathname === '/' : pathname.startsWith(item.href),
  );
}
