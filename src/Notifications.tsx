import { useAppNotifications } from "@agora-sdk/react-js";
import { useProfileViewer } from "./ProfileViewerContext";

// Where clicking a notification should go. The SDK stamps an `action` discriminator and stashes the
// relevant ids in `metadata` (see the AppNotification model):
//   open-entity  → entityId               → open that entity, flash the entity itself
//   open-comment → entityId + commentId   → open the entity, scroll to/highlight that comment
//   open-profile → initiatorId            → open that user's public-profile overlay
// open-space has no in-app drill-down target in this demo, so those rows just mark read.
// (comment-reply carries both commentId (the parent) and replyId (the new reply); we highlight the
// parent commentId since the demo renders a flat top-level comment list — a nested replyId wouldn't
// be on screen to scroll to.)
type NavTarget =
  | { kind: "entity"; entityId: string; commentId?: string }
  | { kind: "profile"; userId: string }
  | null;

function notificationTarget(x: any): NavTarget {
  const m = x?.metadata ?? {};
  if (m.entityId) return { kind: "entity", entityId: m.entityId, commentId: m.commentId || undefined };
  if (x?.action === "open-profile" && m.initiatorId) return { kind: "profile", userId: m.initiatorId };
  return null;
}

// In-app notification inbox via useAppNotifications (→ /v7/:project/app-notifications). Clicking a
// notification marks it read AND navigates to its target (entity/comment open over the tabs via the
// onOpen deep link Shell owns; profiles open in the app-wide ProfileViewer overlay).
export default function Notifications({ onOpen }: { onOpen: (entityId: string, commentId?: string) => void }) {
  const n = useAppNotifications({} as any) as any;
  const { openProfile } = useProfileViewer();
  const {
    appNotifications, unreadAppNotificationsCount, loading, hasMore, loadMore,
    markAllNotificationsAsRead, markNotificationAsRead,
  } = n;

  const handleClick = (x: any) => {
    if (!x.isRead) markNotificationAsRead?.({ notificationId: x.id });
    const target = notificationTarget(x);
    if (target?.kind === "entity") onOpen(target.entityId, target.commentId);
    else if (target?.kind === "profile") openProfile(target.userId);
  };

  return (
    <div className="col">
      <div className="panel row">
        <strong>Notifications</strong>
        <span className="pill">{unreadAppNotificationsCount ?? 0} unread</span>
        <span className="spacer" />
        <button onClick={() => markAllNotificationsAsRead?.()}>Mark all read</button>
      </div>
      <div className="muted">{loading ? "Loading…" : `${appNotifications?.length ?? 0} notifications`}</div>
      {(appNotifications ?? []).map((x: any) => {
        const target = notificationTarget(x);
        const clickable = !!target || !x.isRead; // clicking does something: navigate and/or mark read
        return (
          <div
            key={x.id}
            className={"card" + (x.isRead ? "" : " mine")}
            style={{ cursor: clickable ? "pointer" : "default" }}
            onClick={() => handleClick(x)}
          >
            <div className="row">
              <strong>{x.type}</strong>
              <span className="spacer" />
              {target && <span className="muted">open →</span>}
            </div>
            <div className="muted">
              {x.metadata?.initiatorName || x.metadata?.initiatorUsername || ""} · {new Date(x.createdAt).toLocaleString()}
              {x.isRead ? "" : " • unread"}
            </div>
          </div>
        );
      })}
      {(appNotifications?.length ?? 0) === 0 && !loading && <div className="muted">No notifications yet.</div>}
      {hasMore && <button onClick={() => loadMore()}>Load more</button>}
    </div>
  );
}
