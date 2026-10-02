'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const DEFAULT_SECTIONS: Record<string, boolean> = {
  core: true,
  growth: true,
  automation: true,
  workspace: true,
};

type SidebarState = {
  collapsed: boolean;
  openSections: Record<string, boolean>;
  toggleCollapsed: () => void;
  setCollapsed: (collapsed: boolean) => void;
  toggleSection: (id: string) => void;
  isSectionOpen: (id: string) => boolean;
};

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set, get) => ({
      collapsed: false,
      openSections: DEFAULT_SECTIONS,
      toggleCollapsed: () => set((state) => ({ collapsed: !state.collapsed })),
      setCollapsed: (collapsed) => set({ collapsed }),
      toggleSection: (id) =>
        set((state) => ({
          openSections: {
            ...state.openSections,
            [id]: !(state.openSections[id] ?? true),
          },
        })),
      isSectionOpen: (id) => get().openSections[id] ?? true,
    }),
    { name: 'flacron-sidebar' },
  ),
);
