# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A standalone Vite + React (TypeScript) app that drives the **real Agora SDK hooks**
(`@agora-sdk/react-js` + `@agora-sdk/core`) against a running Agora server. It is a **1:1
compatibility proof / manual test harness** for the SDK, not a product. Every feature tab exists to
exercise one SDK surface end-to-end (auth, profile editing, feed + image uploads, comments,
reactions, inline entity edit, nested spaces, semantic search, live socket.io chat + DMs,
connections, notifications).

When something breaks here it usually means a server↔SDK contract mismatch, not an app bug (e.g.
GET-vs-POST shape mismatches, `null` optional fields rejected by create endpoints, `sourceId=null`
treated as a literal filter) — check the server route against what the SDK actually sends.

## Commands

```bash
npm run dev       # Vite dev server → http://localhost:5174
npm run build     # tsc -b (typecheck) + vite build
npm run preview   # serve the production build
```

There are **no tests and no linter** — verification is manual, by clicking through the tabs. The
build's `tsc -b` is the only static check.

### Local stack (the demo needs an Agora server running)

```bash
cd ../agora-server/apps/api && npm run dev                       # 1. boot Agora server (separate terminal)
cd ../agora-server/apps/api && node scripts/seed-demo-user.mjs   # 2. seed demo user (once)
npm install && npm run dev                              # 3. run this demo
```

Env is split in two — **both gitignored**; copy the committed `*.example` templates to start:

- **`env.vite`** (← `env.vite.example`) — most of the client `VITE_*` vars. `vite.config.ts` loads
  it via Node's native `process.loadEnvFile`, and Vite inlines `VITE_*` into the bundle:
  `VITE_API_BASE_URL` (the example defaults to a local server `http://localhost:4000/v7`; set
  `https://agora.recoverysky.net/v7` to test the deployed one), `VITE_DEMO_EMAIL`, `VITE_ADMIN_URL`,
  and the Umami tracker vars.
- **`.env`** (← `.env.example`) — `AGORA_UMAMI_API_KEY` (a true secret: **not** `VITE_`-prefixed, so
  Vite never bundles it — the server-side Umami *reporting* key) **plus** `VITE_DEMO_PASSWORD` (the
  login prefill — it *is* `VITE_`-prefixed and Vite reads `.env` by default, so it still ships in the
  bundle as the prefill needs; kept beside the other credential).

The `env.vite` load is guarded by an on-disk check, so in Docker/CI — where `env.vite` is absent and
`VITE_*` arrive from build args / `-e` — it's skipped and the vars are read straight from the
environment.

### Docker

```bash
docker compose up --build     # Vite dev container (HMR) → http://localhost:5174
```

Dev container only (no nginx/prod image). `VITE_*` are baked from build args and overridable at
runtime via `-e` / compose `environment:` (Vite reads them at dev-server start). Use
`VITE_API_BASE_URL=http://host.docker.internal:4000/v7` to reach a server on the host. The build is
self-contained because the SDK comes from npm (below) — no sibling dir in the build context.

## How the SDK is consumed (critical to understand)

The SDK is the **published npm packages** `@agora-sdk/core` + `@agora-sdk/react-js` (normal
`dependencies`). Source imports them by their real names. `vite.config.ts` **dedupes** `react`,
`react-dom`, `react-redux`, `@reduxjs/toolkit` so the SDK shares the app's single React/Redux
instance (otherwise hooks break).

