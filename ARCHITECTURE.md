# RenderLab — Architecture

Frontend performance monitoring SaaS for React apps. Phase 0 deliverable — no implementation yet.

## 1. System Diagram

```
┌─────────────────┐      batched JSON       ┌──────────────────┐
│  Monitored App   │  ───────────────────▶  │  Ingestion API    │
│  + RenderLab SDK │   POST /ingest/events   │  (Fastify, api/)  │
│  (Profiler-based) │  ◀── 202 Accepted ──   └─────────┬─────────┘
└─────────────────┘                                    │
                                     ┌──────────────────┼──────────────────┐
                                     ▼                                    ▼
                            ┌────────────────┐                 ┌──────────────────┐
                            │  Postgres (Neon) │                 │  Redis (Upstash)  │
                            │  durable store,  │ ◀── periodic ── │  hot aggregation,  │
                            │  source of truth  │     flush job   │  presence/TTL,    │
                            └────────┬─────────┘                 │  idempotency keys │
                                     │                            └──────────────────┘
                                     │ React Query (reads)
                                     ▼
                            ┌────────────────────┐
                            │  Dashboard (Next.js) │
                            │  Zustand: UI state    │
                            │  React Query: server  │
                            │  data & cache         │
                            └────────────────────┘
```

Monitored app embeds the SDK → batches render telemetry client-side → sends to the standalone ingestion service → written synchronously to Postgres (durable) and mirrored into Redis (hot/live aggregation only) → a scheduled flush job keeps Postgres rollups current for live sessions → dashboard reads exclusively from Postgres via React Query, never touches Redis directly.

## 2. Monorepo Layout

pnpm workspaces + Turborepo.

```
renderlab/
├── pnpm-workspace.yaml        # packages: ['sdk','dashboard','api','packages/*']
├── turbo.json                 # build/lint/test/typecheck pipeline, build depends on ^build
├── tsconfig.base.json          # strict:true, noUncheckedIndexedAccess, ES2022, bundler resolution
├── eslint.config.mjs           # flat config, shared base + per-package overrides
├── .prettierrc
├── .github/workflows/ci.yml
├── docs/ARCHITECTURE.md
├── sdk/                        # instrumentation library
│   └── src/{provider,instrumentation,capture,observers,config}/
├── dashboard/                  # Next.js App Router app
│   └── src/{app,components,stores,queries,lib}/
├── api/                        # Fastify ingestion service
│   └── src/{routes,services,db}/
└── packages/shared-types/      # cross-package contracts (events, config, reasons)
```

- **`sdk` and `api`** both depend on `packages/shared-types`; Turborepo builds it first via `dependsOn: ["^build"]`.
- **tsconfig**: each package extends `tsconfig.base.json`; `dashboard` additionally sets `jsx: "preserve"` + Next plugin.
- **ESLint**: single flat config, `@typescript-eslint/no-explicit-any: error` — any suppression requires an inline `// eslint-disable-next-line ... -- <justification>` comment (per project constraint, no bare `any`).
- **Prettier**: formatting-only via `eslint-config-prettier`, runs as its own Turborepo task rather than through the linter.

## 3. Data Model

### 3.0 Tenancy decision

Minimal multi-tenancy from day one via a `projects` table (API key = tenant boundary), **not** a full org/user/role system. Retrofitting a tenant column onto `render_events` later would mean migrating the largest table in the system; adding `projects` now costs nothing. Explicitly deferred: multi-user orgs, roles, billing — one project has one API key and one owner email for MVP.

### 3.1 Postgres schema

