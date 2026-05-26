# Agora demo

A standalone Vite + React app that drives the real **Agora SDK** hooks (`@agora-sdk/react-js` +
`@agora-sdk/core`) against a running Agora server — the 1:1 compatibility proof. Auth, feed,
comments, reactions, profiles, spaces, semantic search, connections, and live socket.io chat all
go through the SDK.

## Run (local)

```bash
# 1. Boot the Agora server (separate terminal)
cd ../agora/server && npm run dev          # http://localhost:4000/v7

# 2. Seed a confirmed demo user (once)
cd ../agora/server && node scripts/seed-demo-user.mjs   # agora-demo@gmail.com / DemoPass123!

# 3. Run the demo
npm install
npm run dev                                 # http://localhost:5173
```

Configure the target via `.env` (`VITE_API_BASE_URL`, `VITE_PROJECT_ID`). Sign in with the seeded
creds (prefilled). Tabs: **Feed** (list/create entities, image upload), open an entity for
**comments + reactions + inline edit**, **Spaces** (nested), **Search** (semantic), **Chat**
(open two tabs for live delivery), **Connections**, **Inbox**, **Me** (profile).

## Run (Docker)

The app pulls the SDK from npm, so the container build is self-contained — no sibling dir needed.
It runs the Vite dev server (with HMR) on port 5173.

```bash
docker compose up --build                   # http://localhost:5173

# point at an Agora server on your host instead of the deployed default:
VITE_API_BASE_URL=http://host.docker.internal:4000/v7 docker compose up --build
```

Or with plain Docker:

```bash
docker build -t agora-demo:dev .
docker run --rm -p 5173:5173 -e VITE_API_BASE_URL=https://agora.recoverysky.net/v7 agora-demo:dev
```

`VITE_*` values are baked into the image from build args (see the `Dockerfile`) and can be
overridden per-run via `-e` / compose `environment:` — Vite reads them when the dev server starts,
so no rebuild is needed to switch servers. `docker compose` also bind-mounts the source for HMR
while keeping the image's `node_modules` (so the host's aren't required).

### Published images

CI (`.github/workflows/docker-publish.yml`) builds `linux/amd64,linux/arm64` and pushes on every
push to `root` (tagged `latest` + commit SHA) and on `v*` tags (semver) to both registries:

```bash
docker run --rm -p 5173:5173 ghcr.io/jenova-marie/agora-demo:latest
docker run --rm -p 5173:5173 agoraserver/agora-demo:latest
```

The baked `VITE_*` values come from the repo's **`production` GitHub Environment** — variables
`VITE_API_BASE_URL` / `VITE_PROJECT_ID` / `VITE_DEMO_EMAIL` and the secret `VITE_DEMO_PASSWORD` —
passed in as build args (so they live in repo settings, not in the workflow file). These are
non-secret demo credentials; since the published image is public, they're readable from it anyway.

GHCR auth uses the built-in `GITHUB_TOKEN`. Docker Hub needs repo secrets `DOCKERHUB_USERNAME` and
`DOCKERHUB_TOKEN` (an access token with push access to `agoraserver/agora-demo`).

## How it consumes the SDK

The SDK is published to npm as `@agora-sdk/core` + `@agora-sdk/react-js` and listed as normal
dependencies, so the build is fully self-contained (and containerizable). `vite.config.ts` dedupes
React to a single instance shared with the SDK. The server base URL is passed to `ReplykeProvider`
via the `baseUrl` prop (`App.tsx` parses `VITE_API_BASE_URL`).

To test against a **local SDK fork** instead, alias the package names at the fork's built `dist/esm`
in `vite.config.ts` (see the comment there) and rebuild the fork after editing it.
