import { useEffect, useState } from "react";
import { EventProvider, useEvent, useUpdateEvent, useUser } from "@agora-sdk/react-js";
import { AuthorTag, fileImageSrc } from "./EntityView";
import EventGuests from "./EventGuests";
import { track, trackPageView, PATHS } from "./analytics";

export const TYPE_ICON: Record<string, string> = { online: "💻", physical: "📍", hybrid: "🌐" };

// datetime-local input value ⇄ ISO string. datetime-local has no timezone info (it's "local wall
// time"), so this is a plain local Date round-trip — the separate `timezone` field is just an
// informational string tag, never applied to this conversion.
export function eventDateTimeToInputValue(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function inputValueToEventDateTime(value: string): string | undefined {
  if (!value) return undefined;
  return new Date(value).toISOString();
}

// Human-readable date range for display, e.g. "Jul 8, 2026, 6:00 PM – 9:00 PM" (falls back to a
// full second date+time when the end spills onto another day).
export function formatEventWhen(event: any): string {
  const start = new Date(event.startTime);
  const startStr = start.toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });
  if (!event.endTime) return startStr;
  const end = new Date(event.endTime);
  const sameDay = start.toDateString() === end.toDateString();
  const endStr = sameDay
    ? end.toLocaleString(undefined, { hour: "numeric", minute: "2-digit" })
    : end.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  return `${startStr} – ${endStr}`;
}

export default function EventView({
  eventId,
  onBack,
  backLabel = "← back",
}: {
  eventId: string;
  onBack: () => void;
  backLabel?: string;
}) {
  useEffect(() => { trackPageView(PATHS.event); }, []);
  const providerProps = { eventId, include: ["user", "space", "files", "userRsvp"] } as any;
  return (
    <EventProvider {...providerProps}>
      <Inner eventId={eventId} onBack={onBack} backLabel={backLabel} />
    </EventProvider>
  );
}

