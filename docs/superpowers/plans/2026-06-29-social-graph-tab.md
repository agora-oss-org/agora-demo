# ☀️ Social Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new top-level **☀️ Social** tab that exercises the `@agora-sdk/social-core` + `@agora-sdk/social-react-js` packages end-to-end — the four social-graph lenses (Weather, Constellation, Neighborhood, Transparency) rendered as real SDK components beside raw-debug columns.

**Architecture:** Mount `<SocialProvider>` in `Shell.tsx` once signed in (it fetches `/social/transparency` on mount). A new `src/Social.tsx` renders each lens's drop-in component paired with a debug column reading the same `useSocial*` hook. Build wiring mirrors the demo's existing secure-chat local-fork alias pattern so the prod Docker image stays self-contained (npm packages) while local SDK edits work via on-disk dist aliases.

**Tech Stack:** Vite + React + TypeScript, pnpm, `@agora-sdk/social-*@^0.9.2`, `d3-force` (transitive), Umami analytics.

## Global Constraints

- **Package manager is pnpm** — never run `npm install` (it would create a divergent `package-lock.json`). Use `pnpm install` / `pnpm build`.
- **No test runner, no linter.** The only static check is `pnpm build` (`tsc -b` + vite build). Verification is otherwise manual click-through. There are no unit tests to write.
- **Loose typing is the house style** — cast hook returns `as any`; do not fight the SDK's incomplete exported types.
- **Analytics rule:** new events go in the `AnalyticsEvent` union in `src/analytics.ts` (a typo there fails the build); fire on success only; metadata is low-cardinality enums/booleans only — **never IDs or free text**.
- **No mid-task commits** (Jenova's standing rule). Do NOT commit between tasks. All commits happen at the end (final task) and only after Jenova approves. Each task ends with a build/verify step instead of a commit.
- **Tab name is exactly `☀️ Social`** (path `/social`).
- **Version pin:** `@agora-sdk/social-core` and `@agora-sdk/social-react-js` at `^0.9.2` (matching the secure-chat pin style).

---

### Task 1: Dependencies & Vite build wiring

**Files:**
- Modify: `package.json` (dependencies block) + `pnpm-lock.yaml` (via install)
- Modify: `vite.config.ts` (add social alias block ~after line 65; merge into `resolve.alias`; add to `optimizeDeps.include`)

**Interfaces:**
- Produces: the package names `@agora-sdk/social-core` and `@agora-sdk/social-react-js` resolvable in source (npm-installed, or aliased to the local fork when its `dist/esm` is present). No exported symbols of our own.

- [ ] **Step 1: Add the two packages**

Run:
```bash
pnpm add @agora-sdk/social-core@^0.9.2 @agora-sdk/social-react-js@^0.9.2
```
This updates `package.json` + `pnpm-lock.yaml` and pulls `d3-force` transitively (it is a dependency of `social-react-js`).

- [ ] **Step 2: Verify d3-force came in transitively**

Run:
```bash
pnpm why d3-force
```
Expected: shows `d3-force` resolved under `@agora-sdk/social-react-js`. (No need to add it to `dependencies` directly.)

- [ ] **Step 3: Add the social local-fork alias block to `vite.config.ts`**

Insert this block immediately after the `secureAlias` const (after the block ending at the `: {};` for `secureAlias`, ~line 65), before `export default defineConfig({`:

```ts
// Social SDK (agora-sdk-plus) local-fork override — same on-disk-guarded mechanism as the
// secure-chat block above, but only two packages (no crypto subpaths). When the sibling
// agora-sdk-plus/packages/social workspace is present AND built (dist/esm exists) we alias the
// package names at its dist so local SDK edits take effect without republishing; OFF automatically
// when the sibling isn't present (Docker/CI build context is the demo dir only → npm packages used).
const socialRoot = (p: string) =>
  fileURLToPath(new URL(`../agora-sdk-plus/packages/social/${p}`, import.meta.url));
const socialCoreEsm = socialRoot("core/dist/esm/index.js");
const useLocalSocial = existsSync(socialCoreEsm);
if (useLocalSocial) {
  // eslint-disable-next-line no-console
  console.log("[vite] @agora-sdk/social-* → LOCAL workspace (dist/esm). Rebuild the fork after edits.");
}
const socialAlias: Record<string, string> = useLocalSocial
  ? {
      "@agora-sdk/social-core": socialCoreEsm,
      "@agora-sdk/social-react-js": socialRoot("react-js/dist/esm/index.js"),
    }
  : {};
```

- [ ] **Step 4: Merge `socialAlias` into `resolve.alias`**

Change the alias line (currently `alias: { ...sdkAlias, ...secureAlias },`) to:

```ts
    alias: { ...sdkAlias, ...secureAlias, ...socialAlias },
```

- [ ] **Step 5: Pre-bundle the social packages + d3-force**

In `optimizeDeps.include`, add the three entries (mirroring how `@agora-sdk/core` is both aliased and included, and how `axios` is included as a CJS-friendly dep). The `include` array becomes:

```ts
    include: [
      "@agora-sdk/core",
      "@agora-sdk/react-js",
      "@agora-sdk/social-core",
      "@agora-sdk/social-react-js",
      "react",
      "react-dom",
      "react-redux",
      "@reduxjs/toolkit",
      "axios",
      "socket.io-client",
      "d3-force",
    ],
```

- [ ] **Step 6: Verify the build typechecks and bundles**

Run:
```bash
rm -rf node_modules/.vite && pnpm build
```
Expected: `tsc -b` passes and `vite build` completes with no errors. (Nothing imports the packages yet, so this just proves resolution + install are healthy.)

- [ ] **Step 7: Verify the local-fork alias log fires in dev (if the fork is checked out)**

Run:
```bash
pnpm dev
```
Expected (only when `../agora-sdk-plus/packages/social/core/dist/esm/index.js` exists): the boot logs include `[vite] @agora-sdk/social-* → LOCAL workspace (dist/esm).`. Stop the dev server (Ctrl-C) after confirming.

---

### Task 2: Analytics — path + events

**Files:**
- Modify: `src/analytics.ts:26-46` (the `AnalyticsEvent` union) and `src/analytics.ts:50-64` (the `PATHS` object)

**Interfaces:**
- Produces: `PATHS.social` (`"/social"`); three new `AnalyticsEvent` names: `"social_lens_rendered"`, `"social_interactions_toggled"`, `"social_refreshed"` — consumed by `Shell.tsx` (page view) and `Social.tsx` (events) in later tasks.

- [ ] **Step 1: Add the three events to the `AnalyticsEvent` union**

Replace the final line of the union:
```ts
  // profile / discovery
  | "update_profile" | "submit_search" | "change_feed_sort";
```
with:
```ts
  // profile / discovery
  | "update_profile" | "submit_search" | "change_feed_sort"
  // social graph (read-only lenses) — metadata: { lens: "weather"|"constellation"|"neighborhood" } or { on: boolean }
  | "social_lens_rendered" | "social_interactions_toggled" | "social_refreshed";
```

- [ ] **Step 2: Add the `social` path**

In the `PATHS` object, add the entry after `secure: "/secure",`:
```ts
  social: "/social",
```

- [ ] **Step 3: Verify the build typechecks**

Run:
```bash
pnpm build
```
Expected: passes. (The new union members and path are unused so far — that's fine, TypeScript does not flag unused union members or object keys.)

---

### Task 3: The `Social.tsx` tab component

**Files:**
- Create: `src/Social.tsx`

**Interfaces:**
- Consumes: components/helpers from `@agora-sdk/social-react-js` (`CommunityWeather`, `Constellation`, `Neighborhood`, `SocialTransparency`, `bandColors`, `brightnessTreatment`); hooks/helpers from `@agora-sdk/social-core` (`useSocial`, `useSocialWeather`, `useSocialConstellation`, `useSocialNeighborhood`, `useSocialTransparency`, `isSocialDegradation`, `SocialApiError`, `WEATHER_BANDS`); `track` from `./analytics`.
- Produces: `export default function Social()` — a React component with no props, consumed by `Shell.tsx` in Task 4. **Must render inside `<SocialProvider>`** (Task 4 mounts it).

- [ ] **Step 1: Create `src/Social.tsx` with the full component**

```tsx
// Social.tsx — the ☀️ Social tab: exercises @agora-sdk/social-core + @agora-sdk/social-react-js, the
// "social graph as commons" surface (see agora-sdk-plus/packages/social/react-js/SOCIAL-GRAPH.md).
// Four read-only lenses, all GET /v7/:projectId/social/* (bearer-authed, feature-gated server-side),
// each rendered as the real drop-in SDK component PAIRED with a raw-debug column that dumps the hook's
// wire values — so this harness can verify what the server actually sends, and SEE why a component
// rendered null (lens disabled vs graph unavailable vs a real error).
//
//   ☀️ Weather        <CommunityWeather/>     useSocialWeather        GET /social/weather
//   ✨ Constellation   <Constellation/>        useSocialConstellation  GET /social/constellation
//   🏡 Neighborhood    <Neighborhood/>         useSocialNeighborhood   GET /social/neighborhood
//   🪟 Transparency    <SocialTransparency/>   useSocialTransparency    GET /social/transparency
//
// The <SocialProvider> is mounted in Shell.tsx (once signed in). NOTE: each useSocial* hook owns its
// OWN state, so the debug column's hook instance is INDEPENDENT of the one inside the SDK component
// (two fetches, two toggles). That's intentional here — it also proves the hooks work standalone.

import { useEffect, useState } from "react";
import {
  useSocial,
  useSocialWeather,
  useSocialConstellation,
  useSocialNeighborhood,
  useSocialTransparency,
  isSocialDegradation,
  SocialApiError,
  WEATHER_BANDS,
} from "@agora-sdk/social-core";
import {
  CommunityWeather,
  Constellation,
  Neighborhood,
  SocialTransparency,
  bandColors,
  brightnessTreatment,
} from "@agora-sdk/social-react-js";
import { track } from "./analytics";

// Render any caught social error in a member-safe, debug-friendly way: a "hide the surface"
// degradation (graph off / lens disabled) vs a real SocialApiError (status + machine code) vs an
// unexpected throw.
function describeError(err: unknown): string {
  if (err == null) return "—";
  if (isSocialDegradation(err)) return "hidden (lens disabled / graph unavailable)";
  if (err instanceof SocialApiError) return `SocialApiError ${err.status}${err.code ? ` ${err.code}` : ""}`;
  return String((err as any)?.message ?? err);
}

// One compact key/value row for the raw-debug columns.
function KV({ k, v }: { k: string; v: unknown }) {
  return (
    <div className="row" style={{ justifyContent: "space-between", gap: 12, fontSize: 13 }}>
      <span className="muted">{k}</span>
      <span className="prewrap" style={{ fontWeight: 600, textAlign: "right" }}>
        {typeof v === "object" && v !== null ? JSON.stringify(v) : String(v)}
      </span>
    </div>
  );
}

// Two-column card: the real SDK component on the left, the raw hook values on the right.
function LensCard({
  title,
  component,
  debug,
}: {
  title: string;
  component: React.ReactNode;
  debug: React.ReactNode;
}) {
  return (
    <div className="panel col" style={{ gap: 12 }}>
      <h3 style={{ margin: 0 }}>{title}</h3>
      <div className="row" style={{ gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div className="card" style={{ flex: "1 1 280px", minHeight: 80 }}>{component}</div>
        <div className="col" style={{ flex: "1 1 280px", gap: 4 }}>
          <div className="muted" style={{ fontSize: 12, textTransform: "uppercase" }}>raw hook values</div>
          {debug}
        </div>
      </div>
    </div>
  );
}

function WeatherCard() {
  const { weather, loading, error, refresh } = useSocialWeather() as any;
  useEffect(() => {
    if (weather) track("social_lens_rendered", { lens: "weather" });
  }, [Boolean(weather)]);
  return (
    <LensCard
      title="☀️ Community Weather"
      component={<CommunityWeather />}
      debug={
        <>
          <KV k="rendered?" v={weather ? "yes" : "null (disabled/loading/empty)"} />
          <KV k="value" v={weather?.value ?? null} />
          <KV k="band" v={weather?.band ?? "—"} />
          <KV k="trend" v={weather?.trend ?? null} />
          <KV k="asOf" v={weather?.asOf ?? "—"} />
          <KV k="loading" v={loading} />
          <KV k="error" v={describeError(error)} />
          <button onClick={() => { void refresh(); track("social_refreshed", { lens: "weather" }); }}>
            ↻ refresh
          </button>
        </>
      }
    />
  );
}

function ConstellationCard() {
  const { constellation, loading, error, refresh } = useSocialConstellation() as any;
  // The component re-randomizes its layout on mount / when the blob set changes; bump this key to
  // force a fresh layout pass (privacy: no stable blob positions across loads) without a refetch.
  const [layoutKey, setLayoutKey] = useState(0);
  useEffect(() => {
    if (constellation) track("social_lens_rendered", { lens: "constellation" });
  }, [Boolean(constellation)]);
  return (
    <LensCard
      title="✨ Constellation"
      component={<Constellation key={layoutKey} width={320} height={220} />}
      debug={
        <>
          <KV k="rendered?" v={constellation ? "yes" : "null (disabled/loading)"} />
          <KV k="asOf" v={constellation?.asOf ?? "null (still forming)"} />
          <KV k="method" v={constellation?.method ?? "—"} />
          <KV k="blobs" v={constellation?.blobs?.length ?? 0} />
          {(constellation?.blobs ?? []).map((b: any, i: number) => (
            <KV key={i} k={`  blob[${i}]`} v={`${b.size} · ${b.warmth}`} />
          ))}
          <KV k="loading" v={loading} />
          <KV k="error" v={describeError(error)} />
          <div className="row" style={{ gap: 8 }}>
            <button onClick={() => { setLayoutKey((k) => k + 1); track("social_refreshed", { lens: "constellation" }); }}>
              🎲 re-randomize layout
            </button>
            <button onClick={() => { void refresh(); }}>↻ refetch</button>
          </div>
        </>
      }
    />
  );
}

function NeighborhoodCard() {
  // Independent debug instance (own toggle/fetch) — see file header. We render OUR toggle in the debug
  // column so it's the source of truth; the component below also has its own built-in toggle.
  const { neighborhood, loading, error, includeInteractions, setIncludeInteractions } =
    useSocialNeighborhood() as any;
  useEffect(() => {
    if (neighborhood) track("social_lens_rendered", { lens: "neighborhood" });
  }, [Boolean(neighborhood)]);
  return (
    <LensCard
      title="🏡 Neighborhood"
      component={<Neighborhood showInteractionsToggle />}
      debug={
        <>
          <KV k="rendered?" v={neighborhood ? "yes" : "null (disabled/loading/empty)"} />
          <KV k="includesInteractions (echoed)" v={neighborhood?.includesInteractions ?? "—"} />
          <KV k="asOf" v={neighborhood?.asOf ?? "—"} />
          <KV k="ties" v={neighborhood?.ties?.length ?? 0} />
          {(neighborhood?.ties ?? []).map((t: any) => (
            <KV
              key={t.userId}
              k={`  ${t.name ?? t.username ?? String(t.userId).slice(0, 8)}`}
              v={`b=${t.brightness} [${t.tieKinds.join(",")}]`}
            />
          ))}
          <KV k="loading" v={loading} />
          <KV k="error" v={describeError(error)} />
          <label className="row" style={{ gap: 6 }}>
            <input
              type="checkbox"
              checked={includeInteractions}
              onChange={(e) => {
                setIncludeInteractions(e.target.checked);
                track("social_interactions_toggled", { on: e.target.checked });
              }}
            />
            includeInteractions (debug instance)
          </label>
        </>
      }
    />
  );
}

function TransparencyCard() {
  const { config, loading, error } = useSocialTransparency() as any;
  return (
    <LensCard
      title="🪟 Transparency"
      component={<SocialTransparency />}
      debug={
        <>
          <KV k="loading" v={loading} />
          <KV k="error" v={describeError(error)} />
          {config ? (
            Object.entries(config).map(([k, v]) => <KV key={k} k={k} v={v as unknown} />)
          ) : (
            <KV k="config" v="null (loading / unavailable)" />
          )}
        </>
      }
    />
  );
}

// Palette legend — exercises the exported bandColors() over every WeatherBand plus a
// brightnessTreatment() sample, so the shared climate vocabulary renders even when every lens is off.
function PaletteLegend() {
  return (
    <div className="panel col" style={{ gap: 8 }}>
      <h3 style={{ margin: 0 }}>
        🎨 Climate palette <small className="muted">(bandColors / brightnessTreatment)</small>
      </h3>
      <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
        {WEATHER_BANDS.map((band) => {
          const c = bandColors(band);
          return (
            <div key={band} className="col" style={{ alignItems: "center", gap: 4 }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: c.core, boxShadow: `0 0 16px ${c.glow}` }} />
              <span className="muted" style={{ fontSize: 12 }}>{band}</span>
            </div>
          );
        })}
      </div>
      <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
        {[0.15, 0.4, 0.7, 1.0].map((b) => {
          const t = brightnessTreatment(b);
          return (
            <div key={b} className="col" style={{ alignItems: "center", gap: 4 }}>
              <div
                style={{
                  width: 28 * t.scale,
                  height: 28 * t.scale,
                  borderRadius: "50%",
                  background: t.isSprout ? "#e0a955" : "#f4c64a",
                  boxShadow: `0 0 ${t.glowRadius}px rgba(244,198,74,${t.glowOpacity})`,
                }}
              />
              <span className="muted" style={{ fontSize: 12 }}>{t.isSprout ? "sprout" : `b=${b}`}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Social() {
  const { config, configLoading, configError } = useSocial() as any;
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="panel col" style={{ gap: 8 }}>
        <h2 style={{ margin: 0 }}>
          ☀️ Social graph <small className="muted">— the Garden 🌷 (read-only commons)</small>
        </h2>
        <p className="muted" style={{ margin: 0 }}>
          Four privacy-first lenses from <code>@agora-sdk/social-*</code>. Each shows the real drop-in SDK
          component beside the raw hook values it received. Components render <code>null</code> when a lens
          is disabled or the graph is unavailable — the debug column tells you which.
        </p>
        <KV k="provider configLoading" v={configLoading} />
        <KV k="provider configError" v={describeError(configError)} />
        <KV k="graphEnabled" v={config?.graphEnabled ?? "—"} />
      </div>
      <PaletteLegend />
      <WeatherCard />
      <ConstellationCard />
      <NeighborhoodCard />
      <TransparencyCard />
    </div>
  );
}
```

- [ ] **Step 2: Verify it typechecks**

Run:
```bash
pnpm build
```
Expected: passes. (`Social` is not yet imported anywhere; `tsc -b` still typechecks the file because it's under `src/`. The drop-in components and hooks must all resolve from the installed/aliased packages.)

---

### Task 4: Wire `Social` into `Shell.tsx` (provider + tab)

**Files:**
- Modify: `src/Shell.tsx` (imports; `Tab` union ~line 19; `TAB_TO_PATH` ~line 23; `TABS` ~line 32; conditional render ~line 170-188; final `return` ~line 194-201)

**Interfaces:**
- Consumes: `Social` default export (Task 3); `SocialProvider` from `@agora-sdk/social-core`; `PATHS.social` (Task 2); `API_BASE_URL`, `PROJECT_ID` from `./config`; existing `accessToken` from `useAuth()`.
- Produces: the live `☀️ Social` tab.

- [ ] **Step 1: Add the imports**

After the existing `import Me from "./Me";` line, add:
```ts
import Social from "./Social";
import { SocialProvider } from "@agora-sdk/social-core";
import { API_BASE_URL, PROJECT_ID } from "./config";
```

- [ ] **Step 2: Add `"social"` to the `Tab` union**

Change:
```ts
type Tab = "feed" | "spaces" | "search" | "chat" | "secure" | "notifications" | "profile";
```
to:
```ts
type Tab = "feed" | "spaces" | "search" | "chat" | "secure" | "social" | "notifications" | "profile";
```

- [ ] **Step 3: Add `social` to `TAB_TO_PATH`**

In the `TAB_TO_PATH` map, add after the `secure: PATHS.secure,` entry:
```ts
  social: PATHS.social,
```

- [ ] **Step 4: Add the tab button to `TABS`**

In the `TABS` array, add after the `{ id: "secure", label: "🔒 Secure Chat" },` entry:
```ts
  { id: "social", label: "☀️ Social" },
```

- [ ] **Step 5: Add the conditional render**

After the line `{tab === "secure" && (unlocked ? <SecureChat /> : <SecureUnlock />)}`, add:
```tsx
      {tab === "social" && <Social />}
```

- [ ] **Step 6: Wrap the authed body in `<SocialProvider>`**

Change the final `return` (currently wrapping `body` in `<ProfileViewerProvider>`):
```tsx
  return (
    <ProfileViewerProvider
      currentUserId={user?.id}
      onEditOwnProfile={() => { setDeepLink(null); setTab("profile"); }}
    >
      {body}
    </ProfileViewerProvider>
  );
```
to:
```tsx
  return (
    <SocialProvider projectId={PROJECT_ID} baseUrl={API_BASE_URL} accessToken={accessToken}>
      <ProfileViewerProvider
        currentUserId={user?.id}
        onEditOwnProfile={() => { setDeepLink(null); setTab("profile"); }}
      >
        {body}
      </ProfileViewerProvider>
    </SocialProvider>
  );
```
(This sits after the `if (!accessToken) return …` guards, so `SocialProvider` only mounts once signed in and fetches `/social/transparency` once at app init; re-passing `accessToken` keeps the token fresh across rotation.)

- [ ] **Step 7: Verify the build typechecks and bundles**

Run:
```bash
pnpm build
```
Expected: passes.

- [ ] **Step 8: Manual verification against a running server**

Run `pnpm dev` and click through (see CLAUDE.md "Local stack" to boot the server + seed the demo user if needed). Confirm:
- The `☀️ Social` tab appears in the tab bar and selecting it shows the intro panel + palette legend + four lens cards.
- **Graph enabled:** lenses render; debug columns show real wire values; the Neighborhood debug toggle flips and the echoed `includesInteractions` updates; the Constellation `🎲 re-randomize layout` button changes the blob layout.
- **Graph off (`503`) or a lens disabled (`400`):** the affected component renders nothing and its debug column reads `hidden (lens disabled / graph unavailable)` — no error shown to the member.
- The palette legend swatches render (proves `bandColors`/`brightnessTreatment` exports resolve) even if every lens is disabled.

Stop the dev server after confirming.

---

### Task 5: Docs + final verification + commit

**Files:**
- Modify: `CLAUDE.md` (the feature → SDK-surface table)

**Interfaces:**
- Consumes: everything from Tasks 1-4.
- Produces: the committed feature.

- [ ] **Step 1: Add the `Social.tsx` row to the table in `CLAUDE.md`**

In the feature-file table (the one with rows for `Login.tsx`, `Feed.tsx`, etc.), add after the `secure/SecureChat.tsx` row:
```
| `Social.tsx` | `SocialProvider` + `useSocialWeather`, `useSocialConstellation`, `useSocialNeighborhood`, `useSocialTransparency` (from `@agora-sdk/social-*`) | the **☀️ Social** tab: the read-only social-graph "commons" — Weather / Constellation / Neighborhood / Transparency lenses, each rendered as the SDK's drop-in component beside a raw-debug column (`GET /social/*`) |
```

- [ ] **Step 2: Final full build**

Run:
```bash
rm -rf node_modules/.vite && pnpm build
```
Expected: `tsc -b` + `vite build` both pass clean.

- [ ] **Step 3: Request commit approval (do NOT commit unprompted)**

Per Jenova's standing rule, show her the diff summary (`git status` + `git diff --stat`) and ask for approval before committing. Suggested commit message once approved:
```
feat: add ☀️ Social tab exercising @agora-sdk/social-*

Renders the four social-graph lenses (Weather, Constellation, Neighborhood,
Transparency) as drop-in SDK components paired with raw-debug columns. Wires
SocialProvider in Shell, mirrors the secure-chat local-fork alias pattern in
vite.config.ts, and adds /social analytics.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
```

---

## Self-Review

**Spec coverage:**
- §1 Dependencies & build wiring → Task 1 ✓
- §2 Provider wiring → Task 4 Step 6 ✓
- §3 `Social.tsx` (components + debug columns + palette legend + error classifier) → Task 3 ✓
- §4 Shell tab registration → Task 4 Steps 2-5 ✓
- §5 Analytics → Task 2 ✓
- §6 Docs (CLAUDE.md row) → Task 5 Step 1 ✓
- Data flow / error handling / forming states → covered by Task 3's component (`describeError`, raw nulls shown) and verified in Task 4 Step 8 ✓
- Testing/verification → manual click-through in Task 4 Step 8 + final build in Task 5 Step 2 (no test runner exists, per Global Constraints) ✓

**Placeholder scan:** No TBD/TODO; all code blocks complete; commit deferred to Task 5 by Jenova's rule.

**Type consistency:** Hook return field names match the SDK exactly — `weather.{value,band,trend,asOf}`, `constellation.{blobs[].{size,warmth},asOf,method}`, `neighborhood.{ties[].{userId,username,name,avatar,brightness,tieKinds},includesInteractions,asOf}`, `config.*` (rendered generically via `Object.entries`). Hook tuple names: `useSocialWeather`/`useSocialConstellation` → `{ ..., refresh }`; `useSocialNeighborhood` → `{ ..., includeInteractions, setIncludeInteractions }`; `useSocialTransparency` → `{ config, loading, error }`; `useSocial` → `{ rest, config, configLoading, configError, projectId }`. Component props: `<Constellation width height/>`, `<Neighborhood showInteractionsToggle/>` — all confirmed against source. Tab id `"social"` consistent across union/TABS/TAB_TO_PATH/render. `PATHS.social` consistent between Task 2 and Task 4.
