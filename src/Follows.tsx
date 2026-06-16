import { useEffect, useState } from "react";
import { useFetchFollowing, useFetchFollowers, useUnfollowByFollowId } from "@agora-sdk/react-js";
import { track } from "./analytics";

// One-way follows via the follow fetch/unfollow hooks (→ /v7/users/:id/follow* + /v7/follows,
// project derived from auth). Distinct from Connections (bidirectional friend requests) — follows
// need no accept step. Shows who you follow (with Unfollow) and who follows you.
export default function Follows() {
  const fetchFollowing = useFetchFollowing() as any;
  const fetchFollowers = useFetchFollowers() as any;
  const unfollow = useUnfollowByFollowId() as any;

  const [following, setFollowing] = useState<any[]>([]);
  const [followers, setFollowers] = useState<any[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const fg = await fetchFollowing({}); setFollowing(fg?.data ?? []);
      const fr = await fetchFollowers({}); setFollowers(fr?.data ?? []);
    } catch (e: any) { setMsg(e?.response?.data?.error || e?.message); }
  };
  // Follows aren't realtime (the socket layer is chat-only), so a new follower won't push to us.
  // Poll while this tab is mounted so incoming follows surface within a few seconds — same cadence
  // as Connections.
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 6000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handle = (u: any) => "@" + (u?.username || u?.id?.slice(0, 8) || "someone");

  return (
    <div className="col">
      <div className="panel col">
        <strong>Following — {following.length}</strong>
        {following.map((f) => (
          <div key={f.followId} className="card row">
            <span>{handle(f.user)}</span>
            <span className="spacer" />
            <button onClick={async () => { await unfollow({ followId: f.followId }); track("unfollow_user"); refresh(); }}>Unfollow</button>
          </div>
        ))}
        {following.length === 0 && <div className="muted">none yet</div>}
      </div>

      <div className="panel col">
        <strong>Followers — {followers.length}</strong>
        {followers.map((f) => (
          <div key={f.followId} className="card row">
            <span>{handle(f.user)}</span>
          </div>
        ))}
        {followers.length === 0 && <div className="muted">none yet</div>}
      </div>

      {msg && <div className="muted">{msg}</div>}
    </div>
  );
}
