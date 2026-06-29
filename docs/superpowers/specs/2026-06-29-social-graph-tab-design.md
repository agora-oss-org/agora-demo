# Design — ☀️ Social tab (`@agora-sdk/social-*` integration)

**Date:** 2026-06-29
**Status:** Approved (design), pending implementation plan
**Author:** Jenova + Claude

## Purpose

Integrate the published `@agora-sdk/social-core` + `@agora-sdk/social-react-js` packages
(`../agora-sdk-plus/packages/social`) into the agora-demo as a new top-level **☀️ Social** tab.

This demo is a **1:1 compatibility proof / manual wire-contract test harness** for the Agora SDK —
every tab exercises exactly one SDK surface end-to-end. The Social tab does the same for the social
graph ("the Garden 🌷"): the three member-facing lenses (Weather, Constellation, Neighborhood) plus
the Transparency disclosure.

## What the social SDK is (context)

A read-only "social graph as commons" layer with a strong privacy ethic — **no crypto, no
persistence, no realtime**. Four surfaces, all `GET /v7/:projectId/social/*`, bearer-authed, and
feature-gated server-side:

| Lens | Component | Hook | Shows | Privacy tier |
|---|---|---|---|---|
| ☀️ Weather | `<CommunityWeather/>` | `useSocialWeather` | One aggregate warmth orb + 7-day trend | Aggregate |
| ✨ Constellation | `<Constellation/>` | `useSocialConstellation` | Anonymous, re-randomized cluster blobs (d3-force) | k-anonymous |
| 🏡 Neighborhood | `<Neighborhood/>` | `useSocialNeighborhood` | The caller's own named ties, lit by dyadic brightness | Self-view only |
| 🪟 Transparency | `<SocialTransparency/>` | `useSocialTransparency` | Which lenses are on + the tuning behind them | Aggregate |

Key facts confirmed during brainstorming:

- **Published on npm at `0.9.2`** AND a local fork `dist/esm` exists → mirror the demo's existing
  secure-chat alias pattern (local fork when present on disk, npm in Docker/CI). Self-containment of
  the prod image is preserved (build context has no sibling dir).
- **Components are self-contained & self-gating**: each reads its own hook internally and renders
  `null` when its lens is disabled or the graph is `503`. The host app just drops them in.
- New runtime dep: **`d3-force`** (transitive dep of `social-react-js`, used by `<Constellation/>`).
- Needs **`<SocialProvider projectId baseUrl accessToken>`** mounted *inside auth*: it fetches
  `GET /social/transparency` once on mount (bearer token required) and stores the resolved config so
  every hook/component self-gates without re-probing.
- `@agora-server/contract` is a **type-only** re-export (erased from emitted JS) → no runtime dep.
- Degradation surface: transport throws a typed `SocialApiError` (`status` + machine `code`);
  `isSocialDegradation(err)` classifies "hide this surface" (graph-unavailable / lens-disabled) vs a
  real error. Hooks fail soft — a degradation clears data and is NOT surfaced via `error`.

## Design decisions (from brainstorming)

1. **UI placement:** one dedicated top-level tab (matches the demo's "one tab per SDK surface"
   structure), not ambient distribution. **No header Weather chip** (YAGNI).
2. **Tab name:** **☀️ Social**.
3. **Scope:** render the four real drop-in **components** AND a **raw-debug column** beside each that
   dumps the hook's raw return values — so the harness can verify exactly what the server sends and
   why a component rendered `null`.

## Architecture

### 1. Dependencies & build wiring

- **`package.json`** — add `@agora-sdk/social-core` and `@agora-sdk/social-react-js` at `^0.9.2`
  (matching the secure-chat pin style). Run `pnpm install`; `d3-force` arrives transitively.
- **`vite.config.ts`** — add a third local-fork alias block, modeled on the existing secure-chat
  block:
  - On-disk guard: `existsSync(../agora-sdk-plus/packages/social/core/dist/esm/index.js)`.
  - When present, alias `@agora-sdk/social-core` and `@agora-sdk/social-react-js` to their local
    `dist/esm/index.js`. (Only two packages — no crypto subpaths like secure-chat.) Log a
    `[vite] @agora-sdk/social-* → LOCAL workspace` line for parity.
  - Auto-off in Docker/CI (no sibling dir in build context → npm packages used).
  - Add `d3-force` to `optimizeDeps.include` (same treatment as `axios`).

### 2. Provider wiring (`Shell.tsx`)

Mount `<SocialProvider projectId={PROJECT_ID} baseUrl={API_BASE_URL} accessToken={accessToken}>`
wrapping the authed body, **inside the `accessToken` early-return guard** so it only mounts once
signed in (fetches transparency once at "app init"; re-passing `accessToken` keeps the token fresh
across rotation). `PROJECT_ID` / `API_BASE_URL` come from `config.ts`; `accessToken` from the
existing `useAuth()`. Placing it high (wrapping `ProfileViewerProvider`) keeps a future header chip
viable without re-architecting, but no chip is built now.

### 3. New file: `src/Social.tsx`

One file, matching demo conventions: a header comment naming the SDK surface + the four `/social/*`
routes it hits, `styles.css` utility classes (`col`, `row`, `panel`, `card`, `muted`, `prewrap`,
etc.), and the demo's deliberate loose `as any` typing on hook returns.

