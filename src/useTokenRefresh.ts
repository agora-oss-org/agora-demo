// Proactively refresh the access token shortly before it expires.
//
// The SDK already refreshes *reactively* now (its axios interceptor catches a 401 on an expired
// token, rotates, and retries). This hook is the *proactive* complement: it schedules a refresh just
// before the token's `exp`, so (a) a user action never eats the one-round-trip 401→refresh→retry
// latency, and (b) the chat socket stays authenticated — the SDK's chat-context reconnects the
// socket whenever `accessToken` changes, so refreshing ahead of expiry keeps realtime alive instead
// of waiting for a failed reconnect. The reactive 401 path remains the backstop for cases a timer
// can't cover (e.g. the laptop sleeping through the scheduled fire).
import { useEffect, useRef } from "react";
import { useAuth } from "@agora-sdk/react-js";

// Refresh this long before the token's `exp`.
const REFRESH_SKEW_MS = 60_000;
// Never schedule a fire sooner than this — guards against a tight loop if a freshly-minted token
// already decodes as near-expired (pathological client/server clock skew).
const MIN_DELAY_MS = 2_000;

// Read the `exp` (seconds since epoch) out of a JWT's payload, as ms. Unverified decode — display/
// scheduling only; the server is the real authority. Mirrors the base64url decode in EntityView's
// isOperatorToken (kept local to avoid coupling this infra hook to a feature file).
function jwtExpMs(token: string | null | undefined): number | null {
  if (!token) return null;
  try {
    let b64 = token.split(".")[1];
    if (!b64) return null;
    b64 = b64.replace(/-/g, "+").replace(/_/g, "/");
    b64 += "=".repeat((4 - (b64.length % 4)) % 4); // restore base64url padding
    const exp = JSON.parse(atob(b64)).exp;
    return typeof exp === "number" ? exp * 1000 : null;
  } catch {
    return null;
  }
}

export default function useTokenRefresh(): void {
  const { accessToken, requestNewAccessToken } = useAuth() as any;
  // Prevents overlapping refreshes if a fire and some other refresh trigger race.
  const refreshing = useRef(false);

  useEffect(() => {
    const expMs = jwtExpMs(accessToken);
    if (!accessToken || expMs == null || !requestNewAccessToken) return;

    const delay = Math.max(MIN_DELAY_MS, expMs - Date.now() - REFRESH_SKEW_MS);
    const id = setTimeout(async () => {
      if (refreshing.current) return;
      refreshing.current = true;
      try {
        // On success this rotates the token in the store → `accessToken` changes → this effect
        // re-runs and schedules the next refresh against the new token's exp (self-perpetuating).
        await requestNewAccessToken();
      } catch {
        // Swallow: the SDK logs, and the reactive 401 interceptor is the backstop. Don't crash
        // the tree over a transient refresh failure.
      } finally {
        refreshing.current = false;
      }
    }, delay);

    return () => clearTimeout(id);
  }, [accessToken, requestNewAccessToken]);
}
