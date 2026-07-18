// Umami analytics — privacy-light, self-hosted tracker (VITE_AGORA_UMAMI_URL).
//
// This is the ONE place analytics lives. The rest of the app calls track()/trackPageView()
// and never touches window.umami directly.
//
// Contract notes:
// - The browser tracker only SENDS events. It never needs an API key — VITE_AGORA_UMAMI_API_KEY
//   is for the *reporting* API (reading stats, server-side) and must NOT be used here. ⚠️ Because
//   it's VITE_-prefixed, Vite would inline it into the client bundle if anything referenced it;
//   nothing here does, and it should be moved off the VITE_ prefix (server-only) before deploy.
// - script.js derives its collect endpoint from its own src, so a subpath install
//   (…/umami/script.js → …/umami/api/send) works with no data-host-url.
// - This app has no router (tab switches don't change the URL), so Umami's auto-track records a
//   single pageview on load. Per-tab views are explicit via trackPageView() — wired later.

import { UMAMI_URL, UMAMI_DEMO_ID as WEBSITE_ID } from "./config";

// True only when both the host and website id are configured (so local dev without the env
// vars is a clean no-op rather than a console error).
export const analyticsEnabled = Boolean(UMAMI_URL && WEBSITE_ID);

// The complete event taxonomy — flat snake_case, one source of truth. track() is narrowed to this
// union, so a misspelled name fails `npm run build`. Metadata for each (low-cardinality enums /
// booleans only — never IDs or free text) is documented at the call sites.
export type AnalyticsEvent =
  // auth
  | "login" | "logout"
  // entities
  | "create_entity" | "edit_entity" | "delete_entity"
  // comments
  | "post_comment" | "edit_comment" | "delete_comment" | "change_comment_sort"
  // reactions (entity + comment), reports
  | "add_reaction" | "remove_reaction" | "submit_report" | "moderate_remove"
  // spaces
  | "create_space" | "join_space" | "leave_space"
  // chat
  | "send_message" | "create_dm" | "create_group"
  // secure chat — at-rest encryption (EncryptedStore)
  | "secure_unlock" | "secure_lock" | "secure_change_password"
  // connections
  | "request_connection" | "accept_connection" | "decline_connection" | "cancel_request"
  // follows (one-way)
  | "follow_user" | "unfollow_user"
  // profile / discovery
  | "update_profile" | "submit_search" | "change_feed_sort"
  // social graph (read-only lenses) — metadata: { lens: "weather"|"constellation"|"neighborhood" } or { on: boolean }
  | "social_lens_rendered" | "social_interactions_toggled" | "social_refreshed"
  // push notifications — no metadata, zero-argument success events
  | "push_register" | "push_unregister"
  // notification preferences — metadata: { state: "all-on" | "partial" | "all-off" }
  | "set_notification_prefs"
  // events — metadata: create_event { type, visibility, hasCover, hasGallery, hasSpace },
  // change_event_filter { timeWindow, sortBy, sortDir }, set_rsvp { status }; the rest (edit/
  // cancel/delete/withdraw/host/invite) fire with no metadata
  | "create_event" | "edit_event" | "cancel_event" | "delete_event" | "change_event_filter"
  | "set_rsvp" | "withdraw_rsvp" | "add_host" | "remove_host" | "add_invite" | "remove_invite";

// Virtual page-view paths for the no-router SPA — tabs + drill-down details. Centralized so Shell
// and the detail views share one set of names (Umami's "Pages" report keys off these).
export const PATHS = {
  feed: "/feed",
  spaces: "/spaces",
  events: "/events",
  search: "/search",
  chat: "/chat",
  secure: "/secure",
  social: "/social",
  connections: "/connections",
  follows: "/follows",
  push: "/push",
  inbox: "/inbox",
  me: "/me",
  entity: "/entity",
  event: "/event",
  space: "/space",
  conversation: "/conversation",
  user: "/user",
} as const;

type TrackProps = Record<string, unknown>;
type UmamiApi = {
  track:
    | ((eventName?: string, eventData?: TrackProps) => void)
    | ((payload: (props: TrackProps) => TrackProps) => void);
};
declare global {
  interface Window {
    umami?: UmamiApi;
  }
}

let injected = false;

// Inject Umami's script.js once. No-op if analytics is disabled or the script is already present.
// auto-track stays ON so the initial pageview "just works" with zero call-site code; events and
// per-tab pageviews go through the helpers below.
export function loadUmami() {
  if (injected || !analyticsEnabled || typeof document === "undefined") return;
  injected = true;
  const s = document.createElement("script");
  s.async = true;
  s.defer = true;
  s.src = `${UMAMI_URL!.replace(/\/$/, "")}/script.js`;
  s.setAttribute("data-website-id", WEBSITE_ID!);
  document.head.appendChild(s);
}

// Fire a custom event. Safe before the script loads / when disabled (optional-chains to a no-op).
export function track(event: AnalyticsEvent, data?: TrackProps) {
  if (!analyticsEnabled) return;
  try {
    (window.umami?.track as ((e: string, d?: TrackProps) => void) | undefined)?.(event, data);
  } catch {
    /* never let analytics break the app */
  }
}

// Record a manual pageview for the no-router SPA — pass a virtual path (e.g. "/feed"). Not yet
// wired to tab changes; here so per-tab tracking is a one-liner when we want it.
export function trackPageView(path: string, title?: string) {
  if (!analyticsEnabled) return;
  try {
    (window.umami?.track as ((p: (props: TrackProps) => TrackProps) => void) | undefined)?.(
      (props) => ({ ...props, url: path, title: title ?? document.title })
    );
  } catch {
    /* no-op */
  }
}
