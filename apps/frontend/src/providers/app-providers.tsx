'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { AppShell } from '@/components/layout/app-shell';
import { Toaster } from '@/components/ui/toaster';

const PUBLIC_PATHS = ['/login', '/register'];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

function AuthLoadingScreen({ label }: { label: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4">
      <Loader2
        className="h-8 w-8 animate-spin text-primary"
        aria-hidden="true"
      />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

type WorkspaceCurrent = {
  needsOnboarding: boolean;
};

export function AppProviders({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const [hydrated, setHydrated] = useState(false);
  const isPublic = isPublicPath(pathname);
  const isOnboarding = pathname === '/onboarding';

  const workspaceQuery = useQuery({
    queryKey: ['workspace-current'],
    queryFn: () => api.get<WorkspaceCurrent>('/tenants/current'),
    enabled: Boolean(accessToken) && hydrated && !isPublic,
    staleTime: 30_000,
    retry: false,
  });

  useEffect(() => {
    let cancelled = false;
    const finish = () => {
      if (!cancelled) setHydrated(true);
    };

    if (useAuthStore.persist.hasHydrated()) {
      finish();
      return;
    }

    const unsub = useAuthStore.persist.onFinishHydration(finish);
    const timeout = window.setTimeout(finish, 50);

    return () => {
      cancelled = true;
      unsub();
      window.clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!accessToken && !isPublic) {
      router.replace('/login');
      return;
    }
    if (accessToken && isPublic) {
      router.replace('/');
    }
  }, [accessToken, hydrated, isPublic, router]);

  useEffect(() => {
    if (!accessToken || !hydrated || isPublic) return;
    if (!workspaceQuery.isSuccess) return;
    if (workspaceQuery.data.needsOnboarding && !isOnboarding) {
      router.replace('/onboarding');
    }
  }, [
    accessToken,
    hydrated,
    isPublic,
    isOnboarding,
    router,
    workspaceQuery.isSuccess,
    workspaceQuery.data?.needsOnboarding,
  ]);

  if (!hydrated) {
    return <AuthLoadingScreen label="Loading…" />;
  }

  if (!accessToken && !isPublic) {
    return (
      <>
        <AuthLoadingScreen label="Redirecting to sign in…" />
        <Toaster />
      </>
    );
  }

  if (accessToken && isPublic) {
    return (
      <>
        <AuthLoadingScreen label="Redirecting…" />
        <Toaster />
      </>
    );
  }

  if (isPublic) {
    return (
      <>
        {children}
        <Toaster />
      </>
    );
  }

  if (
    accessToken &&
    workspaceQuery.isSuccess &&
    workspaceQuery.data.needsOnboarding &&
    !isOnboarding
  ) {
    return (
      <>
        <AuthLoadingScreen label="Opening setup…" />
        <Toaster />
      </>
    );
  }

  return (
    <>
      <AppShell>{children}</AppShell>
      <Toaster />
    </>
  );
}