```sql
CREATE TABLE projects (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    api_key         TEXT NOT NULL UNIQUE,
    api_key_prefix  TEXT NOT NULL,           -- indexed fast-lookup, first 8 chars
    owner_email     TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_active       BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX idx_projects_api_key_prefix ON projects (api_key_prefix);

CREATE TABLE sessions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    sdk_session_key     TEXT NOT NULL,       -- client UUID, idempotent upsert key
    started_at          TIMESTAMPTZ NOT NULL,
    ended_at            TIMESTAMPTZ,          -- NULL while live
    last_seen_at        TIMESTAMPTZ NOT NULL,
    user_agent          TEXT,
    url                 TEXT,
    app_version         TEXT,
    total_render_count  BIGINT NOT NULL DEFAULT 0,   -- denormalized, updated by flush job
    total_wasted_ms     DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_sessions_project_sdk_key ON sessions (project_id, sdk_session_key);
CREATE INDEX idx_sessions_project_started_at ON sessions (project_id, started_at DESC);
CREATE INDEX idx_sessions_live ON sessions (project_id, last_seen_at) WHERE ended_at IS NULL;

CREATE TABLE components (   -- stable component identity, deduped across renders/sessions
    id              BIGSERIAL PRIMARY KEY,
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    fiber_path_hash TEXT NOT NULL,   -- hash of "App/Header/SearchBox#0"
    display_name    TEXT NOT NULL,
    fiber_path      TEXT NOT NULL,   -- "App > Header > SearchBox"
    first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_components_project_hash ON components (project_id, fiber_path_hash);

CREATE TABLE render_events (   -- hot table, 10k+ rows/session, append-only
    id              BIGINT GENERATED ALWAYS AS IDENTITY,
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    session_id      UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    component_id    BIGINT NOT NULL REFERENCES components(id),
    ts              TIMESTAMPTZ NOT NULL,
    duration_ms     DOUBLE PRECISION NOT NULL,   -- sub-ms precision matters, renders are often <1ms
    render_reason   SMALLINT NOT NULL,           -- 1=mount 2=props 3=state 4=context 5=parent 6=unknown
    is_avoidable    BOOLEAN NOT NULL DEFAULT false,
    props_diff      JSONB,                       -- only populated when avoidable or sampled
    PRIMARY KEY (ts, id)
) PARTITION BY RANGE (ts);
-- daily partitions, created/dropped by scheduled job, e.g.:
CREATE TABLE render_events_2026_09_02 PARTITION OF render_events
    FOR VALUES FROM ('2026-09-02') TO ('2026-09-03');

CREATE INDEX idx_render_events_session_ts ON render_events (session_id, ts);
CREATE INDEX idx_render_events_component ON render_events (project_id, component_id, ts DESC);
CREATE INDEX idx_render_events_avoidable ON render_events (session_id, ts) WHERE is_avoidable = true;

CREATE TABLE session_component_rollups (   -- pre-aggregated, default dashboard view reads only this
    session_id          UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    component_id        BIGINT NOT NULL REFERENCES components(id),
    render_count        INTEGER NOT NULL DEFAULT 0,
    avoidable_count      INTEGER NOT NULL DEFAULT 0,
    total_duration_ms    DOUBLE PRECISION NOT NULL DEFAULT 0,
    max_duration_ms      DOUBLE PRECISION NOT NULL DEFAULT 0,
    last_render_at       TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (session_id, component_id)
);
CREATE INDEX idx_rollups_session_count ON session_component_rollups (session_id, render_count DESC);

CREATE TABLE render_events_daily_rollup (   -- survives raw-event pruning, trend charts
    project_id       UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    component_id     BIGINT NOT NULL REFERENCES components(id),
    day              DATE NOT NULL,
    render_count     BIGINT NOT NULL DEFAULT 0,
    avoidable_count  BIGINT NOT NULL DEFAULT 0,
    avg_duration_ms  DOUBLE PRECISION NOT NULL DEFAULT 0,
    p95_duration_ms  DOUBLE PRECISION,
    session_count    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (project_id, component_id, day)
);
```

**Key decisions:**

- **Daily range partitioning on `render_events.ts`**: retention pruning becomes `DROP TABLE` (instant, no vacuum storm), and every time-ranged dashboard query gets automatic partition pruning. Standard pattern for time-series-shaped ingestion at this scale.
- **Normalized `component_id` FK** instead of repeating the path string on every row: keeps the hot table's row width small, which is the dominant storage/IO cost at 10k+ rows/session.
- **JSONB `props_diff`, populated conditionally** (avoidable/sampled only, not every row): prop shapes are arbitrary and app-defined, so no fixed column set is possible, but populating it unconditionally would be the single largest storage cost for the lowest-value column (looked at one row at a time, never aggregated).
- **`duration_ms` as `DOUBLE PRECISION`**: React renders are frequently sub-millisecond; rounding to integer ms would make most well-optimized components indistinguishable, defeating the product's purpose.
- **`session_component_rollups` exists so the default dashboard view never scans raw events** — it's fed by the Redis flush job (§3.3), not recomputed by scanning `render_events` per request.
- **`render_events_daily_rollup`** is the only "forever" table; small (components × days), keeps trend charts alive past the 7-day raw retention window.

