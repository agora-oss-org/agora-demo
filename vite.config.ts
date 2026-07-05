import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Surface the app version (package.json) to the client via import.meta.env.VITE_APP_VERSION — the
// header renders it. Set on process.env so Vite inlines it alongside the VITE_* vars it reads from
// .env; this keeps the rest of package.json out of the bundle. Reads at dev-server/build start, so
// the COPYd package.json is present in Docker/CI too.
const pkg = JSON.parse(readFileSync(fileURLToPath(new URL("./package.json", import.meta.url)), "utf8"));
process.env.VITE_APP_VERSION = pkg.version;

// Client env comes from .env, read NATIVELY by Vite — no hand-loading. Vite exposes only VITE_-prefixed
// vars to the bundle, so a true secret like AGORA_UMAMI_API_KEY (un-prefixed) stays server-side. Reading
// .env natively (rather than manually loading a separate env.vite once at boot) is what lets Vite
// auto-restart the dev server when .env changes — so an edited VITE_API_BASE_URL can't silently go stale
// in a long-running process. In Docker/CI the VITE_* vars arrive straight from the container
// environment, which Vite also exposes.

// SDK source resolution:
// - By default the SDK is the published npm packages @agora-sdk/core + @agora-sdk/react-js (real
//   dependencies), so the build is self-contained — which is what makes it containerizable.
// - LOCAL FORK OVERRIDE: if the sibling agora-sdk repo is present *and built* (dist/esm exists), we
//   alias the package names at its dist so local SDK edits take effect without republishing. This is
//   guarded by an on-disk check, so it is automatically OFF in the Docker build context / CI (the
//   build context is the demo dir only — no sibling dir — so the registry-installed packages are used).
//   Rebuild the fork (`pnpm build-all` in ../agora-sdk) after editing it; restart this dev server to
//   pick up a newly-present alias (Vite reads config at boot).
//
// React (+ Redux) is deduped so the SDK shares the app's single instance either way.
const forkCore = fileURLToPath(new URL("../agora-sdk/packages/core/dist/esm/index.js", import.meta.url));
const forkReactJs = fileURLToPath(new URL("../agora-sdk/packages/react-js/dist/esm/index.js", import.meta.url));
const useLocalSdk = existsSync(forkCore) && existsSync(forkReactJs);
if (useLocalSdk) {
  // eslint-disable-next-line no-console
  console.log("[vite] @agora-sdk → LOCAL fork (dist/esm). Rebuild the fork after edits.");
}
const sdkAlias: Record<string, string> = useLocalSdk
  ? { "@agora-sdk/core": forkCore, "@agora-sdk/react-js": forkReactJs }
  : {};

// Secure-chat SDK (agora-sdk-plus) local-fork override — same on-disk-guarded mechanism as the
// @agora-sdk core block above. When the sibling agora-sdk-plus workspace is present AND built
// (dist/esm exists) we alias the package names at its dist so local SDK edits take effect without
// republishing; OFF automatically when the sibling isn't present (Docker/CI build context is the demo
// dir only → falls back to the npm-installed packages). Alias resolution doesn't follow a linked
// package's own deps, so we must alias all three packages PLUS react-js's internal crypto subpaths
// (crypto/ts-mls resolves to a dir/index.js; crypto/testing resolves to a flat testing.js).
const plusRoot = (p: string) =>
  fileURLToPath(new URL(`../agora-sdk-plus/packages/secure-chat/${p}`, import.meta.url));
const secureCoreEsm = plusRoot("core/dist/esm/index.js");
const useLocalSecure = existsSync(secureCoreEsm);
if (useLocalSecure) {
  // eslint-disable-next-line no-console
  console.log("[vite] @agora-sdk/secure-chat-* → LOCAL workspace (dist/esm). Rebuild the fork after edits.");
}
const secureAlias: Record<string, string> = useLocalSecure
  ? {
      "@agora-sdk/secure-chat-core": secureCoreEsm,
      "@agora-sdk/secure-chat-react-js": plusRoot("react-js/dist/esm/index.js"),
      "@agora-sdk/secure-chat-crypto/ts-mls": plusRoot("crypto/dist/esm/ts-mls/index.js"),
      "@agora-sdk/secure-chat-crypto/testing": plusRoot("crypto/dist/esm/testing.js"),
      "@agora-sdk/secure-chat-crypto": plusRoot("crypto/dist/esm/index.js"),
    }
  : {};

// Social SDK (agora-sdk-plus) local-fork override — same on-disk-guarded mechanism as the
// secure-chat block above, but only two packages (no crypto subpaths). When the sibling
// agora-sdk-plus/packages/social workspace is present AND built (dist/esm exists) we alias the
// package names at its dist so local SDK edits take effect without republishing; OFF automatically
// when the sibling isn't present (Docker/CI build context is the demo dir only → npm packages used).
const socialRoot = (p: string) =>
  fileURLToPath(new URL(`../agora-sdk-plus/packages/social/${p}`, import.meta.url));
