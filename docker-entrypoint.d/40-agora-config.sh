#!/bin/sh
# nginx:alpine runs every executable in /docker-entrypoint.d/ before starting nginx. We (re)write the
# served /config.js from runtime env so ONE published static bundle can target any API — and carry any
# other VITE_* setting — without a rebuild or baking .env into the image. window.__AGORA__ is read by
# src/config.ts ahead of the app bundle (see index.html). The defaults below match the public demo
# (recoverysky.net); the compose `demo` service overrides AGORA_DEMO_API_BASE_URL=http://localhost/v7
# to point at the local API. Admin URL / Umami are optional and default to empty (feature hidden /
# analytics disabled), matching what an unset VITE_* bakes to today.
set -eu

: "${AGORA_DEMO_API_BASE_URL:=https://agora.recoverysky.net/v7}"
: "${AGORA_DEMO_PROJECT_ID:=11111111-1111-1111-1111-111111111111}"
: "${AGORA_DEMO_EMAIL:=agora-123@gmail.com}"
: "${AGORA_DEMO_PASSWORD:=DemoPass123!}"
: "${AGORA_DEMO_ADMIN_URL:=}"
: "${AGORA_DEMO_SECURE_CHAT_DEBUG:=false}"
: "${AGORA_DEMO_UMAMI_URL:=}"
: "${AGORA_DEMO_UMAMI_ID:=}"
# Origin the Agora server stamps into sign-up / password-reset / verification-email links (the SDK's
# emailRedirectTo, see src/config.ts). Defaults to the public demo's own front-end origin — same
# convention as AGORA_DEMO_API_BASE_URL defaulting to its backend above — so those emails land back
# here even without an explicit override. A self-hosted deployment should override this to its own
# public origin (empty is also fine: the SDK falls back to window.location.origin, which is only
# wrong when mounted under a path prefix).
: "${AGORA_DEMO_EMAIL_REDIRECT_TO:=https://demo.agora-oss.org}"

cat > /usr/share/nginx/html/config.js <<EOF
window.__AGORA__ = {
  apiBaseUrl: "${AGORA_DEMO_API_BASE_URL}",
  projectId: "${AGORA_DEMO_PROJECT_ID}",
  demoEmail: "${AGORA_DEMO_EMAIL}",
  demoPassword: "${AGORA_DEMO_PASSWORD}",
  adminUrl: "${AGORA_DEMO_ADMIN_URL}",
  secureChatDebug: "${AGORA_DEMO_SECURE_CHAT_DEBUG}",
  umamiUrl: "${AGORA_DEMO_UMAMI_URL}",
  umamiDemoId: "${AGORA_DEMO_UMAMI_ID}",
  emailRedirectTo: "${AGORA_DEMO_EMAIL_REDIRECT_TO}",
};
EOF

echo "[agora-demo] config.js → apiBaseUrl=${AGORA_DEMO_API_BASE_URL} projectId=${AGORA_DEMO_PROJECT_ID}"
