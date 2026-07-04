# Agora demo

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

A standalone **Vite + React (TypeScript)** app that drives the real Agora SDK hooks
(`@agora-sdk/react-js` + `@agora-sdk/core`) against a running Agora server. It's a 1:1
compatibility harness — every tab exercises one SDK surface end-to-end, so if something breaks here
it usually points at a server ↔ SDK contract mismatch rather than an app bug.

## What it exercises

| Tab / area | SDK surface exercised |
|------------|------------------------|
| **Feed** | List entities with a selectable ranking algorithm (`hot` / `top` / `new` / `controversial` / `decay` / `gravity` / `wilson` / `bayesian`); create posts with multi-image uploads |
| *(entity detail)* | Image display, up/down-vote reactions, comments (each up/down-votable), owner inline edit, and 🚩 reporting of the entity and individual comments |
| **Spaces** | Browse and create **public or private** spaces; nested subspaces and space-scoped entries; request-to-join with admin approval, membership + leave; a per-space **chat channel**; and admin **digest-webhook** settings |
| **Search** | Semantic search (Voyage + pgvector); entity hits open in place |
| **Chat** | Realtime socket.io chat — groups and direct messages with **image/file attachments** and **group member management** (add connections, remove, leave). Open two tabs for live delivery |
| **Connections** | Typeahead user search; send / accept / decline / cancel requests; sent and received pending |
| **Inbox** | In-app notifications |
| **Me** | Edit your profile — username (with a **live availability check**), display name, bio, avatar |
| *(header)* | Link out to the separate **Admin app** (`VITE_ADMIN_URL`), and a full sign-out |

Auth is **email/password** against the server's `/auth` (Supabase-backed identity, Agora tokens) —
including the email-confirmation sign-up flow — plus **GitHub OAuth** (redirect flow). Private-space
content fails closed client-side: a non-member can't read or interact with it, mirroring the
server's gate.

## Quick start (local)

You need a running Agora server. The demo defaults to the deployed one; for local work point it at
your server via `.env`.

```bash
# 1. Boot the Agora server (separate terminal)
cd ../agora-server/apps/api && npm run dev                       # http://localhost:4000/v7

# 2. Seed a confirmed demo user (once)
cd ../agora-server/apps/api && node scripts/seed-demo-user.mjs   # agora-demo@gmail.com / DemoPass123!

# 3. Run the demo
npm install
npm run dev                                             # http://localhost:5175
```

Login is prefilled from `.env`. Scripts: `npm run dev` (dev server), `npm run build` (`tsc -b`
typecheck + `vite build`), `npm run preview` (serve the build). There are no tests or linter —
verification is manual; `tsc -b` in the build is the only static check.

### Configuration (`.env`)

| Var | Purpose |
|-----|---------|
| `VITE_API_BASE_URL` | Agora server base URL (e.g. `http://localhost:4000/v7`) |
| `VITE_PROJECT_ID` | Project id passed to `AgoraProvider` |
| `VITE_DEMO_EMAIL` / `VITE_DEMO_PASSWORD` | Prefilled login credentials |
| `VITE_ADMIN_URL` | *(optional)* Admin app URL; shows an **Admin** link in the header when set |

`VITE_API_BASE_URL` is parsed in `App.tsx` and passed to `AgoraProvider` via its `baseUrl` prop.

## Docker

The SDK comes from npm, so the build context is self-contained (no sibling dir). The image runs the
Vite dev server (HMR) on port 5175.

```bash
docker compose up --build                   # http://localhost:5175

# point at an Agora server on your host instead of the deployed default:
VITE_API_BASE_URL=http://host.docker.internal:4000/v7 docker compose up --build
```

Or with plain Docker:

```bash
docker build -t agora-demo:dev .
docker run --rm -p 5175:5175 -e VITE_API_BASE_URL=https://agora.recoverysky.net/v7 agora-demo:dev
```

`VITE_*` are baked into the image from build args (`Dockerfile`) and overridable per run via `-e` /
compose `environment:` — Vite reads them when the dev server starts, so switching servers needs no
rebuild. `docker compose` also bind-mounts the source for HMR while keeping the image's
`node_modules` (so the host's aren't required).

### Published images

CI (`.github/workflows/docker-publish.yml`) builds `linux/amd64,linux/arm64` and pushes on every
push to `root` (tagged `latest` + commit SHA) and on `v*` tags (semver) to both registries:

```bash
docker run --rm -p 5175:5175 ghcr.io/jenova-marie/agora-demo:latest
docker run --rm -p 5175:5175 agoraserver/agora-demo:latest
```

The baked `VITE_*` come from the repo's **`production` GitHub Environment** — variables
`VITE_API_BASE_URL` / `VITE_PROJECT_ID` / `VITE_DEMO_EMAIL` plus the secret `VITE_DEMO_PASSWORD`,
passed as build args (so they live in repo settings, not the workflow file). These are non-secret
demo credentials; since the published image is public, they're readable from it anyway.

GHCR auth uses the built-in `GITHUB_TOKEN`. Docker Hub needs repo secrets `DOCKERHUB_USERNAME` and
`DOCKERHUB_TOKEN` (an access token with push access to `agoraserver/agora-demo`).

## How it consumes the SDK

The SDK is published to npm as `@agora-sdk/core` + `@agora-sdk/react-js` and listed as normal
dependencies, so the build is fully self-contained (and containerizable). `vite.config.ts` **dedupes**
React/Redux to a single instance shared with the SDK — otherwise the SDK's hooks break.

**Local-fork override:** if the sibling `../agora-sdk` repo is checked out *and built*
(`pnpm build-all` → `packages/{core,react-js}/dist/esm` exist), `vite.config.ts` auto-detects it on
disk and aliases the package names at that dist, so local SDK edits take effect without
republishing (it logs `[vite] @agora-sdk → LOCAL fork` at boot; restart the dev server to pick up a
newly-present fork). The check is on-disk, so the alias is automatically **off** in the Docker build
context / CI — keeping the image self-contained on the npm packages.

## Architecture

`main.tsx` → `App.tsx` (`AgoraProvider` with `projectId` + `baseUrl`, then `ChatProvider` for the
socket.io connection) → `Shell.tsx`. `Shell` is the auth gate and tab router; there's no router
library — tabs and in-tab drill-downs are conditional renders driven by local state. Styling is one
hand-written `styles.css` (utility-ish classes, no framework).

See [CLAUDE.md](./CLAUDE.md) for the per-file SDK-surface map and editing conventions.

## Contributing

**Contributors welcome!** 💜 This is a harness, so high-value contributions exercise a new SDK
surface, tighten an existing one, or surface a server ↔ SDK contract mismatch — and "the demo
broke" bug reports are genuinely useful, since they often expose a real server/SDK disagreement.

New to the project? Pick a hook the demo doesn't drive yet and add a panel for it, or improve a
panel's states and error handling. See **[CONTRIBUTING.md](./CONTRIBUTING.md)** for setup, the
project conventions (one file per SDK surface, the `@agora-sdk` Replyke-fork gotchas, the `as any`
style, fail-closed access), how to verify a change (`npm run build` + click through), and the PR
workflow.

## License

[MIT](./LICENSE) © Jenova Marie