function Inner({ eventId, onBack, backLabel }: { eventId: string; onBack: () => void; backLabel: string }) {
  const { event, setEvent, deleteEvent, cancelEvent, setRsvp, withdrawRsvp } = useEvent() as any;
  const updateEventRaw = useUpdateEvent() as any;
  const { user } = useUser() as any;
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rsvpError, setRsvpError] = useState<string | null>(null);
  const isHost = !!(event && user && event.hostIds?.includes(user.id));

  // Same fail-closed grace-window pattern as EntityView.tsx: `event` stays undefined while loading
  // AND when a 403 (invite-only, not invited) is silently rejected, so a still-undefined event
  // after 5s is treated as unavailable rather than spinning forever.
  const [graceElapsed, setGraceElapsed] = useState(false);
  useEffect(() => {
    setGraceElapsed(false);
    const t = setTimeout(() => setGraceElapsed(true), 5000);
    return () => clearTimeout(t);
  }, [eventId]);

  const unavailable = event === null || (event === undefined && graceElapsed);
  if (unavailable) {
    return (
      <div className="col">
        <button onClick={onBack}>{backLabel}</button>
        <div className="panel muted">
          🔒 This event isn't available. It may have been removed, or it's invite-only and you
          weren't invited.
        </div>
      </div>
    );
  }
  if (!event) {
    return (
      <div className="col">
        <button onClick={onBack}>{backLabel}</button>
        <div className="panel muted">Loading…</div>
      </div>
    );
  }

  const cancelled = event.status === "cancelled";
  const cover = (event.files ?? []).find((f: any) => f.id === event.coverImageId);
  const gallery = (event.files ?? []).filter((f: any) => f.id !== event.coverImageId);
  const coverSrc = fileImageSrc(cover);
  const gallerySrcs = gallery.map(fileImageSrc).filter(Boolean) as string[];

  const doCancel = async () => {
    if (!window.confirm("Cancel this event? Attendees will still see it, marked cancelled.")) return;
    setBusy(true);
    try { await cancelEvent(); track("cancel_event"); }
    catch (e: any) { alert(e?.response?.data?.error || "Couldn't cancel this event."); }
    finally { setBusy(false); }
  };
  const doDelete = async () => {
    if (!window.confirm("Delete this event? This can't be undone.")) return;
    setBusy(true);
    try { await deleteEvent(); track("delete_event"); onBack(); }
    catch (e: any) { alert(e?.response?.data?.error || "Couldn't delete this event."); setBusy(false); }
  };
  const doRsvp = async (status: string) => {
    setRsvpError(null);
    try { await setRsvp(status); track("set_rsvp", { status }); }
    catch (e: any) { setRsvpError(e?.response?.data?.error || "Couldn't save your RSVP."); }
  };
  const doWithdraw = async () => {
    setRsvpError(null);
    try { await withdrawRsvp(); track("withdraw_rsvp"); }
    catch (e: any) { setRsvpError(e?.response?.data?.error || "Couldn't withdraw your RSVP."); }
  };

  return (
    <div className="col">
      <button onClick={onBack}>{backLabel}</button>
      {cancelled && <div className="error">🚫 This event has been cancelled.</div>}
      <div className="panel col">
        {editing ? (
          <EventEditor
            event={event}
            onCancel={() => setEditing(false)}
            onSave={async (update, coverCfg, galleryCfg) => {
              const updated = await updateEventRaw({ eventId, update, cover: coverCfg, gallery: galleryCfg });
              setEvent(updated);
              track("edit_event");
              setEditing(false);
            }}
          />
        ) : (
          <>
            <div className="row">
              <h3 style={{ margin: 0 }}>{TYPE_ICON[event.type]} {event.title}</h3>
              {event.visibility !== "public" && <span className="pill">{event.visibility}</span>}
              {event.space && <span className="pill">🏘️ {event.space.name}</span>}
              <span className="spacer" />
              <AuthorTag user={event.user} />
              {isHost && (
                <>
                  <button onClick={() => setEditing(true)} disabled={busy}>✏️ Edit</button>
                  {!cancelled && <button onClick={doCancel} disabled={busy}>🚫 Cancel</button>}
                  <button className="danger" onClick={doDelete} disabled={busy}>🗑️ Delete</button>
                </>
              )}
            </div>
            <div className="muted">{formatEventWhen(event)}{event.timezone ? ` (${event.timezone})` : ""}</div>
            {(event.type === "physical" || event.type === "hybrid") && (
              <div className="muted">📍 {event.venueName}{event.address ? `, ${event.address}` : ""}</div>
            )}
            {(event.type === "online" || event.type === "hybrid") && event.url && (
              <div className="muted">🔗 <a href={event.url} target="_blank" rel="noopener noreferrer">{event.url}</a></div>
            )}
            {event.description && <div className="prewrap">{event.description}</div>}
            {coverSrc && (
              <img src={coverSrc} alt="" style={{ maxWidth: "100%", maxHeight: 360, borderRadius: 10, border: "1px solid var(--border)" }} />
            )}
            {gallerySrcs.length > 0 && (
              <div className="row" style={{ flexWrap: "wrap" }}>
                {gallerySrcs.map((src, i) => (
                  <img key={i} src={src} alt="" style={{ maxWidth: 160, maxHeight: 160, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border)" }} />
                ))}
              </div>
            )}
            {!cancelled && (
              <div className="row">
                <button className={event.userRsvp === "going" ? "primary" : ""} onClick={() => doRsvp("going")}>Going ({event.rsvpCounts?.going ?? 0})</button>
                {event.allowMaybe && (
                  <button className={event.userRsvp === "maybe" ? "primary" : ""} onClick={() => doRsvp("maybe")}>Maybe ({event.rsvpCounts?.maybe ?? 0})</button>
                )}
                <button className={event.userRsvp === "not_going" ? "primary" : ""} onClick={() => doRsvp("not_going")}>Not going ({event.rsvpCounts?.not_going ?? 0})</button>
                {event.userRsvp && <button onClick={doWithdraw}>clear RSVP</button>}
                {rsvpError && <span className="error">{rsvpError}</span>}
              </div>
            )}
          </>
        )}
      </div>
      {isHost && <EventGuests eventId={eventId} hostIds={event.hostIds} onEventChange={setEvent} />}
    </div>
  );
}

