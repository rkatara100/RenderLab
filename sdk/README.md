# @renderlab/sdk

React instrumentation for [RenderLab](https://github.com/rkatara100/RenderLab) — detects and explains wasted re-renders, long tasks, and slow network requests, and streams them to your RenderLab dashboard.

## Install

```bash
npm install @renderlab/sdk
```

Requires React 18 or 19 and `react-dom`.

## Quick start

1. Sign up for a project in the RenderLab dashboard to get an **ingest key**. Only the ingest key belongs in application code — it is write-only. Never use your dashboard (read) key here.

2. Initialize once, as early as possible in your app's entry point:

```tsx
import { init } from '@renderlab/sdk';

init({ apiKey: process.env.NEXT_PUBLIC_RENDERLAB_INGEST_KEY! });
```

3. Wrap your app (or the subtree you want to monitor) in the provider:

```tsx
import { RenderLabProvider } from '@renderlab/sdk';

function App({ children }) {
  return <RenderLabProvider>{children}</RenderLabProvider>;
}
```

`init()` must run before `RenderLabProvider` mounts, or the provider renders your children un-instrumented and logs a console warning. In a Next.js App Router layout, call `init()` in a client entry module imported at the top of the tree, not inside the provider's render.

4. Opt individual components into render tracking:

```tsx
import { withRenderLabProfiler } from '@renderlab/sdk';

function SearchResults(props) {
  /* ... */
}

export default withRenderLabProfiler(SearchResults);
```

Instrumentation is manual and per-component — nothing is captured for a component unless you wrap it. There is no Babel/SWC auto-instrumentation plugin yet.

## Config reference

```ts
init({
  apiKey: 'rl_...',          // required — ingest key, write-only
  appId: 'checkout-web',     // optional — defaults to location.hostname
  appVersion: '1.4.2',       // optional — your app's release version, sent with every batch
  environment: 'production', // optional — 'production' | anything else (affects defaults below)
  endpoint: 'https://...',   // optional — override the ingest endpoint
  sampleRate: 0.1,           // optional — fraction of sessions captured; defaults to 1 outside production, 0.1 in production
  transport: 'fetch',        // optional — 'fetch' | 'beacon'
  onError: (err) => {},      // optional — called on any capture/send failure; defaults to console.warn
  enabled: true,             // optional — set false to disable capture entirely
  replay: { enabled: false },
  longTasks: { enabled: true },
  network: { enabled: true, ignoreUrls: [] },
  ignore: { componentNames: [], propKeys: ['children'] },
  capturePropValues: 'redacted', // 'full' | 'redacted' | 'off'
});
```

Sampling is decided once per session and applied before any capture work runs, so an unsampled session pays no serialization cost.

## What gets captured

- **Renders** — via `withRenderLabProfiler` / `useRenderLabProfiler`, using React's `Profiler` API: duration, props diff, and an inferred render reason (`mount`, `props-changed`, `context-changed`, `state-changed`, `parent-rerender`, `unknown`).
- **Long tasks** — via `PerformanceObserver({ entryTypes: ['longtask'] })`, when supported by the browser.
- **Network requests** — `fetch`/`XMLHttpRequest` timing via the Resource Timing API, excluding calls to the ingest endpoint itself.

Not currently captured: unmount events (React's `Profiler` has no unmount callback — components that leave the tree are not reported), Web Vitals, console/error capture, or route changes.

## Optional hooks

```tsx
import { useTrackedContext, useRenderLabState } from '@renderlab/sdk';

const value = useTrackedContext(MyContext, 'MyContext'); // reports whether the read changed by reference
const [state, setState] = useRenderLabState(initial);    // reports state-driven re-renders
```

These write into a shared per-render registry read by the nearest `useRenderCapture` call — use them inside a component already wrapped by `withRenderLabProfiler`.

## Privacy

By default (`capturePropValues: 'redacted'`), prop values are diffed by reference/shallow-equality only — the actual values are not sent. Set `capturePropValues: 'full'` to send prop values (subject to `maxPropDepth`/`maxPropStringLength`), or `'off'` to skip prop diffing entirely.

## Bundle notes

The package ships as ESM only (no CJS build), is marked `sideEffects: false` for tree-shaking, and has no runtime dependencies beyond `@renderlab/shared-types`.
