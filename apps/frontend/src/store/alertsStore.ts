'use client';

import { create } from 'zustand';

export type AppAlert = {
  id: string;
  title: string;
  body: string;
  type?: string;
  href?: string | null;
  source: 'api' | 'deliverability' | 'system' | 'campaign';
  createdAt: string;
};

type AlertsState = {
  alerts: AppAlert[];
  unreadCount: number;
  workspacePaused: boolean;
  pauseReason: string | null;
  pushApiError: (status: number, message: string) => void;
  setFromServer: (payload: {
    unreadCount: number;
    workspacePaused: boolean;
    pauseReason: string | null;
    alerts: Array<{
      id: string;
      title: string;
      body: string;
      type?: string;
      metadata?: { campaignId?: string; href?: string } | null;
      createdAt: string;
    }>;
  }) => void;
  clear: () => void;
};

export const useAlertsStore = create<AlertsState>((set) => ({
  alerts: [],
  unreadCount: 0,
  workspacePaused: false,
  pauseReason: null,

  pushApiError: (status, message) => {
    if (status !== 0 && status < 400) return;
    // Ignore auth noise on login page
    if (status === 401) return;

    const alert: AppAlert = {
      id: `api-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title:
        status === 0
          ? 'API unreachable'
          : status >= 500
            ? `Server error ${status}`
            : `Request error ${status}`,
      body: message,
      source: 'api',
      createdAt: new Date().toISOString(),
    };

    set((state) => ({
      alerts: [alert, ...state.alerts].slice(0, 30),
      unreadCount: state.unreadCount + 1,
    }));
  },

  setFromServer: (payload) =>
    set({
      unreadCount: payload.unreadCount + (payload.workspacePaused ? 1 : 0),
      workspacePaused: payload.workspacePaused,
      pauseReason: payload.pauseReason,
      alerts: payload.alerts.map((a) => {
        const meta = a.metadata;
        const href =
          (meta && typeof meta.href === 'string' && meta.href) ||
          (meta && typeof meta.campaignId === 'string'
            ? `/campaigns/${meta.campaignId}`
            : null);
        const source =
          a.type === 'CAMPAIGN_APPROVAL_REQUIRED'
            ? ('campaign' as const)
            : ('deliverability' as const);
        return {
          id: a.id,
          title: a.title,
          body: a.body,
          type: a.type,
          href,
          source,
          createdAt:
            typeof a.createdAt === 'string'
              ? a.createdAt
              : new Date(a.createdAt).toISOString(),
        };
      }),
    }),

  clear: () =>
    set({
      alerts: [],
      unreadCount: 0,
    }),
}));
