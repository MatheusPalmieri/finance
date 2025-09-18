'use client';

import { ReactNode } from 'react';

import { SWRConfig } from 'swr';

interface SWRProviderProps {
  children: ReactNode;
}

export const SWRProvider = ({ children }: SWRProviderProps) => {
  return (
    <SWRConfig
      value={{
        // Global settings

        // Cache and performance
        revalidateOnFocus: false, // Don't revalidate when the window gains focus
        revalidateIfStale: false, // Don't revalidate automatically if data is stale
        revalidateOnMount: true, // Revalidate on mount if there is no valid cache
        revalidateOnReconnect: true, // Revalidate when reconnects to the internet

        // Cache duration and deduplication
        refreshInterval: 0, // No automatic refresh (manual control)
        dedupingInterval: 5000, // 5 seconds to deduplicate equal requests

        // Retry configuration
        shouldRetryOnError: true,
        errorRetryCount: 3,
        errorRetryInterval: 5000, // 5 seconds between attempts

        // Cache optimization
        focusThrottleInterval: 5000, // Throttle revalidation on focus
        keepPreviousData: true, // Keep previous data during loading

        // Loading settings
        loadingTimeout: 3000, // 3 seconds timeout for loading

        // Advanced settings
        compare: (a, b) => {
          // Custom compare to avoid unnecessary re-renders
          return JSON.stringify(a) === JSON.stringify(b);
        },

        // Global callback functions
        onSuccess: (data, key) => {
          console.log(`🚀 ~ SWR Global Success [${key}]:`, data);
        },

        onError: (error, key) => {
          console.error(`🚀 ~ SWR Global Error [${key}]:`, error);
        },

        onLoadingSlow: (key) => {
          console.warn(
            `🚀 ~ SWR Loading Slow [${key}] - request took more than 3s`
          );
        },

        // Fallback provider for errors
        fallback: {},

        // Suspense settings (if using React 18+)
        suspense: false,

        // Cache provider personalizado (opcional)
        // You can use localStorage, sessionStorage, etc.
        provider: () => new Map(),

        // Middleware personalizado (opcional)
        use: [
          // Middleware for debug
          (swrNext) => (key, fetcher, config) => {
            console.log(`🚀 ~ SWR Middleware starting for: ${key}`);

            return swrNext(key, fetcher, config);
          },
        ],
      }}
    >
      {children}
    </SWRConfig>
  );
};
