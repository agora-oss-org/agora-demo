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

export default defineConfig({
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
    alias: { ...sdkAlias, ...secureAlias },
    dedupe: ["react", "react-dom", "react-redux", "@reduxjs/toolkit"],
  },
  optimizeDeps: {
    include: [
      "@agora-sdk/core",
      "@agora-sdk/react-js",
      "react",
      "react-dom",
      "react-redux",
      "@reduxjs/toolkit",
      "axios",
      "socket.io-client",
    ],
    exclude: [
      "@agora-sdk/secure-chat-core",
      "@agora-sdk/secure-chat-react-js",
      "@agora-sdk/secure-chat-crypto",
    ],
  },
});
