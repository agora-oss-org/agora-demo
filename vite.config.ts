import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// The @agora SDK is an unpublished local fork. Alias the bare package names to its built
// dist/esm — this sidesteps the workspace:* internal dep (alias intercepts the import) and the
// extensionless ESM imports (Vite/esbuild resolves them). Rebuild the SDK (pnpm build-all) after
// editing it. React is deduped so the SDK shares the app's single React instance.
const sdk = resolve(__dirname, "../agora-sdk/packages");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "");
  const apiBase = env.VITE_API_BASE_URL || "http://localhost:4000/v7";

  return {
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
    define: {
      // The SDK's getApiBaseUrl() checks process.env.REACT_APP_API_BASE_URL *before* the Vite
      // import.meta.env branch, and Vite leaves `process.env` defined in the browser — so the Vite
      // branch is never reached and VITE_API_BASE_URL alone is ignored. Inject the resolved base
      // URL where the SDK looks first so the override actually takes effect.
      "process.env.REACT_APP_API_BASE_URL": JSON.stringify(apiBase),
    },
  };
});
