import { useEffect, useState } from "react";
import { useAuth, useUser, useOAuthSignIn, useSignOutAll } from "@agora-sdk/react-js";
import Login from "./Login";
import useTokenRefresh from "./useTokenRefresh";
import { track, trackPageView, PATHS } from "./analytics";
import { ProfileViewerProvider } from "./ProfileViewer";
import EntityView, { isOperatorToken } from "./EntityView";
import Feed from "./Feed";
import Search from "./Search";
import Chat from "./Chat";
import Spaces from "./Spaces";
import Notifications from "./Notifications";
import Me from "./Me";

type Tab = "feed" | "spaces" | "search" | "chat" | "notifications" | "profile";
// Each tab is a virtual page view (the app has no router, so these populate Umami's "Pages"
// report). Two ids don't match their path: notifications→/inbox, profile→/me. Connections is no
// longer a top-level tab — it lives under Me (records /connections from there).
const TAB_TO_PATH: Record<Tab, string> = {
  feed: PATHS.feed,
  spaces: PATHS.spaces,
  search: PATHS.search,
  chat: PATHS.chat,
  notifications: PATHS.inbox,
  profile: PATHS.me,
};
const TABS: { id: Tab; label: string }[] = [
  { id: "feed", label: "📰 Feed" },
  { id: "spaces", label: "🏘️ Spaces" },
  { id: "search", label: "🔍 Search" },
  { id: "chat", label: "💬 Chat" },
  { id: "notifications", label: "🔔 Inbox" },
  { id: "profile", label: "👤 Me" },
];

// Optional link to the separate admin app (opens in a new tab). Hidden when VITE_ADMIN_URL is unset.
const ADMIN_URL = import.meta.env.VITE_ADMIN_URL;

// Deep-link target: open one entity full-bleed over the tabs, optionally scrolling to/highlighting a
// comment (or the entity itself). Two producers feed it:
//   1. the URL query on load — the admin app links moderators straight to reported content via
//      ?entity=<id>[&comment=<id>]; read once on mount, then stripped from the URL (below).
//   2. the Notifications tab — clicking a notification opens its entity/comment and remembers the
//      inbox as the back-target (backTab/backLabel), so "back" returns there instead of the feed.
type DeepLink = {
  entityId: string;
  commentId?: string;
  highlightEntity?: boolean;
  backTab?: Tab;
  backLabel?: string;
};
function readDeepLink(): DeepLink | null {
  const params = new URLSearchParams(window.location.search);
  const entityId = params.get("entity");
  if (!entityId) return null;
  const commentId = params.get("comment") || undefined;
  return { entityId, commentId };
}
function clearDeepLinkFromUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete("entity");
  url.searchParams.delete("comment");
  window.history.replaceState(null, "", url.pathname + url.search + url.hash);
}

export default function Shell() {
  const { initialized, accessToken } = useAuth();
  // Proactively rotate the access token before its 30-min TTL lapses (no-op until signed in).
  useTokenRefresh();
  const { user } = useUser();
  const { handleOAuthCallback } = useOAuthSignIn();
  // Full logout: clears ALL persisted accounts (clearAllAccounts), not just the active one. The
  // active-account-only useAuth().signOut() takes the SDK's "switch to a remaining account" path
  // when more than one account is stored, so it can't reliably end the session (and won't clear a
  // corrupted/duplicate accounts map). signOutAll wipes the whole map and returns us to Login.
  const { signOutAll } = useSignOutAll() as any;
  const [tab, setTab] = useState<Tab>("feed");
  // Capture any ?entity=…&comment=… deep link once, synchronously, before the effect strips it from
  // the URL — so it survives the login round-trip if the moderator wasn't signed in yet.
  const [deepLink, setDeepLink] = useState<DeepLink | null>(() => readDeepLink());

  // On load, if we came back from an OAuth round-trip the Agora server appended the minted tokens to
  // the URL fragment (#accessToken=…&refreshToken=…); pull them into the store + clean the URL.
  // Then strip the deep-link query params so a refresh won't re-open the entity.
  useEffect(() => {
    handleOAuthCallback();
    clearDeepLinkFromUrl();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Per-tab page view. Fires once authed (the pre-auth `/` landing pageview from auto-track covers
  // the login screen) and on every tab switch; suppressed while a deep link is showing a detail
  // (EntityView records its own /entity view in that case).
  useEffect(() => {
    if (accessToken && !deepLink) trackPageView(TAB_TO_PATH[tab]);
  }, [tab, accessToken, deepLink]);

  if (!initialized) return <div className="center muted">Loading session…</div>;
  if (!accessToken) return <div className="center"><Login /></div>;

  // A deep link wins over the tab UI: render the targeted entity full-bleed, with a back button
  // that drops us onto the Feed tab. The reported comment (if any) is scrolled to + highlighted.
  const body = deepLink ? (
    <div className="app">
      <EntityView
        entityId={deepLink.entityId}
        highlightCommentId={deepLink.commentId}
        highlightEntity={deepLink.highlightEntity}
        onBack={() => { setDeepLink(null); setTab(deepLink.backTab ?? "feed"); }}
        backLabel={deepLink.backLabel ?? "← back to demo"}
      />
    </div>
  ) : (
    <div className="app">
      <div className="header">
        <div className="brand">🏛️ Agora <small>demo · @agora SDK → your Agora server</small></div>
        <div className="row">
          <button className="linklike" onClick={() => setTab("profile")} title="Edit profile">
            @{user?.username || user?.name || user?.id?.slice(0, 8)}
          </button>
          <button onClick={() => { track("logout"); signOutAll(); }}>Sign out</button>
          {ADMIN_URL && isOperatorToken(accessToken) && (
            <button onClick={() => window.open(ADMIN_URL, "_blank", "noopener,noreferrer")} title="Open the admin app in a new tab">
              🛠️ Admin
            </button>
          )}
        </div>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "feed" && <Feed />}
      {tab === "spaces" && <Spaces />}
      {tab === "search" && <Search />}
      {tab === "chat" && <Chat />}
      {tab === "notifications" && (
        <Notifications
          onOpen={(entityId, commentId) =>
            setDeepLink({
              entityId,
              commentId,
              highlightEntity: !commentId, // entity-level notification → flash the entity itself
              backTab: "notifications",
              backLabel: "← back to notifications",
            })
          }
        />
      )}
      {tab === "profile" && <Me />}
    </div>
  );

  // Provide the public-profile overlay above everything (deep link + tabs), so any AuthorTag can
  // open a profile. "Edit profile →" on your own profile drops the overlay and jumps to the Me tab.
  return (
    <ProfileViewerProvider
      currentUserId={user?.id}
      onEditOwnProfile={() => { setDeepLink(null); setTab("profile"); }}
    >
      {body}
    </ProfileViewerProvider>
  );
}
