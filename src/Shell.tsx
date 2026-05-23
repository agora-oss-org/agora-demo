import { useState } from "react";
import { useAuth, useUser } from "@agora/react-js";
import Login from "./Login";
import Feed from "./Feed";
import Search from "./Search";
import Chat from "./Chat";

type Tab = "feed" | "search" | "chat";

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
          <span className="muted">@{user?.username || user?.name || user?.id?.slice(0, 8)}</span>
          <button onClick={() => signOut()}>Sign out</button>
        </div>
      </div>

      <div className="tabs">
        {(["feed", "search", "chat"] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
            {t === "feed" ? "📰 Feed" : t === "search" ? "🔍 Search" : "💬 Chat"}
          </button>
        ))}
      </div>

      {tab === "feed" && <Feed />}
      {tab === "search" && <Search />}
      {tab === "chat" && <Chat />}
    </div>
  );
}
