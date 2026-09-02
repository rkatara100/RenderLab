'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useUIStore, type ThemePreference } from '../../stores/useUIStore';
import { OfflineBanner } from '../shared/OfflineBanner';

const NAV_ITEMS: Array<{ href: string; label: string }> = [
  { href: '/tree', label: 'Component Tree' },
  { href: '/timeline', label: 'Render Timeline' },
  { href: '/why-did-it-render', label: 'Why Did It Render?' },
  { href: '/network', label: 'Network' },
  { href: '/replay', label: 'Replay' },
  { href: '/settings', label: 'Settings' },
];

const THEME_OPTIONS: ThemePreference[] = ['light', 'dark', 'system'];

function ThemeToggle(): React.JSX.Element {
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);

  return (
    <div className="theme-toggle" role="radiogroup" aria-label="Theme">
      {THEME_OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={theme === option}
          className={
            theme === option
              ? 'theme-toggle__option theme-toggle__option--active'
              : 'theme-toggle__option'
          }
          onClick={() => setTheme(option)}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }): React.JSX.Element {
  const pathname = usePathname();

  return (
    <div className="shell">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <aside className="shell__sidebar" aria-label="Primary navigation">
        <div className="shell__brand">RenderLab</div>
        <nav>
          <ul>
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <Link href={item.href} aria-current={pathname === item.href ? 'page' : undefined}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <ThemeToggle />
      </aside>
      <div className="shell__body">
        <OfflineBanner />
        <main id="main-content" className="shell__main">
          {children}
        </main>
      </div>
    </div>
  );
}
