import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppProviders } from '../components/providers/AppProviders';
import './globals.css';

export const metadata: Metadata = {
  title: 'RenderLab',
  description: 'Frontend performance monitoring for React apps.',
};

/**
 * `data-theme` starts unset here and is set client-side by `ThemeSync`
 * (AppProviders) once the persisted/system preference is known — a brief
 * flash of the default (light) theme on first paint is possible.
 * Eliminating it with a blocking inline script is a Phase 10 polish item,
 * not attempted here.
 */
export default function RootLayout({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <html lang="en">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