Layout: four stacked `panel` cards, each pairing the **real component** with a **raw-debug column**:

| Card | Renders | Raw-debug column |
|---|---|---|
| ☀️ Weather | `<CommunityWeather/>` | `value, band, trend, asOf, loading, error`; note when the component returned `null` (lens disabled) |
| ✨ Constellation | `<Constellation width height/>` + a "re-randomize" remount button | `blobs[]` (size bucket + warmth band per blob), `asOf`, `method`, `loading`, `error` |
| 🏡 Neighborhood | `<Neighborhood showInteractionsToggle/>` | per-tie `userId`/`username`/`brightness` (the actual number) / `tieKinds`; `includesInteractions`; live toggle state |
| 🪟 Transparency | `<SocialTransparency/>` | every `ResolvedSocialConfig` flag + half-lives + k-floor; provider `configLoading` / `configError` |

Cross-cutting pieces in this file:

- A small **palette legend** exercising the exported `bandColors` / `brightnessTreatment` helpers
  (one swatch per `WeatherBand`, iterating `WEATHER_BANDS`).
- An **error classifier** using `isSocialDegradation()` so each debug column distinguishes
  *"hidden: lens disabled / graph unavailable"* from a *real error* — making it obvious why a
  component rendered `null`.

The raw-debug columns read the same `useSocial*` hooks the components do (legal because the tab is
inside `<SocialProvider>`); rendering the hook twice is fine — the provider shares one client and the
hooks are cheap reads over already-fetched/slow-moving data.

### 4. `Shell.tsx` tab registration

Add `"social"` to the `Tab` union, the `TABS` array (label `☀️ Social`), `TAB_TO_PATH`, and the
conditional render (`{tab === "social" && <Social />}`). No drill-down → does not participate in
`rootKey` remounting.

### 5. Analytics (`analytics.ts`)

- Add `PATHS.social = "/social"` for the per-tab page view (fired by Shell's existing page-view
  effect).
- Add 2–3 low-cardinality `AnalyticsEvent`s, fired on success only, enums/booleans only (never IDs
  or free text), per the existing rule:
  - `social_lens_rendered` — enum of which lens actually rendered (non-null).
  - `social_interactions_toggled` — boolean (the new toggle value).
  - `social_refreshed` — enum of which lens was manually refreshed/re-randomized.

### 6. Docs (`CLAUDE.md`)

Add a row to the feature → SDK-surface table for `Social.tsx`
(`SocialProvider` + `useSocialWeather`/`useSocialConstellation`/`useSocialNeighborhood`/
`useSocialTransparency`; the `/social/*` lenses).

## Data flow

```
ReplykeProvider (token store)
  └─ ChatProvider
      └─ SecureChatGate
          └─ Shell  (useAuth → accessToken)
              └─ [authed] SocialProvider(projectId, baseUrl, accessToken)
                            │  on mount: GET /social/transparency → config (or ALL_DISABLED on 503)
                            └─ Social tab
                                 ├─ <CommunityWeather/>      ← useSocialWeather   → GET /social/weather
                                 ├─ <Constellation/>         ← useSocialConstellation → GET /social/constellation
                                 ├─ <Neighborhood/>          ← useSocialNeighborhood  → GET /social/neighborhood
                                 ├─ <SocialTransparency/>    ← useSocialTransparency   (reads provider config, no 2nd request)
                                 └─ raw-debug columns        ← same hooks, raw values
```

## Error handling

- **Graph off / lens disabled** (`503 social/graph-unavailable`, `400 social/<lens>-disabled`):
  components render `null`; debug column labels it *"hidden — disabled/unavailable"* via
  `isSocialDegradation`. No error shown to the member (matches SDK fail-soft contract).
- **Real error:** surfaced in the debug column as the `SocialApiError` `status` + `code`.
- **Empty/forming states:** Weather `value: null`/`band: "quiet"` and Constellation `asOf: null`
  render the SDK's built-in "still forming" treatments; debug column shows the raw nulls.

## Testing / verification

Manual, by clicking through the tab (the demo has no test runner; `tsc -b` is the only static
check). Verification checklist:

1. `pnpm build` passes (typecheck + bundle) with the new packages and `d3-force`.
2. With the local fork present, `pnpm dev` logs the new `[vite] @agora-sdk/social-* → LOCAL` line and
   the tab renders against local SDK edits.
3. Against a server with the graph enabled: all four lenses render; debug columns show real wire
   values; Neighborhood toggle re-fetches and the echoed `includesInteractions` updates; Constellation
   re-randomizes on remount.
4. Against a server with the graph off (`503`) or a lens disabled (`400`): components hide; debug
   columns explain why; no error surfaced to the member.

## Scope guardrails (YAGNI)

- No header Weather chip, no ambient distribution across other tabs.
- No new styling framework — reuse `styles.css` utility classes.
- No changes to the social SDK packages themselves — purely additive consumption.
- No drill-down / routing for the tab.

## Touched files

- `package.json` (+ `pnpm-lock.yaml` via install)
- `vite.config.ts`
- `src/Shell.tsx`
- `src/Social.tsx` (new)
- `src/analytics.ts`
- `CLAUDE.md`
