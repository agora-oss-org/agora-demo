import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// SDK source resolution:
// - By default the SDK is the published npm packages @agora-sdk/core + @agora-sdk/react-js (real
//   dependencies), so the build is self-contained — which is what makes it containerizable.
// - LOCAL FORK OVERRIDE: if the sibling agora-sdk repo is present *and built* (dist/esm exists), we
//   alias the package names at its dist so local SDK edits take effect without republishing. This is
//   guarded by an on-disk check, so it is automatically OFF in the Docker build context / CI (the
//   build context is the demo dir only — no sibling dir — so the `npm ci`'d packages are used there).
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

export default defineConfig({
  plugins: [react()],
  server: {
    // Bind all interfaces (IPv4 0.0.0.0 + IPv6 ::) so both `localhost`→127.0.0.1 and ::1 reach
    // the dev server — and so the server is reachable from outside a container. Vite's default
    // binds IPv6-only, which made Supabase email-confirmation links (redirect_to=localhost:5173)
    // fail in browsers that resolve localhost to IPv4. strictPort keeps us on 5173 so the Supabase
    // Site URL stays valid.
    host: true,
    port: 5173,
    strictPort: true,
    // Allow the proxied hostname Caddy serves this dev server under. A leading dot matches the
    // domain and all subdomains, so this covers agora-demo.intra.recoverysky.net and any future
    // intra route. localhost/127.0.0.1 are always allowed implicitly.
    allowedHosts: [".intra.recoverysky.net"],
  },
  resolve: {
    alias: sdkAlias,
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
  },
});
