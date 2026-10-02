import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
      // Keep network/API failures in query state — don't surface as Next overlays
      throwOnError: false,
    },
    mutations: {
      throwOnError: false,
    },
  },
});
