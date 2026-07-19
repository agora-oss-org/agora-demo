import { useEffect, useState } from "react";
import { useFetchUser, useEntityList, useFollowManager, useRequestConnection } from "@agora-sdk/react-js";
import EntityView, { fileImageSrc, isModeratedOut, ModerationPill, PublicPill } from "./EntityView";
import { track, trackPageView, PATHS } from "./analytics";

// Public, read-only view of any user — opened from a clicked author name (AuthorTag → the
// ProfileViewer overlay). useFetchUser({ userId }) returns the public-safe User (no email/secure
// fields); useEntityList filtered by userId lists their recent posts. Clicking a post drills into
// the normal EntityView in place. Your own profile shows an "Edit →" shortcut to the Me tab.
export default function UserProfile({
  userId, currentUserId, onClose, onEditProfile,
}: {
  userId: string;
  currentUserId?: string;
  onClose: () => void;
  onEditProfile: () => void;
}) {
  const fetchUser = useFetchUser() as any;
  const posts = useEntityList({ listId: `user-posts-${userId}` }) as any;
  // Relationship actions on the viewed user: one-way follow (status-aware toggle) + a connection
  // (friend) request reusing the same hook Connections.tsx fires. Keyed by userId; the overlay
  // remounts UserProfile per profile, so useFollowManager re-fetches status for each.
  const follow = useFollowManager({ userId }) as any;
  const requestConnection = useRequestConnection() as any;
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
  // null = idle, "sent" = connection request fired this session, any other string = error to show.
  const [connectState, setConnectState] = useState<null | "sent" | string>(null);

  const onToggleFollow = async () => {
    const wasFollowing = !!follow.isFollowing;
    try {
      await follow.toggleFollow();
      track(wasFollowing ? "unfollow_user" : "follow_user");
    } catch { /* loose demo style: leave the toggle as-is on failure */ }
  };
  const onConnect = async () => {
    try {
      await requestConnection({ userId, message: "Hi from the Agora demo!" });
      track("request_connection");
      setConnectState("sent");
    } catch (e: any) { setConnectState(e?.response?.data?.error || e?.message || "Couldn't send request"); }
  };

  // /user page view (no-router SPA → recorded explicitly), once per profile opened.
  useEffect(() => { trackPageView(PATHS.user); }, [userId]);

  useEffect(() => {
    let alive = true;
    setLoading(true); setErr(null);
    fetchUser({ userId, include: ["files"] })
      .then((u: any) => { if (alive) setUser(u); })
      .catch((e: any) => { if (alive) setErr(e?.response?.data?.error || e?.message || "Couldn't load this profile"); })
      .finally(() => { if (alive) setLoading(false); });
    // Their recent posts, newest first (include:["user"] keeps AuthorTag populated inside EntityView).
    posts.fetchEntities?.({ userId }, { sortBy: "new" }, { limit: 10, include: ["user"] });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Drill into one of their posts without leaving the overlay.
  if (selectedEntity)
    return (
      <div className="panel">
        <EntityView entityId={selectedEntity} onBack={() => setSelectedEntity(null)} backLabel="← back to profile" />
      </div>
    );

  const isMe = !!(currentUserId && user?.id === currentUserId);
  const banner = fileImageSrc(user?.bannerFile);
  const avatar = user?.avatar || fileImageSrc(user?.avatarFile);
  const handle = user?.username ? "@" + user.username : (user?.name || user?.id?.slice(0, 8) || "someone");
  const role = user?.role && user.role !== "visitor" ? user.role : null;

  return (
    <div className="panel col" style={{ gap: 12 }}>
      <div className="row">
        <button onClick={onClose}>← close</button>
        <span className="spacer" />
        {isMe && <button className="linklike" onClick={onEditProfile}>✏️ Edit profile →</button>}
      </div>

      {loading && <div className="muted">Loading profile…</div>}
      {err && <div className="error">{err}</div>}

      {user && (
        <>
          {banner && (
            <img src={banner} alt="" style={{ width: "100%", maxHeight: 160, objectFit: "cover", borderRadius: 10, border: "1px solid var(--border)" }} />
          )}
          <div className="row" style={{ gap: 12, alignItems: "center" }}>
            {avatar ? (
              <img src={avatar} alt="" style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover", border: "1px solid var(--border)" }} />
            ) : (
              <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#231f33", display: "grid", placeItems: "center", fontSize: 26 }}>👤</div>
            )}
            <div className="col" style={{ gap: 2 }}>
              <strong style={{ fontSize: 18 }}>{user.name || handle}</strong>
              <span className="muted">{handle}{isMe ? " · you" : ""}</span>
              <div className="row" style={{ gap: 6, marginTop: 2, flexWrap: "wrap" }}>
                <span className="pill">⭐ {user.reputation ?? 0}</span>
                {role && <span className="pill">{role}</span>}
                {user.createdAt && <span className="pill">joined {new Date(user.createdAt).toLocaleDateString()}</span>}
              </div>
            </div>
          </div>

          {!isMe && (
            <div className="row" style={{ gap: 8, marginTop: 4, flexWrap: "wrap" }}>
              <button className={follow.isFollowing ? "" : "primary"} disabled={follow.isLoading} onClick={onToggleFollow}>
                {follow.isFollowing ? "✓ Following" : "➕ Follow"}
              </button>
              <button disabled={connectState === "sent"} onClick={onConnect}>
                {connectState === "sent" ? "✓ Request sent" : "🤝 Connect"}
              </button>
            </div>
          )}
          {typeof connectState === "string" && connectState !== "sent" && <div className="muted">{connectState}</div>}

          {user.bio && <div className="prewrap">{user.bio}</div>}

          <div className="row" style={{ marginTop: 6 }}><strong>Recent posts</strong></div>
          <div className="muted">{posts.loading ? "Loading…" : `${posts.entities?.length ?? 0} posts`}</div>
          {(posts.entities ?? []).map((e: any) => (
            <div
              key={e.id}
              className={"card" + (isModeratedOut(e) ? " redacted" : "")}
              onClick={() => setSelectedEntity(e.id)}
              style={{ cursor: "pointer" }}
            >
              <div className="row">
                <h4 style={{ margin: 0 }}>{e.title || "(untitled)"}</h4>
                <PublicPill entity={e} />
                <ModerationPill entity={e} />
                <span className="spacer" />
                <span className="muted">open →</span>
              </div>
              <div className="clamp3">{e.content}</div>
              <div className="row" style={{ marginTop: 6 }}>
                <span className="pill">⬆ {e.reactionCounts?.upvote ?? 0}</span>
                <span className="pill">💬 {e.repliesCount ?? 0}</span>
              </div>
            </div>
          ))}
          {posts.hasMore && <button onClick={() => posts.loadMore()}>Load more</button>}
          {!posts.loading && (posts.entities?.length ?? 0) === 0 && <div className="muted">No posts yet.</div>}
        </>
      )}
    </div>
  );
}
