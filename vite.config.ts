import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The SDK is consumed as the published npm packages @agora-sdk/core + @agora-sdk/react-js (real
// dependencies in package.json), so the build is self-contained — no sibling dir needed, which is
// what makes the app containerizable. React is deduped so the SDK shares the app's single React
// instance.
//
// To test against a LOCAL SDK fork instead, alias the package names at the fork's built dist, e.g.
//   resolve: { alias: { "@agora-sdk/core": resolve(__dirname, "../agora-sdk/packages/core/dist/esm/index.js"), ... } }
//
// NB: the server base URL is passed to ReplykeProvider via the `baseUrl` prop (App.tsx parses
// VITE_API_BASE_URL); the SDK no longer sniffs env directly.
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
  },
  resolve: {
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
