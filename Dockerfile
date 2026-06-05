# syntax=docker/dockerfile:1

# Dev container for the Agora demo: runs the Vite dev server (with HMR) against the published
# @agora-sdk/* npm packages. Fully self-contained — no sibling SDK dir needed.
FROM node:22-slim

# The server target + demo creds are inlined by Vite from VITE_* env when the dev server starts.
# Pass these as --build-arg to bake defaults into the image; override per-run with
# `docker run -e VITE_API_BASE_URL=...` (or compose `environment:`) without rebuilding.
# Default points at the deployed server; from inside a container `localhost` is the container
# itself, so use http://host.docker.internal:4000/v7 to reach an Agora server on your host.
ARG VITE_API_BASE_URL=https://agora.recoverysky.net/v7
ARG VITE_PROJECT_ID=11111111-1111-1111-1111-111111111111
ARG VITE_DEMO_EMAIL=agora-demo@gmail.com
ARG VITE_DEMO_PASSWORD=DemoPass123!
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_PROJECT_ID=$VITE_PROJECT_ID \
    VITE_DEMO_EMAIL=$VITE_DEMO_EMAIL \
    VITE_DEMO_PASSWORD=$VITE_DEMO_PASSWORD

WORKDIR /app

# Install deps first so this layer is cached until the lockfile changes.
COPY package.json package-lock.json ./
RUN npm ci

# App source (node_modules, dist, .env, etc. excluded via .dockerignore).
COPY . .

# vite.config.ts sets host:true + strictPort on 5175, so the dev server binds 0.0.0.0:5175.
EXPOSE 5175
CMD ["npm", "run", "dev"]
