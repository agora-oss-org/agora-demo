import { useState } from "react";
import { useFetchManyEventsWrapper, useUser } from "@agora-sdk/react-js";
import EventView, { TYPE_ICON, formatEventWhen } from "./EventView";
import CreateEvent from "./CreateEvent";
import { fileImageSrc, AuthorTag } from "./EntityView";
import { track } from "./analytics";

const TIME_WINDOWS = ["upcoming", "ongoing", "past", "all"] as const;
const SORTS = ["startTime", "going"] as const;
const EVENT_INCLUDE: string[] = ["user", "space", "files", "userRsvp"];

// Browses events via useFetchManyEventsWrapper (→ GET /v7/:project/events), a self-contained
// paginated hook (unlike useEntityList, it needs no manual fetch call — changing its filter props
// re-triggers its own internal refetch).
export default function Events() {
  const { user } = useUser() as any;
  const [timeWindow, setTimeWindow] = useState<(typeof TIME_WINDOWS)[number]>("upcoming");
  const [hostedByMe, setHostedByMe] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const list = useFetchManyEventsWrapper({
    include: EVENT_INCLUDE,
    timeWindow: timeWindow === "all" ? null : timeWindow,
    hostId: hostedByMe && user?.id ? user.id : null,
    defaultSortBy: "startTime",
    defaultSortDir: "asc",
  }) as any;
  const { events, loading, hasMore, sortBy, setSortBy, sortDir, setSortDir, loadMore, refresh } = list;

  if (selected) return <EventView eventId={selected} onBack={() => { setSelected(null); refresh(); }} backLabel="← back to events" />;
  if (creating) return <CreateEvent onCancel={() => setCreating(false)} onDone={() => { setCreating(false); refresh(); }} />;

  return (
    <div className="col">
      <div className="row">
        <strong>Events</strong>
        <select
          value={timeWindow}
          onChange={(e) => {
            const next = e.target.value as (typeof TIME_WINDOWS)[number];
            setTimeWindow(next);
            track("change_event_filter", { timeWindow: next, sortBy, sortDir });
          }}
          style={{ width: "auto" }}
        >
          {TIME_WINDOWS.map((w) => <option key={w} value={w}>{w}</option>)}
        </select>
        <select
          value={sortBy ?? "startTime"}
          onChange={(e) => {
            const next = e.target.value as (typeof SORTS)[number];
            setSortBy(next);
            track("change_event_filter", { timeWindow, sortBy: next, sortDir });
          }}
          style={{ width: "auto" }}
        >
          {SORTS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button
          onClick={() => {
            const next = sortDir === "asc" ? "desc" : "asc";
            setSortDir(next);
            track("change_event_filter", { timeWindow, sortBy: sortBy ?? "startTime", sortDir: next });
          }}
        >
          {sortDir === "asc" ? "▲ asc" : "▼ desc"}
        </button>
        <label className="row" style={{ gap: 4, width: "auto" }}>
          <input
            type="checkbox"
            style={{ width: "auto" }}
            checked={hostedByMe}
            onChange={(e) => {
              setHostedByMe(e.target.checked);
              track("change_event_filter", { timeWindow, sortBy: sortBy ?? "startTime", sortDir });
            }}
          />
          <span className="muted">🎤 hosted by me</span>
        </label>
        <span className="spacer" />
        <button className="primary" onClick={() => setCreating(true)}>➕ New event</button>
      </div>

      <div className="muted">{loading ? "Loading…" : `${events?.length ?? 0} events`}</div>
      {(events ?? []).map((e: any) => {
        const cover = (e.files ?? []).find((f: any) => f.id === e.coverImageId);
        const coverSrc = fileImageSrc(cover);
        const cancelled = e.status === "cancelled";
        return (
          <div key={e.id} className="card" onClick={() => setSelected(e.id)} style={{ cursor: "pointer" }}>
            <div className="row">
              <h4 style={{ margin: 0 }}>{TYPE_ICON[e.type]} {e.title}</h4>
              {cancelled && <span className="pill danger">🚫 cancelled</span>}
              {e.space && <span className="pill">🏘️ {e.space.name}</span>}
              <span className="spacer" />
              <AuthorTag user={e.user} />
            </div>
            <div className="muted">{formatEventWhen(e)}</div>
            {coverSrc && (
              <img src={coverSrc} alt="" style={{ marginTop: 8, maxWidth: "100%", maxHeight: 220, borderRadius: 8, border: "1px solid var(--border)" }} />
            )}
            <div className="row" style={{ marginTop: 8 }}>
              <span className="pill">✅ {e.rsvpCounts?.going ?? 0}</span>
              <span className="pill">❔ {e.rsvpCounts?.maybe ?? 0}</span>
              <span className="pill">❌ {e.rsvpCounts?.not_going ?? 0}</span>
              <span className="spacer" />
              <span className="muted">open →</span>
            </div>
          </div>
        );
      })}
      {hasMore && <button onClick={() => loadMore()}>Load more</button>}
    </div>
  );
}
