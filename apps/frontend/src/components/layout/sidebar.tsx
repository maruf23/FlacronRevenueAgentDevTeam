'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NAV_SECTIONS } from '@/lib/navigation';
import { useSidebarStore } from '@/store/sidebarStore';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';

type SidebarProps = {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
};

export function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const collapsed = useSidebarStore((s) => s.collapsed);
  const openSections = useSidebarStore((s) => s.openSections);
  const toggleCollapsed = useSidebarStore((s) => s.toggleCollapsed);
  const toggleSection = useSidebarStore((s) => s.toggleSection);

  const nav = (compact: boolean) => (
    <>
      <Link
        href="/"
        onClick={onMobileClose}
        className={cn(
          'flex h-14 items-center gap-3 px-3 transition-opacity hover:opacity-90',
          compact && 'justify-center px-2',
        )}
      >
        <div className="flex h-9 w-12 shrink-0 items-center justify-center rounded-md bg-white px-1">
          <Image
            src="/logo-mark.png"
            alt="Flacron Lead Agent"
            width={48}
            height={28}
            className="h-6 w-auto object-contain"
            priority
          />
        </div>
        {!compact ? (
          <div className="min-w-0 leading-tight">
            <p className="truncate text-xs font-bold uppercase tracking-[0.14em] text-white">
              Flacron
            </p>
            <p className="truncate text-xs font-semibold uppercase tracking-[0.08em] text-primary">
              Lead Agent
            </p>
          </div>
        ) : null}
      </Link>

      <Separator className="bg-white/15" />

      <nav className="flex flex-1 flex-col gap-2 overflow-y-auto p-2">
        {NAV_SECTIONS.map((section) => {
          const sectionOpen = compact || (openSections[section.id] ?? true);
          return (
            <div key={section.id}>
              {!compact ? (
                <button
                  type="button"
                  onClick={() => toggleSection(section.id)}
                  className="mb-1 flex w-full items-center justify-between rounded-md px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-white/70 hover:bg-white/5 hover:text-white"
                >
                  {section.label}
                  <ChevronDown
                    className={cn(
                      'h-3.5 w-3.5 transition-transform',
                      sectionOpen ? 'rotate-0' : '-rotate-90',
                    )}
                  />
                </button>
              ) : null}
              {sectionOpen ? (
                <div className="flex flex-col gap-0.5">
                  {section.items.map((item) => {
                    const isActive =
                      item.href === '/'
                        ? pathname === '/'
                        : pathname.startsWith(item.href);
                    const Icon = item.icon;

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onMobileClose}
                        title={compact ? item.title : undefined}
                        className={cn(
                          'flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                          compact && 'justify-center px-2',
                          isActive
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'text-white/80 hover:bg-white/10 hover:text-white',
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        {!compact ? (
                          <span className="truncate">{item.title}</span>
                        ) : (
                          <span className="sr-only">{item.title}</span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>

      <div
        className={cn(
          'space-y-1 border-t border-white/10 p-3',
          compact && 'flex justify-center p-2',
        )}
      >
        {!compact ? (
          <>
            <p className="text-xs font-medium uppercase tracking-wider text-primary">
              Find it. Qualify it. Close it.
            </p>
            <p className="text-xs text-white/60">v0.1.0</p>
          </>
        ) : null}
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="hidden h-8 w-8 text-white hover:bg-white/10 hover:text-white lg:inline-flex"
          onClick={toggleCollapsed}
          aria-label={compact ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {compact ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </Button>
      </div>
    </>
  );

  return (
    <>
      <aside
        className={cn(
          'hidden h-full shrink-0 flex-col border-r border-navy/15 bg-navy text-navy-foreground transition-[width] duration-200 lg:flex',
          collapsed ? 'w-[4.25rem]' : 'w-60',
        )}
      >
        {nav(collapsed)}
      </aside>

      <div
        className={cn(
          'fixed inset-0 z-50 lg:hidden',
          mobileOpen ? 'pointer-events-auto' : 'pointer-events-none',
        )}
      >
        <button
          type="button"
          aria-label="Close menu"
          className={cn(
            'absolute inset-0 bg-navy/50 transition-opacity',
            mobileOpen ? 'opacity-100' : 'opacity-0',
          )}
          onClick={onMobileClose}
        />
        <aside
          className={cn(
            'absolute inset-y-0 left-0 flex w-[min(100%,16.5rem)] flex-col bg-navy text-navy-foreground shadow-xl transition-transform duration-200',
            mobileOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <div className="absolute right-2 top-2 z-10">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-white hover:bg-white/10 hover:text-white"
              onClick={onMobileClose}
              aria-label="Close sidebar"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          {nav(false)}
        </aside>
      </div>
    </>
  );
}
