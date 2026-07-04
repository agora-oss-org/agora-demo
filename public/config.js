// Placeholder runtime config. In the container this file is OVERWRITTEN at start by the nginx
// entrypoint (docker-entrypoint.d/40-agora-config.sh), which injects window.__AGORA__ (apiBaseUrl,
// projectId, demoEmail, demoPassword, adminUrl, secureChatDebug, umamiUrl, umamiDemoId,
// emailRedirectTo) from the AGORA_DEMO_* env. In `pnpm dev` it stays empty, so src/config.ts falls
// back to the baked import.meta.env.VITE_* values. Loaded from index.html before the app bundle.
window.__AGORA__ = window.__AGORA__ || {};
