'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  firstName?: string | null;
  lastName?: string | null;
  role: string;
  workspaceId: string;
  avatarUrl?: string | null;
};

type AuthState = {
  accessToken: string | null;
  user: AuthUser | null;
  workspaceId: string | null;
  login: (payload: {
    accessToken: string;
    user: AuthUser;
  }) => void;
  logout: () => void;
  setUser: (user: AuthUser | null) => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      user: null,
      workspaceId: null,
      login: ({ accessToken, user }) =>
        set({
          accessToken,
          user,
          workspaceId: user.workspaceId,
        }),
      logout: () =>
        set({
          accessToken: null,
          user: null,
          workspaceId: null,
        }),
      setUser: (user) =>
        set({
          user,
          workspaceId: user?.workspaceId ?? null,
        }),
    }),
    {
      name: 'flacron-auth',
      partialize: (state) => ({
        accessToken: state.accessToken,
        user: state.user,
        workspaceId: state.workspaceId,
      }),
    },
  ),
);
