# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A standalone Vite + React (TypeScript) app that drives the **real `@agora` SDK hooks** against a
running Agora server. It is a **1:1 compatibility proof / manual test harness** for the forked SDK,
not a product. Every feature tab exists to exercise one SDK surface end-to-end (auth, feed,
comments, reactions, spaces, semantic search, live socket.io chat, connections, notifications).

When something breaks here it usually means a server↔SDK contract mismatch, not an app bug — see
the four already-fixed mismatches documented in `README.md` ("What this demo flushed out").

## Commands

```bash
npm run dev       # Vite dev server → http://localhost:5173
npm run build     # tsc -b (typecheck) + vite build
npm run preview   # serve the production build
```

There are **no tests and no linter** — verification is manual, by clicking through the tabs. The
build's `tsc -b` is the only static check.

### Full local stack (the demo needs the SDK + server running)

```bash
cd ../agora-sdk && pnpm build-all                       # 1. build the local SDK fork (rerun after editing it)
cd ../agora/server && npm run dev                       # 2. boot Agora server (separate terminal)
cd ../agora/server && node scripts/seed-demo-user.mjs   # 3. seed demo user (once)
npm run dev                                             # 4. run this demo
```

Login is prefilled from `.env` (`VITE_DEMO_EMAIL` / `VITE_DEMO_PASSWORD`). By default `.env`
points `VITE_API_BASE_URL` at the **deployed** server (`https://agora.recoverysky.net/v7`); point
it at `http://localhost:4000/v7` to test against a local server.

## How the SDK is linked (critical to understand)

`@agora/*` is an **unpublished local fork** at `../agora-sdk/packages`. `vite.config.ts` makes it
work:
- **Aliases** `@agora/core` and `@agora/react-js` to the SDK's built `dist/esm/index.js`. This
  sidesteps the `workspace:*` internal dep and the SDK's extensionless ESM imports.
- **Dedupes** `react`, `react-dom`, `react-redux`, `@reduxjs/toolkit` so the SDK shares the app's
  single React/Redux instance (otherwise hooks break).
- You **must `pnpm build-all` the SDK after editing it** — the demo consumes built output, not source.

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
