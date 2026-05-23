# Agora demo

A standalone Vite + React app that drives the real **`@agora`** SDK hooks against a running
Agora server — the 1:1 compatibility proof. Auth, feed, comments, reactions, semantic search,
and live socket.io chat all go through the forked SDK.

## Run

```bash
# 1. Build the SDK (once, or after editing it)
cd ../agora-sdk && pnpm build-all

# 2. Boot the Agora server (separate terminal)
cd ../agora/server && npm run dev          # http://localhost:4000/v7

# 3. Seed a confirmed demo user (once)
cd ../agora/server && node scripts/seed-demo-user.mjs   # agora-demo@gmail.com / DemoPass123!

# 4. Run the demo
npm install
npm run dev                                 # http://localhost:5173
```

Sign in with the seeded creds (prefilled). Tabs: **Feed** (list/create entities), open an entity
for **comments + reactions**, **Search** (semantic), **Chat** (open two tabs for live delivery).

## How it links the SDK

The `@agora/*` packages are an unpublished local fork. `vite.config.ts` aliases `@agora/core` and
`@agora/react-js` to the SDK's built `dist/esm` and dedupes React to a single instance — see the
comments there. Configure the target via `.env` (`VITE_API_BASE_URL`, `VITE_PROJECT_ID`); the SDK
reads `VITE_API_BASE_URL` through its `getApiBaseUrl()`.

## What this demo flushed out

Driving the real SDK surfaced (and we fixed) four server-side 1:1 mismatches:
1. **connections** `requireAuth` wildcard leaked to all routes (broke every unauthenticated endpoint).
2. **search** `/content` was GET returning `{data}`; the SDK does POST expecting a bare `ContentSearchResult[]`.
3. **feed** treated the SDK's `sourceId=null` string as a literal filter (→ empty feed).
4. **create** endpoints rejected the SDK's `null` optional fields (e.g. `parentId: null`) — now `.nullish()`.
