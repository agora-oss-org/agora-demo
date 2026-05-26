import { useAppNotifications } from "@agora-sdk/react-js";

// In-app notification inbox via useAppNotifications (→ /v7/:project/app-notifications).
export default function Notifications() {
  const n = useAppNotifications({} as any) as any;
  const {
    appNotifications, unreadAppNotificationsCount, loading, hasMore, loadMore,
    markAllNotificationsAsRead, markNotificationAsRead,
  } = n;

  return (
    <div className="col">
      <div className="panel row">
        <strong>Notifications</strong>
        <span className="pill">{unreadAppNotificationsCount ?? 0} unread</span>
        <span className="spacer" />
        <button onClick={() => markAllNotificationsAsRead?.()}>Mark all read</button>
      </div>
      <div className="muted">{loading ? "Loading…" : `${appNotifications?.length ?? 0} notifications`}</div>
      {(appNotifications ?? []).map((x: any) => (
        <div
          key={x.id}
          className={"card" + (x.isRead ? "" : " mine")}
          style={{ cursor: x.isRead ? "default" : "pointer" }}
          onClick={() => !x.isRead && markNotificationAsRead?.({ notificationId: x.id })}
        >
          <strong>{x.type}</strong>
          <div className="muted">
            {x.metadata?.initiatorName || x.metadata?.initiatorUsername || ""} · {new Date(x.createdAt).toLocaleString()}
            {x.isRead ? "" : " • unread"}
          </div>
        </div>
      ))}
      {(appNotifications?.length ?? 0) === 0 && !loading && <div className="muted">No notifications yet.</div>}
      {hasMore && <button onClick={() => loadMore()}>Load more</button>}
    </div>
  );
}