### 3.2 Retention & pagination

| Data                         | Retention                | Mechanism                                                                                                           |
| ---------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Raw `render_events`          | 7 days                   | Daily partitions; scheduled job rolls up the day into `render_events_daily_rollup` then `DROP TABLE`s the partition |
| `session_component_rollups`  | Session's lifetime (30d) | Cascades on session deletion                                                                                        |
| `sessions`                   | 30 days                  | Deleted after; small metadata row                                                                                   |
| `render_events_daily_rollup` | Indefinite               | Tiny (components × days), no reason to prune                                                                        |

**Pagination**: default views (session overview, component list) query `session_component_rollups` only — bounded by distinct-component count, not event count. Drill-down into a component's raw timeline uses **keyset pagination** on `(ts, id)` (`WHERE (ts,id) < ($cursor_ts,$cursor_id) ORDER BY ts DESC, id DESC LIMIT 100`), never `OFFSET` — OFFSET degrades linearly with depth, keyset is O(page size) at any depth using the existing `(session_id, ts)` index. Time-range filters apply as `ts BETWEEN` predicates before the cursor condition, narrowing partitions touched. Sorting is primarily by `ts` (the index/partition key); sorting by `duration_ms` at scale would need a new `(session_id, duration_ms DESC)` index, added in Phase 8 only if that sort order becomes a real requirement.

### 3.3 Redis usage plan (Upstash REST client)

**Constraint acknowledged**: Upstash's REST API has no persistent connection — no blocking pub/sub, no `BRPOP`/`XREAD BLOCK`. "Live" features here are therefore **polling-based**, not push-based. This fits an ingestion path that's naturally request/response shaped anyway.

Keys prefixed `rl:{project_id}:...` for tenant isolation:

| Purpose                    | Key                                               | Structure                                                                                                              |
| -------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Live presence              | `rl:{project}:session:{id}:presence`              | STRING, `EX 60`, refreshed per batch — TTL expiry _is_ the offline signal                                              |
| Session render counter     | `rl:{project}:session:{id}:render_count`          | STRING, `INCRBY`, `EX 3600`                                                                                            |
| Per-component hot counts   | `rl:{project}:session:{id}:component_counts`      | HASH, `HINCRBY` per event                                                                                              |
| Per-component hot duration | `rl:{project}:session:{id}:component_duration_ms` | HASH, `INCRBYFLOAT`                                                                                                    |
| Recent-event tail          | `rl:{project}:session:{id}:recent_events`         | LIST, `LPUSH` + `LTRIM 0 199`, `EX 3600` — last-200 live view; Postgres cursor pagination is authoritative beyond that |
| Ingest idempotency         | `rl:{project}:ingest:{batch_id}`                  | STRING, `SET NX EX 300`                                                                                                |

Sorted sets (for "top-N components") and Streams (for the recent-event tail) were considered and rejected: a HASH + periodic Postgres flush already produces `ORDER BY render_count DESC` cheaply at the aggregated grain, and a capped LIST gives "last N" without consumer-group machinery the REST client can't use anyway.

**Flow, not write-behind, not pure cache**: every ingest request writes synchronously to Postgres (durable, immediate — raw events are never parked only in Redis) _and_ updates Redis hot keys in the same request. A separate scheduled job (~15–30s) reads active sessions' Redis hashes and upserts into `session_component_rollups` / `sessions` totals. On session end (explicit signal or presence TTL expiry), one final flush runs; Redis keys are left to expire via TTL. Write-behind was rejected because raw events are the product's core value — an intermediate durability gap is an unjustified risk at this scale. Pure read-through cache was rejected because these counters mutate too fast to fit a lazy-populate-on-miss pattern.

### 3.4 Ingestion API

