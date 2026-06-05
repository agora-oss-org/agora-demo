import { useEffect, useRef } from "react";

// Server-side moderation runs asynchronously: a post or comment can be accepted (and shown) now,
// then hidden a moment later when the censorship pass flags it. So after a successful create we
// re-pull the visible dataset once, ~5s out, to surface that censored state (the item drops for
// normal users, or flips to the redacted/🚫 view for operators).
export const MODERATION_REFRESH_MS = 5000;

// Returns a `schedule(refresh)` you call on a successful create. Each call replaces the prior
// pending timer (so rapid posts collapse to one refresh), and any pending timer is cleared on
// unmount so we never refetch into a gone component.
export function useModerationRefresh() {
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return (refresh: () => void) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = window.setTimeout(refresh, MODERATION_REFRESH_MS);
  };
}