const socialCoreEsm = socialRoot("core/dist/esm/index.js");
const useLocalSocial = existsSync(socialCoreEsm);
if (useLocalSocial) {
  // eslint-disable-next-line no-console
  console.log("[vite] @agora-sdk/social-* → LOCAL workspace (dist/esm). Rebuild the fork after edits.");
}
const socialAlias: Record<string, string> = useLocalSocial
  ? {
      "@agora-sdk/social-core": socialCoreEsm,
      "@agora-sdk/social-react-js": socialRoot("react-js/dist/esm/index.js"),
    }
  : {};

// Auth SDK (agora-sdk-plus) local-fork override — same on-disk-guarded mechanism as the secure-chat
// and social blocks above, but a single package. When the sibling agora-sdk-plus/packages/auth
// workspace is present AND built (dist/esm exists) we alias the package name at its dist so local
// edits take effect without republishing; OFF automatically when the sibling isn't present (Docker/CI
// build context is the demo dir only → npm package used).
const authReactJsEsm = fileURLToPath(
  new URL("../agora-sdk-plus/packages/auth/react-js/dist/esm/index.js", import.meta.url),
);
const useLocalAuth = existsSync(authReactJsEsm);
if (useLocalAuth) {
  // eslint-disable-next-line no-console
  console.log("[vite] @agora-sdk/auth-react-js → LOCAL workspace (dist/esm). Rebuild the fork after edits.");
}
const authAlias: Record<string, string> = useLocalAuth ? { "@agora-sdk/auth-react-js": authReactJsEsm } : {};

export default defineConfig({
  // Relative base so the SAME built bundle works mounted at ANY path: the public demo at root (/) AND
  // the self-host compose at /demo/ (Caddy's handle_path strips the prefix). Asset refs become ./assets/…
  // resolved against the CURRENT DOCUMENT URL, not the app's root — fine for every in-app "route" (tabs
  // are local state, ?entity= deep links ride the query string on /, never a real navigation), but
  // wrong for the two pages that DO get a real full-page browser navigation at a non-root depth: the
  // emailed /auth/verify-email and /auth/reset-password links. Landing there resolved "./assets/x.js"
  // against e.g. "/auth/" and 404'd into nginx's SPA fallback (text/html, not JS) — a blank page. Fixed
  // by index.html's <base href>, rewritten from the actual mount prefix at container start (see
  // docker-entrypoint.d/40-agora-config.sh + AGORA_DEMO_BASE_PATH), which anchors relative resolution
  // to the app's true root regardless of which URL depth the browser is actually sitting at.
  base: "./",
  plugins: [react()],
  server: {
    // Bind all interfaces (IPv4 0.0.0.0 + IPv6 ::) so both `localhost`→127.0.0.1 and ::1 reach
    // the dev server — and so the server is reachable from outside a container. Vite's default
    // binds IPv6-only, which made Supabase email-confirmation links (redirect_to=localhost:5175)
    // fail in browsers that resolve localhost to IPv4. strictPort keeps us on 5175 so the Supabase
    // Site URL stays valid.
    host: true,
    port: 5175,
    strictPort: true,
    // Fall back to polling for file changes: this machine's fsevents-based recursive watch wasn't
    // delivering change events to Vite (native fs.watch worked, but chokidar/HMR saw nothing), so
    // saves didn't hot-reload. Polling sidesteps fsevents at a small CPU cost.
    watch: { usePolling: true, interval: 120 },
    // Allow the proxied hostname Caddy serves this dev server under. A leading dot matches the
    // domain and all subdomains, so this covers agora-demo.intra.recoverysky.net and any future
    // intra route. localhost/127.0.0.1 are always allowed implicitly.
    allowedHosts: [".intra.recoverysky.net"],
  },
  resolve: {
    alias: { ...sdkAlias, ...secureAlias, ...socialAlias, ...authAlias },
    dedupe: ["react", "react-dom", "react-redux", "@reduxjs/toolkit"],
  },
  build: {
    rollupOptions: {
      // Third-party crypto deps from the secure-chat graph (@hpke/common, @noble/*) ship pre-built
      // ESM with /* @__PURE__ */ annotations Rollup can't attach to a call (misplaced, or sitting in
      // commented-out code). They're inert — Rollup just strips the comment — so silence ONLY this
      // INVALID_ANNOTATION code for those files; every other warning still surfaces.
      onwarn(warning, defaultHandler) {
        if (
          warning.code === "INVALID_ANNOTATION" &&
          /@hpke\/|@noble\//.test(warning.id ?? "")
        ) {
          return;
        }
        defaultHandler(warning);
      },
    },
  },
  optimizeDeps: {
    include: [
      "@agora-sdk/auth-react-js",
      "@agora-sdk/core",
      "@agora-sdk/react-js",
      "@agora-sdk/social-core",
      "@agora-sdk/social-react-js",
      "react",
      "react-dom",
      "react-redux",
      "@reduxjs/toolkit",
      "axios",
      "socket.io-client",
      "d3-force",
    ],
    exclude: [
      "@agora-sdk/secure-chat-core",
      "@agora-sdk/secure-chat-react-js",
      "@agora-sdk/secure-chat-crypto",
    ],
  },
});