**Service**: standalone Fastify service (`api/`), not Next.js API routes — ingestion needs independent scaling/deploy cadence from the dashboard and benefits from a warm process (pooled Postgres connections, reused Redis REST client) more than dashboard pages do. Deploys to an always-on host (Fly.io/Railway free tier) rather than serverless functions.

```
POST /api/ingest/events
Authorization: Bearer <project_api_key>

{
  "batch_id": "uuid",
  "session": { "sdk_session_key": "uuid", "started_at": "...", "url": "...", "user_agent": "...", "app_version": "..." },
  "events": [{ "component_fiber_path": "...", "component_fiber_path_hash": "sha1:...",
               "ts": "...", "duration_ms": 0.42, "render_reason": 3, "is_avoidable": false, "props_diff": null }]
}
→ 202 { "accepted": true, "batch_id": "...", "event_count": 240 }
→ 401 bad key · 413 batch too large · 422 schema validation failure

POST /api/ingest/session-end
{ "sdk_session_key": "uuid" }
```

- **Batching**: SDK flushes at max 250 events **or** 2s, whichever first (≈35KB/batch, ~40 requests for a 10k-event session, not a burst). Hard server cap: 413 above 500 events/batch. Flush also triggers on `visibilitychange`/`beforeunload` via `sendBeacon`.
- **Idempotency**: `SET rl:{project}:ingest:{batch_id} 1 NX EX 300` before writing — a retried batch is a no-op 202, not a duplicate insert. 5-minute window comfortably exceeds realistic retry delay.
- **Ordering**: not guaranteed across batches (reconstructed from `ts` at read time, every query already sorts by it); preserved within a batch (single multi-row `INSERT` in array order).
- **Auth/tenant scoping**: API key → `project_id` resolved server-side; the client **never** supplies `project_id` directly, closing the tenant-spoofing hole. Session upsert (`ON CONFLICT (project_id, sdk_session_key) DO UPDATE last_seen_at`) makes session creation idempotent and doubles as the heartbeat.

### 3.5 Explicit simplifications vs. a "real" production SaaS

