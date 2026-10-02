'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authApi, mapAuthUser } from '@/lib/api';
import { useAuthStore, type AuthUser } from '@/store/authStore';

export function useAuth() {
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const workspaceId = useAuthStore((s) => s.workspaceId);
  const loginStore = useAuthStore((s) => s.login);
  const logoutStore = useAuthStore((s) => s.logout);
  // Always false on first paint (server + client) to avoid hydration mismatches.
  const [hydrated, setHydrated] = useState(false);

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

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await authApi.login(email, password);
      const mapped = mapAuthUser(res.user);
      loginStore({ accessToken: res.access_token, user: mapped });
      return { user: mapped, token: res.access_token };
    },
    [loginStore],
  );

  const logout = useCallback(() => {
    logoutStore();
    // Hard navigate so heavy pages (campaign wizard, etc.) unload immediately.
    if (typeof window !== 'undefined') {
      window.location.assign('/login');
      return;
    }
    router.replace('/login');
  }, [logoutStore, router]);

  return {
    user: user as AuthUser | null,
    token: accessToken,
    workspaceId,
    isLoading: !hydrated,
    isAuthenticated: Boolean(accessToken && user),
    login,
    logout,
  };
}
