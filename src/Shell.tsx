import { useEffect, useState } from "react";
import { useAuth, useUser, useOAuthSignIn, useSignOutAll } from "@agora-sdk/react-js";
import Login from "./Login";
import Feed from "./Feed";
import Search from "./Search";
import Chat from "./Chat";
import Spaces from "./Spaces";
import Connections from "./Connections";
import Notifications from "./Notifications";
import Profile from "./Profile";

type Tab = "feed" | "spaces" | "search" | "chat" | "connections" | "notifications" | "profile";
const TABS: { id: Tab; label: string }[] = [
  { id: "feed", label: "📰 Feed" },
  { id: "spaces", label: "🏘️ Spaces" },
  { id: "search", label: "🔍 Search" },
  { id: "chat", label: "💬 Chat" },
  { id: "connections", label: "🤝 Connections" },
  { id: "notifications", label: "🔔 Inbox" },
  { id: "profile", label: "👤 Me" },
];

// Optional link to the separate admin app (opens in a new tab). Hidden when VITE_ADMIN_URL is unset.
const ADMIN_URL = import.meta.env.VITE_ADMIN_URL;

export default function Shell() {
  const { initialized, accessToken } = useAuth();
  const { user } = useUser();
  const { handleOAuthCallback } = useOAuthSignIn();
  // Full logout: clears ALL persisted accounts (clearAllAccounts), not just the active one. The
  // active-account-only useAuth().signOut() takes the SDK's "switch to a remaining account" path
  // when more than one account is stored, so it can't reliably end the session (and won't clear a
  // corrupted/duplicate accounts map). signOutAll wipes the whole map and returns us to Login.
  const { signOutAll } = useSignOutAll() as any;
  const [tab, setTab] = useState<Tab>("feed");

  // On load, if we came back from an OAuth round-trip the Agora server appended the minted tokens to
  // the URL fragment (#accessToken=…&refreshToken=…); pull them into the store + clean the URL.
  useEffect(() => {
    handleOAuthCallback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!initialized) return <div className="center muted">Loading session…</div>;
  if (!accessToken) return <div className="center"><Login /></div>;

  return (
    <div className="app">
      <div className="header">
        <div className="brand">🏛️ Agora <small>demo · @agora SDK → your Agora server</small></div>
        <div className="row">
          <button className="linklike" onClick={() => setTab("profile")} title="Edit profile">
            @{user?.username || user?.name || user?.id?.slice(0, 8)}
          </button>
          <button onClick={() => signOutAll()}>Sign out</button>
          {ADMIN_URL && (
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
      {tab === "connections" && <Connections />}
      {tab === "notifications" && <Notifications />}
      {tab === "profile" && <Profile />}
    </div>
  );
}