**Automatic local-fork override:** `vite.config.ts` checks whether the sibling
`../agora-sdk/packages/{core,react-js}/dist/esm/index.js` exist on disk. If they do (you have the
fork checked out next to the demo **and built**), it aliases the package names at that dist so local
SDK edits take effect without republishing — it logs `[vite] @agora-sdk → LOCAL fork` at boot.
**Rebuild the fork (`pnpm build-all` in `../agora-sdk`) after editing it, and restart this dev server
to pick up a newly-present alias** (Vite reads config only at boot). **When you change the *contents*
of an already-aliased dist (not add a new one), also clear Vite's pre-bundle —
`rm -rf node_modules/.vite` (or `pnpm run dev --force`) — then restart; `optimizeDeps` fingerprints
the cache on package version, not the aliased file's bytes, so a plain restart keeps serving the
stale bundle.** The check is on-disk, so the
alias is automatically **off in the Docker build context / CI** (build context is the demo dir only —
no sibling — so the `npm ci`'d packages are used), keeping the image self-contained. To force npm
even locally, remove/rename the fork's `dist`, or temporarily blank the alias.

The SDK takes its server URL from the `baseUrl` prop on `ReplykeProvider` (parsed from
`VITE_API_BASE_URL` in `App.tsx`); the SDK no longer sniffs env directly.

## Architecture

`main.tsx` → `App.tsx` (`ReplykeProvider` projectId+baseUrl, then `ChatProvider` for the socket.io
connection) → `Shell.tsx`.

`Shell.tsx` is the auth gate and tab router: `useAuth()` gives `initialized`/`accessToken`; until
authed it renders `Login.tsx`, otherwise a simple `useState` tab switch across the feature panels
(Feed, Spaces, Search, Chat, Connections, Inbox, Me). There is no router library — tabs, and
drill-downs within a tab (entity detail, space detail, create forms), are all conditional renders
swapped via local state.

Each feature file maps to one SDK surface (and the server route it hits, noted in each file's
header comment):

| File | SDK hook(s) / provider | Exercises |
|------|------------------------|-----------|
| `Login.tsx` | `useAuth` (`signInWithEmailAndPassword`, `signUpWithEmailAndPassword`) | `/auth`; handles the email-confirmation sign-up flow |
| `Profile.tsx` | `useUser().updateUser` | edit own username/name/bio/avatar (PATCH `/users/:id`) |
| `Feed.tsx` | `useEntityList` | list entities; routes to `CreateEntity` / `EntityView` |
| `CreateEntity.tsx` | `useCreateEntity` | create an entity, optional `spaceId` + multipart image upload |
| `EntityView.tsx` | `EntityProvider` + `useEntity`, `useReactionToggle`, `useCommentSectionData` | one entity: image display, owner inline edit, reactions, comments (with per-comment upvotes) |
| `Spaces.tsx` / `SpaceView.tsx` | `useSpaceList`, `useEntityList` | top-level spaces, then recurse into subspaces + space-scoped entries |
| `Search.tsx` | `useSearchContent` | semantic search (POST `/search/content`); entity hits open in `EntityView` |
| `Chat.tsx` | `useConversations`, `ConversationProvider` + `useConversationContext`, `useChatContext`, `useCreateDirectConversation`, `useConversationMembers` | realtime socket.io chat: groups + DMs |
| `Connections.tsx` | `useFetchConnections`/`…SentPending…`/`…ReceivedPending…`, `useRequestConnection`, `useAcceptConnection`, `useSearchUsers` | connections: typeahead request, sent/received pending, accept/decline/cancel |
| `Notifications.tsx` | `useAppNotifications` | in-app inbox |

### Conventions to match when editing

- Hook return values are cast `as any` throughout — the SDK's exported types are incomplete, so the
  demo deliberately treats them loosely. Keep this style rather than fighting the types.
- Comment-section rendering merges `newComments` (optimistic, just-posted) **on top of** `comments`
  (server) until a refetch folds them together — see the comment in `EntityView.tsx`. Mirror this
  pattern for any other optimistic list.
- Chat messages come newest-first from the SDK; `Conversation` reverses them for display and
  compares `m.userId === user?.id` to style "mine". The open thread is wrapped in
  `ConversationProvider` (keyed by id so switching re-joins the socket room).
- Images: uploaded entity files render via the exported `fileImageSrc(file)` helper in
  `EntityView.tsx` (picks medium → original variant). Reuse it for any new image display.
- Connections aren't realtime (the socket layer is chat-only), so `Connections.tsx` polls on an
  interval to surface accepted/incoming requests.
- Styling is one hand-written `styles.css` with utility-ish classes (`col`, `row`, `panel`, `card`,
  `pill`, `msg`, `mine`, `muted`, `spacer`, `prewrap`, `clamp3`, `linklike`). No CSS framework.
- Analytics is Umami, centralized in `src/analytics.ts` — call `track(event, data?)` /
  `trackPageView(path)` (never touch `window.umami` directly; the script is injected once via
  `loadUmami()` in `main.tsx`). Event names are a flat `snake_case` `AnalyticsEvent` union, so a
  typo fails the build. Navigation is page views (`PATHS.*`, this no-router SPA records them
  explicitly per tab + detail); product actions are events, fired **on success** with
  low-cardinality enums/booleans only — **never IDs or free text**. The reporting API key stays
  server-side (see the env split above).
