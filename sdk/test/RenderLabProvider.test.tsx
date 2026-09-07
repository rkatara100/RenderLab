import { describe, expect, it, vi, afterEach } from 'vitest';
import { act, render } from '@testing-library/react';
import { RenderLabProvider } from '../src/provider/RenderLabProvider.js';
import { resetGlobalRuntime, setGlobalRuntime, createRuntime } from '../src/capture/runtime.js';

describe('RenderLabProvider', () => {
  afterEach(() => {
    resetGlobalRuntime();
    vi.restoreAllMocks();
  });

  it('warns once when mounted before init() so the missing-telemetry race is not silent', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    resetGlobalRuntime();

    render(
      <RenderLabProvider>
        <div>content</div>
      </RenderLabProvider>,
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/rendered without a runtime/));
  });

  it('does not warn when a runtime is available via config', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(
      <RenderLabProvider config={{ apiKey: 'key', environment: 'test', longTasks: { enabled: false }, network: { enabled: false } }}>
        <div>content</div>
      </RenderLabProvider>,
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringMatching(/rendered without a runtime/));
  });

  it('does not warn when init() ran before mount', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    setGlobalRuntime(
      createRuntime({ apiKey: 'key', environment: 'test', longTasks: { enabled: false }, network: { enabled: false } }),
    );

    render(
      <RenderLabProvider>
        <div>content</div>
      </RenderLabProvider>,
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringMatching(/rendered without a runtime/));
  });
});
