import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// The @agora SDK is an unpublished local fork. Alias the bare package names to its built
// dist/esm — this sidesteps the workspace:* internal dep (alias intercepts the import) and the
// extensionless ESM imports (Vite/esbuild resolves them). Rebuild the SDK (pnpm build-all) after
// editing it. React is deduped so the SDK shares the app's single React instance.
const sdk = resolve(__dirname, "../agora-sdk/packages");

export default defineConfig({
  plugins: [react()],
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
