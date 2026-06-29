// Runtime configuration for the demo — resolved at PAGE LOAD, not build time.
//
// The published prod image is a STATIC Vite bundle, so VITE_* are baked when `vite build` runs. To make
// ONE published image retargetable at a local / self-host API (without a rebuild), the container's nginx
// entrypoint (docker-entrypoint.d/40-agora-config.sh) writes /config.js at start —
//   window.__AGORA__ = { apiBaseUrl, projectId }
// — and index.html loads it BEFORE the app bundle. We read that here first, falling back to the baked
// import.meta.env.VITE_* (which is what `pnpm dev` uses: there's no runtime /config.js in dev, just an
// empty public/ stub, so the fallback wins).
declare global {
  interface Window {
    __AGORA__?: { apiBaseUrl?: string; projectId?: string };
  }
}

const runtime = (typeof window !== "undefined" && window.__AGORA__) || {};

// Absolute base URL the SDK talks to. MUST be absolute (e.g. http://localhost/v7): @agora-sdk/core
// derives the socket.io origin via `new URL(baseUrl)`, which throws on a relative path.
export const API_BASE_URL: string = runtime.apiBaseUrl || import.meta.env.VITE_API_BASE_URL;

export const PROJECT_ID: string = runtime.projectId || import.meta.env.VITE_PROJECT_ID;
