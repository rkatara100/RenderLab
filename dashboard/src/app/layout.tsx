import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppProviders } from '../components/providers/AppProviders';
import './globals.css';

export const metadata: Metadata = {
  title: 'RenderLab',
  description: 'Frontend performance monitoring for React apps.',
};

export default function RootLayout({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <html lang="en">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
