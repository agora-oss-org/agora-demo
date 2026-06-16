import { useState } from "react";
import { trackPageView, PATHS } from "./analytics";
import Profile from "./Profile";
import Connections from "./Connections";
import Follows from "./Follows";

// The "Me" tab: the current user's own area. Profile editing is the landing sub-view; Connections
// (friend requests) is folded in here as a sub-category rather than its own top-level tab. No router,
// so it's a local sub-tab switch — mirrors how Shell swaps top-level tabs.
type Sub = "profile" | "connections" | "follows";
const SUBS: { id: Sub; label: string }[] = [
  { id: "profile", label: "✏️ Profile" },
  { id: "connections", label: "🤝 Connections" },
  { id: "follows", label: "❤️ Follows" },
];

export default function Me() {
  const [sub, setSub] = useState<Sub>("profile");

  // Each sub-view is still its own virtual page view (Shell fires /me on entering the tab, which
  // covers the default Profile sub-view; switching sub-tabs records /me ↔ /connections here).
  const select = (next: Sub) => {
    if (next === sub) return;
    setSub(next);
    trackPageView(next === "connections" ? PATHS.connections : next === "follows" ? PATHS.follows : PATHS.me);
  };

  return (
    <div className="col">
      <div className="tabs">
        {SUBS.map((s) => (
          <button key={s.id} className={sub === s.id ? "active" : ""} onClick={() => select(s.id)}>
            {s.label}
          </button>
        ))}
      </div>

      {sub === "profile" && <Profile />}
      {sub === "connections" && <Connections />}
      {sub === "follows" && <Follows />}
    </div>
  );
}
