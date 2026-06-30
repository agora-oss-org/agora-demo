import { useEffect, useState } from "react";
import { useAuth, useUser, useOAuthSignIn, useSignOutAll } from "@agora-sdk/react-js";
import * as secureChatCore from "@agora-sdk/secure-chat-core";
import Login from "./Login";
import useTokenRefresh from "./useTokenRefresh";
import { track, trackPageView, PATHS } from "./analytics";
import { ProfileViewerProvider } from "./ProfileViewer";
import EntityView, { isOperatorToken } from "./EntityView";
import Feed from "./Feed";
import Search from "./Search";
import Chat from "./Chat";
import SecureChat from "./secure/SecureChat";
import SecureUnlock from "./secure/SecureUnlock";
import { useSecureStore } from "./secure/SecureStoreContext";
import Spaces from "./Spaces";
import Notifications from "./Notifications";
import Me from "./Me";
import Social from "./Social";
import { SocialProvider } from "@agora-sdk/social-core";
import { API_BASE_URL, PROJECT_ID } from "./config";

type Tab = "feed" | "spaces" | "search" | "chat" | "secure" | "social" | "notifications" | "profile";
// Each tab is a virtual page view (the app has no router, so these populate Umami's "Pages"
// report). Two ids don't match their path: notifications→/inbox, profile→/me. Connections is no
// longer a top-level tab — it lives under Me (records /connections from there).
const TAB_TO_PATH: Record<Tab, string> = {
  feed: PATHS.feed,
  spaces: PATHS.spaces,
  search: PATHS.search,
  chat: PATHS.chat,
  secure: PATHS.secure,
  social: PATHS.social,
  notifications: PATHS.inbox,
  profile: PATHS.me,
};
const TABS: { id: Tab; label: string }[] = [
  { id: "feed", label: "📰 Feed" },
  { id: "spaces", label: "🏘️ Spaces" },
  { id: "search", label: "🔍 Search" },
  { id: "chat", label: "💬 Chat" },
  { id: "secure", label: "🔒 Secure Chat" },
  { id: "social", label: "☀️ Social" },
  { id: "notifications", label: "🔔 Inbox" },
  { id: "profile", label: "👤 Me" },
];

// Optional link to the separate admin app (opens in a new tab). Hidden when VITE_ADMIN_URL is unset.
const ADMIN_URL = import.meta.env.VITE_ADMIN_URL;
// App version (package.json), inlined by vite.config.ts → shown in the header so a deploy's build is
// identifiable at a glance.
const APP_VERSION = import.meta.env.VITE_APP_VERSION;
// Installed @agora-sdk/secure-chat-core version, read from the SDK's runtime `VERSION` export so it
// reflects the code actually running (the aliased local fork or the npm package). Accessed loosely —
// the published npm types don't include it yet (only the local fork does), so it's omitted from the
// header until the export ships on npm; switch to a typed `import { VERSION }` once it does.
const SECURE_CHAT_VERSION = (secureChatCore as any).VERSION as string | undefined;

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
  // Secure chat encrypts its IndexedDB at rest, so its provider is mounted only once unlocked. Until
  // then the Chat tab shows the unlock prompt instead of SecureChat (whose hooks need the provider).
  // While locked, the Secure Chat tab shows the unlock prompt; once unlocked it swaps to SecureChat in
  // place (the provider is already mounted above the Shell, so unlocking never remounts this — you stay
  // on whatever tab you're on).
  const { unlocked } = useSecureStore();
  const [tab, setTab] = useState<Tab>("feed");
  // Re-clicking the already-active Feed/Spaces tab should drop any drill-down (entity/space detail,
  // create forms, nested subspaces) and return to the tab root. That state lives *inside* Feed/Spaces
  // as local state, so we reset it by remounting: bump a per-tab key on a same-tab click, which
  // unmounts the drilled-in tree and mounts a fresh one. Only feed/spaces opt in (their keys read
  // this); other tabs ignore it.
  const [rootKey, setRootKey] = useState<Partial<Record<Tab, number>>>({});
  const selectTab = (id: Tab) => {
    if (id === tab && (id === "feed" || id === "spaces")) {
      setRootKey((k) => ({ ...k, [id]: (k[id] ?? 0) + 1 }));
    }
    setTab(id);
  };
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
        <div className="brand">🏛️ Agora <small>demo{APP_VERSION ? ` v${APP_VERSION}` : ""}{SECURE_CHAT_VERSION ? ` · secure-chat v${SECURE_CHAT_VERSION}` : ""} · @agora SDK → your Agora server</small></div>
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
          <button key={t.id} className={tab === t.id ? "active" : ""} onClick={() => selectTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "feed" && <Feed key={`feed-${rootKey.feed ?? 0}`} />}
      {tab === "spaces" && <Spaces key={`spaces-${rootKey.spaces ?? 0}`} />}
      {tab === "search" && <Search />}
      {tab === "chat" && <Chat />}
      {tab === "secure" && (unlocked ? <SecureChat /> : <SecureUnlock />)}
      {tab === "social" && <Social />}
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
    <SocialProvider projectId={PROJECT_ID} baseUrl={API_BASE_URL} accessToken={accessToken}>
      <ProfileViewerProvider
        currentUserId={user?.id}
        onEditOwnProfile={() => { setDeepLink(null); setTab("profile"); }}
      >
        {body}
      </ProfileViewerProvider>
    </SocialProvider>
  );
}
