# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A standalone Vite + React (TypeScript) app that drives the **real `@agora` SDK hooks** against a
running Agora server. It is a **1:1 compatibility proof / manual test harness** for the forked SDK,
not a product. Every feature tab exists to exercise one SDK surface end-to-end (auth, feed,
comments, reactions, spaces, semantic search, live socket.io chat, connections, notifications).

When something breaks here it usually means a server↔SDK contract mismatch, not an app bug (e.g.
GET-vs-POST shape mismatches, `null` optional fields rejected by create endpoints, `sourceId=null`
treated as a literal filter) — check the server route against what the SDK actually sends.

## Commands

```bash
npm run dev       # Vite dev server → http://localhost:5173
npm run build     # tsc -b (typecheck) + vite build
npm run preview   # serve the production build
```

There are **no tests and no linter** — verification is manual, by clicking through the tabs. The
build's `tsc -b` is the only static check.

### Local stack (the demo needs an Agora server running)

```bash
cd ../agora/server && npm run dev                       # 1. boot Agora server (separate terminal)
cd ../agora/server && node scripts/seed-demo-user.mjs   # 2. seed demo user (once)
npm install && npm run dev                              # 3. run this demo
```

Login is prefilled from `.env` (`VITE_DEMO_EMAIL` / `VITE_DEMO_PASSWORD`). By default `.env`
points `VITE_API_BASE_URL` at the **deployed** server (`https://agora.recoverysky.net/v7`); point
it at `http://localhost:4000/v7` to test against a local server.

### Docker

```bash
docker compose up --build     # Vite dev container (HMR) → http://localhost:5173
```

Dev container only (no nginx/prod image). `VITE_*` are baked from build args and overridable at
runtime via `-e` / compose `environment:` (Vite reads them at dev-server start). Use
`VITE_API_BASE_URL=http://host.docker.internal:4000/v7` to reach a server on the host. The build is
self-contained because the SDK comes from npm (below) — no sibling dir in the build context.

## How the SDK is consumed (critical to understand)

The SDK is the **published npm packages** `@agora-sdk/core` + `@agora-sdk/react-js` (normal
`dependencies`). Source imports them by their real names. `vite.config.ts` only **dedupes**
`react`, `react-dom`, `react-redux`, `@reduxjs/toolkit` so the SDK shares the app's single
React/Redux instance (otherwise hooks break). No sibling dir, no alias, no `pnpm build-all` — the
build is fully self-contained (which is what makes it containerizable).

To test against a **local SDK fork** instead, add a `resolve.alias` in `vite.config.ts` mapping
`@agora-sdk/core` / `@agora-sdk/react-js` to the fork's built `dist/esm/index.js` (the file has a
commented example), and rebuild the fork (`pnpm build-all`) after editing it.

The SDK takes its server URL from the `baseUrl` prop on `ReplykeProvider` (parsed from
`VITE_API_BASE_URL` in `App.tsx`); the SDK no longer sniffs env directly.

## Architecture

`main.tsx` → `App.tsx` (`ReplykeProvider` projectId+baseUrl, then `ChatProvider` for the socket.io
connection) → `Shell.tsx`.

`Shell.tsx` is the auth gate and tab router: `useAuth()` gives `initialized`/`accessToken`; until
authed it renders `Login.tsx`, otherwise a simple `useState` tab switch across the feature panels.
There is no router library — tabs are conditional renders.

Each feature file maps to one SDK hook (and the server route it hits, noted in each file's header
comment):

| File | SDK hook(s) | Exercises |
|------|-------------|-----------|
| `Login.tsx` | `useAuth` (`signInWithEmailAndPassword`) | `/auth` |
| `Feed.tsx` | `useEntityList` | list/create entities |
| `EntityView.tsx` | `EntityProvider` + `useEntity`, `useReactionToggle`, `useCommentSectionData` | one entity: reactions + comments |
| `Spaces.tsx` | `useSpaceList` | spaces |
| `Search.tsx` | `useSearchContent` | semantic search (POST `/search/content`) |
| `Chat.tsx` | `useConversations`, `useConversationData`, `useChatContext` | realtime socket.io chat |
| `Connections.tsx` | `useFetchConnections`, `useRequestConnection`, `useAcceptConnection`, … | friend requests |
| `Notifications.tsx` | `useAppNotifications` | in-app inbox |

### Conventions to match when editing

- Hook return values are cast `as any` throughout — the SDK's exported types are incomplete, so the
  demo deliberately treats them loosely. Keep this style rather than fighting the types.
- Comment-section rendering merges `newComments` (optimistic, just-posted) **on top of** `comments`
  (server) until a refetch folds them together — see the comment in `EntityView.tsx`. Mirror this
  pattern for any other optimistic list.
- Chat messages come newest-first from the SDK; `Conversation` reverses them for display and
  compares `m.userId === user?.id` to style "mine".
- Styling is one hand-written `styles.css` with utility-ish classes (`col`, `row`, `panel`, `card`,
  `pill`, `msg`, `mine`, `muted`, `spacer`). No CSS framework.
