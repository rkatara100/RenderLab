'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../../queries/queryClient';
import { useUIStore } from '../../stores/useUIStore';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';

function ThemeSync(): null {
  const resolvedTheme = useUIStore((s) => s.resolvedTheme);
  const applySystemTheme = useUIStore((s) => s.applySystemTheme);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    applySystemTheme(media.matches);
    const listener = (e: MediaQueryListEvent): void => applySystemTheme(e.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [applySystemTheme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme);
  }, [resolvedTheme]);

  useOnlineStatus();
  return null;
}

export function AppProviders({ children }: { children: ReactNode }): React.JSX.Element {
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeSync />
      {children}
    </QueryClientProvider>
  );
}
