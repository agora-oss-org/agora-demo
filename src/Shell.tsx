import { useState } from "react";
import { useAuth, useUser } from "@agora-sdk/react-js";
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

export default function Shell() {
  const { initialized, accessToken, signOut } = useAuth();
  const { user } = useUser();
  const [tab, setTab] = useState<Tab>("feed");

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
          <button onClick={() => signOut()}>Sign out</button>
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
