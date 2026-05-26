import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// The @agora SDK is an unpublished local fork. Alias the bare package names to its built
// dist/esm — this sidesteps the workspace:* internal dep (alias intercepts the import) and the
// extensionless ESM imports (Vite/esbuild resolves them). Rebuild the SDK (pnpm build-all) after
// editing it. React is deduped so the SDK shares the app's single React instance.
//
// NB: the SDK reads VITE_API_BASE_URL directly via its getApiBaseUrl() (fixed to fall through to
// the Vite env branch), so no `define` shim is needed — just set VITE_API_BASE_URL in .env.
const sdk = resolve(__dirname, "../agora-sdk/packages");

export default defineConfig({
  plugins: [react()],
  server: {
    // Bind all interfaces (IPv4 0.0.0.0 + IPv6 ::) so both `localhost`→127.0.0.1 and ::1 reach
    // the dev server. Vite's default binds IPv6-only, which made Supabase email-confirmation links
    // (redirect_to=http://localhost:5173) fail with "unable to connect" in browsers that resolve
    // localhost to IPv4. strictPort keeps us on 5173 so the Supabase Site URL stays valid.
    host: true,
    port: 5173,
    strictPort: true,
  },
  resolve: {
    alias: {
      "@agora/react-js": resolve(sdk, "react-js/dist/esm/index.js"),
      "@agora/core": resolve(sdk, "core/dist/esm/index.js"),
    },
    dedupe: ["react", "react-dom", "react-redux", "@reduxjs/toolkit"],
  },
  optimizeDeps: {
    // The aliased dist isn't a normal dependency; let Vite pre-bundle these so React stays a singleton.
    include: ["react", "react-dom", "react-redux", "@reduxjs/toolkit", "axios", "socket.io-client"],
  },
});
