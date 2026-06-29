#!/bin/sh
# nginx:alpine runs every executable in /docker-entrypoint.d/ before starting nginx. We (re)write the
# served /config.js from runtime env so ONE published static bundle can target any API without a
# rebuild — window.__AGORA__ is read by src/config.ts ahead of the app bundle (see index.html). The
# defaults below match the public demo (recoverysky.net); the compose `demo` service overrides them
# with AGORA_DEMO_API_BASE_URL=http://localhost/v7 to point at the local API.
set -eu

: "${AGORA_DEMO_API_BASE_URL:=https://agora.recoverysky.net/v7}"
: "${AGORA_DEMO_PROJECT_ID:=11111111-1111-1111-1111-111111111111}"

cat > /usr/share/nginx/html/config.js <<EOF
window.__AGORA__ = {
  apiBaseUrl: "${AGORA_DEMO_API_BASE_URL}",
  projectId: "${AGORA_DEMO_PROJECT_ID}",
};
EOF

echo "[agora-demo] config.js → apiBaseUrl=${AGORA_DEMO_API_BASE_URL} projectId=${AGORA_DEMO_PROJECT_ID}"
