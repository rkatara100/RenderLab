import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUIStore } from '../src/stores/useUIStore';

function setMatchMedia(matches: boolean): void {
  window.matchMedia = vi.fn().mockReturnValue({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
}

describe('useUIStore', () => {
  beforeEach(() => {
    useUIStore.setState({ theme: 'system', resolvedTheme: 'light', isOffline: false, toast: null });
  });

  it('resolves an explicit theme choice directly, ignoring system preference', () => {
    setMatchMedia(true);
    useUIStore.getState().setTheme('light');
    expect(useUIStore.getState().resolvedTheme).toBe('light');
  });

  it('resolves "system" against the OS preference at the time it is set', () => {
    setMatchMedia(true);
    useUIStore.getState().setTheme('system');
    expect(useUIStore.getState().resolvedTheme).toBe('dark');
  });

  it('applySystemTheme only affects resolution while theme is "system"', () => {
    useUIStore.setState({ theme: 'dark' });
    useUIStore.getState().applySystemTheme(false);
    expect(useUIStore.getState().resolvedTheme).toBe('dark');

    useUIStore.setState({ theme: 'system' });
    useUIStore.getState().applySystemTheme(false);
    expect(useUIStore.getState().resolvedTheme).toBe('light');
  });

  it('toggles sidebar collapsed state', () => {
    const before = useUIStore.getState().sidebarCollapsed;
    useUIStore.getState().toggleSidebar();
    expect(useUIStore.getState().sidebarCollapsed).toBe(!before);
  });

  it('shows and dismisses a toast', () => {
    useUIStore.getState().showToast({ message: 'hi', variant: 'info' });
    expect(useUIStore.getState().toast?.message).toBe('hi');
    useUIStore.getState().dismissToast();
    expect(useUIStore.getState().toast).toBeNull();
  });
});