No message queue in front of ingestion (direct synchronous Postgres write is comfortably sufficient at this scale; a queue can be slotted in later between auth/validation and the DB write without a schema change). No multi-region. No PgBouncer (relying on Neon's built-in pooling). No true push liveness (TTL+poll, ≤60s detection lag — fine for a monitoring dashboard, not a collab tool). API key stored in a lookup-friendly but non-hashed form for MVP (write-only ingestion scope, not account access — flagged as a hardening item). Single email per project, no orgs/roles. Partition management via a cron job, not `pg_partman`.

## 4. SDK Public API Surface

### 4.1 Init

```ts
interface RenderLabConfig {
  apiKey: string;
  environment?: string;
  endpoint?: string;
  sampleRate?: number; // 0..1; default 1 dev / 0.1 prod
  batch?: { maxSize?: number; flushIntervalMs?: number; maxQueueBytes?: number };
  ignore?: { componentNames?: Array<string | RegExp>; propKeys?: string[] };
  capturePropValues?: 'full' | 'redacted' | 'off'; // default 'redacted'
  maxPropDepth?: number; // default 1 (shallow)
  maxPropStringLength?: number; // default 200
  replay?: { enabled: boolean; captureStateHooks?: boolean }; // default { enabled: false }
  transport?: 'fetch' | 'beacon'; // default 'fetch' keepalive, auto sendBeacon on unload
  onError?: (error: RenderLabSDKError) => void;
  enabled?: boolean; // default true; false = fully no-op
}

function init(config: RenderLabConfig): void;

interface RenderLabProviderProps {
  config?: Partial<RenderLabConfig>;
  children: React.ReactNode;
}
function RenderLabProvider(props: RenderLabProviderProps): JSX.Element;
```

Never throws into the host app — all capture logic wrapped in try/catch, errors routed to `onError`, event dropped rather than crashing render. `RenderLabProvider` also mounts a root `<Profiler>` for whole-tree aggregate timing even before any explicit per-component wrapping.

### 4.2 Instrumentation

```ts
function withRenderLabProfiler<P extends object>(
  Component: React.ComponentType<P>,
  options?: { name?: string },
): React.ComponentType<P>;
function useRenderLabProfiler(componentName: string, props: Record<string, unknown>): void;
function useTrackedContext<T>(context: React.Context<T>, name: string): T; // precise context-change detection
function useRenderLabState<S>(initial: S | (() => S)): [S, React.Dispatch<React.SetStateAction<S>>]; // precise state-change detection, opt-in
```

Internally: wraps render in `React.Profiler` (`onRender` → phase/actualDuration/baseDuration/startTime/commitTime), diffs props via a `useRef`-held previous value, reads tracked context/state, threads `componentPath` down via an internal Context (substitutes for fiber parent pointers, which the public Profiler API doesn't expose), and emits an `unmount` event via cleanup effect (Profiler never fires on unmount).

### 4.3 Captured event shape (`packages/shared-types`)

```ts
interface BaseEvent {
  eventId: string;
  sessionId: string;
  appId: string;
  timestamp: number;
  sequence: number;
}

type TelemetryEvent = RenderEvent | LongTaskEvent | NetworkRequestEvent | SessionMetaEvent; // discriminated union, additive for Phase 6/7

type RenderReason =
  'mount' | 'props-changed' | 'context-changed' | 'state-changed' | 'parent-rerender' | 'unknown';

interface PropDiffEntry {
  key: string;
  prevValue: unknown;
  nextValue: unknown;
  referenceEqual: boolean;
  shallowEqual: boolean;
  valueType: 'primitive' | 'function' | 'object' | 'array' | 'element' | 'other';
}

interface RenderEvent extends BaseEvent {
  type: 'render';
  componentId: string;
  componentName: string;
  componentPath: string[]; // ancestor ids, root-first
  phase: 'mount' | 'update' | 'unmount';
  renderReason: RenderReason;
  reasonDetail?: string;
  propsDiff: PropDiffEntry[];
  contextDiff?: { contextName: string; referenceEqual: boolean }[];
  actualDuration: number;
  baseDuration: number;
  startTime: number;
  commitTime: number;
  isMemoized: boolean;
  renderCount: number;
  stateSnapshotRef?: string; // only when replay.enabled — pointer, not inline data
}

interface LongTaskEvent extends BaseEvent {
  type: 'long-task';
  duration: number;
  attribution: string[];
  correlatedCommitIds?: string[];
} // Phase 6
interface NetworkRequestEvent extends BaseEvent {
  type: 'network-request';
  url: string;
  method: string;
  status?: number;
  duration: number;
  initiatorType: string;
  transferSize?: number;
} // Phase 6
interface SessionMetaEvent extends BaseEvent {
  type: 'session-meta';
  sdkVersion: string;
  appVersion?: string;
  viewport: { width: number; height: number };
  userAgent: string;
}
```

Phase 6/7 event types are defined now (not deferred to their phases) so the shared-types contract doesn't break later.

## 5. "Why did this render?" heuristic

Deterministic, ordered rule list — first match wins, pure function taking only diff data (no React internals), unit-testable in isolation:

1. **Mount** — `phase === 'mount'` → done, no diffing.
2. **Props changed** — any `PropDiffEntry.shallowEqual === false` → `props-changed`.
3. **Context changed** — no props change, any tracked context `referenceEqual === false` (only observable via `useTrackedContext`) → `context-changed`.
4. **State changed** — no props/context change, tracked state changed (only observable via `useRenderLabState`) → `state-changed`.
5. **Parent re-render** — no local signal changed, an ancestor rendered in the same `commitTime`, and `isMemoized === false` → `parent-rerender`.
6. **Unknown** — none of the above (external store subscription, `forceUpdate`, uninstrumented state) → `unknown`, with a suggestion to wrap with `useRenderLabState`/`useTrackedContext`.

**Memo bail-out ("prevented render")** is inferred by absence, not observed directly — React's Profiler never fires `onRender` for a subtree that fully bails out. The dashboard (Phase 5) can correlate: parent has an event at commit `T`, a known descendant does not → flagged as "likely prevented by memo," explicitly not a certainty. This is a documented limitation, not a bug.

## 6. Phase 7 Replay — resolved now

**Decision: replay = a render-event timeline scrub grouped into commit frames, not DOM/pixel snapshot replay.**

Justification: RenderLab's differentiator is render performance and reasoning, not session recording — rrweb-style DOM/pixel replay is a commoditized, already-solved problem (LogRocket, FullStory) an order of magnitude more expensive to capture (DOM mutations, CSSOM, canvas frames) and with far more PII exposure, for no differentiation gain. Timeline scrub replay requires **zero new capture concepts** beyond §4.3: `sequence`/`commitTime` give strict orderable commit frames, `componentPath` lets the UI reconstruct tree shape at any point, `phase: 'unmount'` events show removal, `propsDiff` is exactly the "what changed" data the scrub UI shows per frame. `stateSnapshotRef` is an optional out-of-band pointer, populated only when `replay.enabled` and only for components using `useRenderLabState` — kept out of the default payload so replay support doesn't inflate every event.

**Explicit limitation**: replay can show exactly what changed for instrumented components and _that_ something changed for others, but cannot reconstruct arbitrary internal state for components that never opted into `useRenderLabState`. Consistent with, not a regression from, the capture model.

## 7. Zustand store shape

**Pattern**: React Query owns all server-derived data (events, sessions, component-tree aggregates) — fetching/caching/retry/loading-error-empty machinery comes for free. Zustand owns only client/UI/ephemeral state with no server representation, referencing server objects **by ID only**:

```ts
const { selectedEventId } = useTimelineStore();
const { data: event, isLoading, isError } = useRenderEvent(selectedEventId); // React Query
```

Four feature-scoped stores:

- **`useUIStore`**: `theme`, `resolvedTheme`, `sidebarCollapsed`, `activeView`, `isOffline`, `toast` + setters.
- **`useComponentTreeStore`**: `expandedComponentIds` (plain object, persist-friendly), `selectedComponentId`, `hoveredComponentId`, `treeSearchQuery`, `showOnlyReRendered` + actions.
- **`useTimelineStore`**: `visibleRange` (drives Phase 4 windowed query), `zoomLevel`, `selectedEventId` (drives why-did-it-render panel), `playback: { mode, cursorTime, speed }` (drives Phase 7 scrub) + actions.
- **`useFilterStore`**: `sessionId`, `appId`, `timeRange`, `searchQuery`, `sortBy`, `sortDirection`, `renderReasonFilter` + actions — fields double as React Query keys, keeping filter UI and fetch params in lockstep with no duplicated state (Phase 8).

Choosing Zustand's selector-based subscriptions over plain Context for UI state is itself an application of what RenderLab detects: Context re-renders every consumer on value change, Zustand selectors scope re-renders to the slice actually read — avoiding the "parent-rerender" class of waste the SDK exists to surface.

## 8. Explicit simplifications (SDK/dashboard side)

1. **`React.Profiler` API, not a fiber walker.** Stable and documented vs. undocumented `__REACT_DEVTOOLS_GLOBAL_HOOK__` walking (used by React Scan / why-did-you-render) that can break across React versions. Trade-off: components must be explicitly wrapped; won't silently break for paying customers on a React minor bump.
2. **No compile-time auto-instrumentation** (no babel/SWC plugin) in Phase 1 — opt-in wrapping only, explicit over implicit, narrower Phase 1 build-tool surface. Candidate future enhancement.
3. **`state-changed`/`context-changed` detection is best-effort**, not exact, for components that don't opt into `useRenderLabState`/`useTrackedContext` — a true fiber walker could read `memoizedState` directly; Profiler-based capture cannot.
4. **Memo bail-out is inferred by absence**, never observed directly (§5).
5. **Replay is timeline scrub, not DOM/pixel** (§6) — deliberate scope decision.
6. **Props diff is shallow (`maxPropDepth: 1`) and values redacted/truncated by default** — full deep diff/raw capture is opt-in, trading completeness for predictable payload size and avoiding incidental PII capture in production by default.
7. **Sampling defaults to full in dev, partial in prod** — a cost/volume control, not a detection gap; must be documented as such.
8. **`componentPath` built via an internal Context thread-through**, not true fiber parent pointers (Profiler API doesn't expose fiber structure) — small runtime cost, only reflects instrumented ancestors.

## 9. What's next

This document is the Phase 0 checkpoint. Scaffolding (monorepo config, empty typed packages, CI skeleton, git init) follows as a second checkpoint once this is reviewed — no SDK/API/dashboard implementation code is written until both are approved.