// Host-only inline editor. Field set mirrors CreateEvent.tsx's create form plus removeImageIds
// checkboxes on existing images. onSave forwards (update, cover, gallery) to Inner, which routes
// them through the raw useUpdateEvent() hook (SDK gotcha #1 — the context's own updateEvent can't
// touch images).
function EventEditor({
  event, onCancel, onSave,
}: {
  event: any;
  onCancel: () => void;
  onSave: (update: any, cover?: { file: File }, gallery?: { files: File[] }) => Promise<void>;
}) {
  const [title, setTitle] = useState<string>(event.title ?? "");
  const [description, setDescription] = useState<string>(event.description ?? "");
  const [startTime, setStartTime] = useState(eventDateTimeToInputValue(event.startTime));
  const [endTime, setEndTime] = useState(eventDateTimeToInputValue(event.endTime));
  const [timezone, setTimezone] = useState<string>(event.timezone ?? "");
  const [type, setType] = useState<string>(event.type);
  const [url, setUrl] = useState<string>(event.url ?? "");
  const [venueName, setVenueName] = useState<string>(event.venueName ?? "");
  const [address, setAddress] = useState<string>(event.address ?? "");
  const [visibility, setVisibility] = useState<string>(event.visibility);
  const [capacity, setCapacity] = useState<string>(event.capacity != null ? String(event.capacity) : "");
  const [allowMaybe, setAllowMaybe] = useState<boolean>(event.allowMaybe);
  const [guestListVisible, setGuestListVisible] = useState<boolean>(event.guestListVisible);
  const [removeImageIds, setRemoveImageIds] = useState<string[]>([]);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [galleryFiles, setGalleryFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleRemove = (fileId: string) =>
    setRemoveImageIds((ids) => (ids.includes(fileId) ? ids.filter((id) => id !== fileId) : [...ids, fileId]));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSave(
        {
          title: title.trim(),
          description: description.trim() || undefined,
          startTime: inputValueToEventDateTime(startTime),
          endTime: endTime ? inputValueToEventDateTime(endTime) : undefined,
          timezone: timezone.trim() || undefined,
          type,
          url: url.trim() || undefined,
          venueName: venueName.trim() || undefined,
          address: address.trim() || undefined,
          visibility,
          capacity: capacity.trim() ? Number(capacity) : undefined,
          allowMaybe,
          guestListVisible,
          ...(removeImageIds.length ? { removeImageIds } : {}),
        },
        coverFile ? { file: coverFile } : undefined,
        galleryFiles.length ? { files: galleryFiles } : undefined
      );
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || "Failed to save changes");
      setBusy(false);
    }
  };

  return (
    <div className="col">
      <strong>Edit event</strong>
      <input placeholder="title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea placeholder="description" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
      <div className="row">
        <label className="muted">starts</label>
        <input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        <label className="muted">ends</label>
        <input type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
      </div>
      <input placeholder="timezone, e.g. America/New_York (optional)" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
      <select value={type} onChange={(e) => setType(e.target.value)}>
        <option value="online">💻 online</option>
        <option value="physical">📍 physical</option>
        <option value="hybrid">🌐 hybrid</option>
      </select>
      {(type === "online" || type === "hybrid") && (
        <input placeholder="url" value={url} onChange={(e) => setUrl(e.target.value)} />
      )}
      {(type === "physical" || type === "hybrid") && (
        <>
          <input placeholder="venue name" value={venueName} onChange={(e) => setVenueName(e.target.value)} />
          <input placeholder="address" value={address} onChange={(e) => setAddress(e.target.value)} />
        </>
      )}
      <select value={visibility} onChange={(e) => setVisibility(e.target.value)}>
        <option value="public">public</option>
        <option value="members">members</option>
        <option value="invite">invite-only</option>
      </select>
      <input placeholder="capacity (optional)" type="number" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
      <label className="row" style={{ gap: 6 }}>
        <input type="checkbox" style={{ width: "auto" }} checked={allowMaybe} onChange={(e) => setAllowMaybe(e.target.checked)} />
        <span className="muted">allow "maybe" RSVPs</span>
      </label>
      <label className="row" style={{ gap: 6 }}>
        <input type="checkbox" style={{ width: "auto" }} checked={guestListVisible} onChange={(e) => setGuestListVisible(e.target.checked)} />
        <span className="muted">guest list visible to attendees</span>
      </label>

      {(event.files ?? []).length > 0 && (
        <div className="col">
          <label className="muted">existing images (check to remove)</label>
          <div className="row" style={{ flexWrap: "wrap" }}>
            {(event.files ?? []).map((f: any) => (
              <label key={f.id} className="col" style={{ gap: 2, width: "auto" }}>
                <img src={fileImageSrc(f) ?? ""} alt="" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border)" }} />
                <span className="row" style={{ gap: 4 }}>
                  <input type="checkbox" style={{ width: "auto" }} checked={removeImageIds.includes(f.id)} onChange={() => toggleRemove(f.id)} />
                  <span className="muted">remove</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
      <label className="muted">replace cover image (optional)</label>
      <input type="file" accept="image/*" onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)} />
      <label className="muted">add gallery images (optional)</label>
      <input type="file" accept="image/*" multiple onChange={(e) => setGalleryFiles(Array.from(e.target.files ?? []))} />

      {error && <div className="error">{error}</div>}
      <div className="row">
        <button onClick={onCancel} disabled={busy}>Cancel</button>
        <span className="spacer" />
        <button className="primary" onClick={save} disabled={busy || !title.trim()}>{busy ? "Saving…" : "Save"}</button>
      </div>
    </div>
  );
}
