# syntax=docker/dockerfile:1

# Multi-stage build for the Agora demo. Two shipping targets share one deps layer:
#   • `prod` (default / last stage) — `vite build` → nginx serving the static bundle. This is what
#     docker-publish.yml builds and what gets DEPLOYED. A built bundle is ~a dozen hashed assets;
#     critically it does NOT serve node_modules over HTTP the way the dev server does (which fans a
#     page load into hundreds of module requests → rate-limited 429s behind a public proxy).
#   • `dev` — the Vite dev server with HMR, used by local `docker compose` (build target: dev) with a
#     source bind mount. Never deploy this stage.
#
# VITE_* are inlined into the bundle by Vite. In `dev` they're read at dev-server START from the
# runtime env (compose passes them); in `build` they must be present at BUILD time (vite build bakes
# them into the static assets). The published image is public → these are non-secret demo creds.

# ── base: pnpm + dependencies (shared by dev and build) ───────────────────────
FROM node:22-slim AS base
# pnpm is the project's package manager (pnpm-lock.yaml is the single source of truth). Corepack ships
# with node:22 and resolves the exact pnpm version pinned in package.json's "packageManager" field.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app
# Install deps first so this layer caches until the lockfile changes. --frozen-lockfile fails the
# build if pnpm-lock.yaml is out of sync with package.json (the CI-safe, reproducible install).
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ── dev: Vite dev server with HMR (local `docker compose`, target: dev) ───────
FROM base AS dev
ARG VITE_API_BASE_URL=https://agora.recoverysky.net/v7
ARG VITE_PROJECT_ID=11111111-1111-1111-1111-111111111111
ARG VITE_DEMO_EMAIL=agora-demo@gmail.com
ARG VITE_DEMO_PASSWORD=DemoPass123!
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_PROJECT_ID=$VITE_PROJECT_ID \
    VITE_DEMO_EMAIL=$VITE_DEMO_EMAIL \
    VITE_DEMO_PASSWORD=$VITE_DEMO_PASSWORD
# Source comes from the compose bind mount at runtime; this COPY is just a fallback for `docker run`.
COPY . .
# vite.config.ts sets host:true + strictPort on 5175, so the dev server binds 0.0.0.0:5175.
EXPOSE 5175
CMD ["pnpm", "run", "dev"]

# ── build: produce the static production bundle ───────────────────────────────
FROM base AS build
ARG VITE_API_BASE_URL=https://agora.recoverysky.net/v7
ARG VITE_PROJECT_ID=11111111-1111-1111-1111-111111111111
ARG VITE_DEMO_EMAIL=agora-demo@gmail.com
ARG VITE_DEMO_PASSWORD=DemoPass123!
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_PROJECT_ID=$VITE_PROJECT_ID \
    VITE_DEMO_EMAIL=$VITE_DEMO_EMAIL \
    VITE_DEMO_PASSWORD=$VITE_DEMO_PASSWORD
COPY . .
RUN pnpm build   # tsc -b (typecheck) + vite build → /app/dist

# ── prod: nginx serving the static bundle (published + deployed image) ────────
FROM nginx:alpine AS prod
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
# Runtime retargeting: nginx:alpine runs /docker-entrypoint.d/*.sh before starting nginx. This one
# rewrites /config.js from AGORA_DEMO_* env so a single published image can point at any API (local,
# self-host, public) without a rebuild. See docker-entrypoint.d/40-agora-config.sh + src/config.ts.
COPY docker-entrypoint.d/40-agora-config.sh /docker-entrypoint.d/40-agora-config.sh
RUN chmod +x /docker-entrypoint.d/40-agora-config.sh
EXPOSE 80
# nginx:alpine's base image already runs nginx in the foreground as its CMD.
