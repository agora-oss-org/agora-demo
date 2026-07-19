// Runtime configuration for the demo — resolved at PAGE LOAD, not build time.
//
// The published prod image is a STATIC Vite bundle, so VITE_* are baked when `vite build` runs. To make
// ONE published image fully retargetable (no rebuild, no baked .env at all), the container's nginx
// entrypoint (docker-entrypoint.d/40-agora-config.sh) writes /config.js at start —
//   window.__AGORA__ = { apiBaseUrl, projectId, demoEmail, demoPassword, adminUrl, secureChatDebug,
//                         umamiUrl, umamiDemoId, emailRedirectTo }
// — and index.html loads it BEFORE the app bundle. We read that here first, falling back to the baked
// import.meta.env.VITE_* (which is what `pnpm dev` uses: there's no runtime /config.js in dev, just an
// empty public/ stub, so the fallback wins). VITE_APP_VERSION is intentionally NOT here — it's the
// package.json version, not a deploy target, so it stays build-time only.
declare global {
  interface Window {
    __AGORA__?: {
      apiBaseUrl?: string;
      projectId?: string;
      demoEmail?: string;
      demoPassword?: string;
      adminUrl?: string;
      secureChatDebug?: string;
      umamiUrl?: string;
      umamiDemoId?: string;
      emailRedirectTo?: string;
      giphyApiKey?: string;
    };
    // @agora-sdk/core's getEnvVar() checks this global BEFORE import.meta.env (see its
    // utils/env.ts) — the one runtime-injectable seam it exposes. We use it below to carry
    // emailRedirectTo through without baking a real origin into the prod bundle.
    __vite_env?: Record<string, string>;
  }
}

const runtime = (typeof window !== "undefined" && window.__AGORA__) || {};

// Absolute base URL the SDK talks to. MUST be absolute (e.g. http://localhost/v7): @agora-sdk/core
// derives the socket.io origin via `new URL(baseUrl)`, which throws on a relative path.
export const API_BASE_URL: string = runtime.apiBaseUrl || import.meta.env.VITE_API_BASE_URL;

// Falls back to the well-known demo project id (matches the Dockerfile/compose/entrypoint defaults)
// so this is never undefined even if nothing upstream set it.
export const PROJECT_ID: string =
  runtime.projectId || import.meta.env.VITE_PROJECT_ID || "11111111-1111-1111-1111-111111111111";

// Login prefill for the demo account.
export const DEMO_EMAIL: string = runtime.demoEmail || import.meta.env.VITE_DEMO_EMAIL || "";
export const DEMO_PASSWORD: string = runtime.demoPassword || import.meta.env.VITE_DEMO_PASSWORD || "";

// Optional link to the separate admin app; empty hides it.
export const ADMIN_URL: string = runtime.adminUrl || import.meta.env.VITE_ADMIN_URL || "";

// Secure-chat SDK trace/debug toggle — see App.tsx for the value contract.
export const SECURE_CHAT_DEBUG: string =
  runtime.secureChatDebug || import.meta.env.VITE_AGORA_SECURE_CHAT_DEBUG || "";

// Umami analytics — both empty is a clean no-op (see analytics.ts).
export const UMAMI_URL: string | undefined = runtime.umamiUrl || import.meta.env.VITE_AGORA_UMAMI_URL;
export const UMAMI_DEMO_ID: string | undefined =
  runtime.umamiDemoId || import.meta.env.VITE_AGORA_UMAMI_DEMO_ID;

// Origin the Agora server stamps into sign-up / password-reset / verification-email links, so they
// return the user to THIS front-end instead of the server's own default. @agora-sdk/core resolves it
// itself via getEmailRedirectTo() → getEnvVar("AGORA_EMAIL_REDIRECT_TO") → window.location.origin; it
// has no provider prop or setter for it (unlike apiBaseUrl), so window.location.origin already gets
// this right for the common case (any deployment's users load the page from its real origin). This
// override exists for deployments where that's not enough — e.g. a path-prefixed mount, where
// window.location.origin is missing the prefix the emailed link needs to land back on. Left unset,
// nothing changes (getEnvVar falls through to window.location.origin as before).
const EMAIL_REDIRECT_TO: string = runtime.emailRedirectTo || import.meta.env.VITE_AGORA_EMAIL_REDIRECT_TO || "";
if (typeof window !== "undefined" && EMAIL_REDIRECT_TO) {
  window.__vite_env = { ...window.__vite_env, VITE_AGORA_EMAIL_REDIRECT_TO: EMAIL_REDIRECT_TO };
}

// GIPHY SDK key for the composer's GIF picker. Client-side and visible in the browser — NOT a
// secret like AGORA_UMAMI_API_KEY. Runtime-injected (not a build arg) so the published image ships
// keyless and each deployment supplies its own. Empty → the GIF button is hidden and everything
// else still works.
export const GIPHY_API_KEY: string =
  runtime.giphyApiKey || import.meta.env.VITE_GIPHY_API_KEY || "";
