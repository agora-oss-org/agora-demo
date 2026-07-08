import { useEffect, useState } from "react";
import { useCreateEvent, useSpaceList } from "@agora-sdk/react-js";
import { inputValueToEventDateTime } from "./EventView";
import { track } from "./analytics";

// Standalone "create an event" form, routed to from the Events tab. Cover (single) + gallery
// (multi) are distinct upload configs on useCreateEvent, unlike CreateEntity.tsx's single combined
// image list — the server models an event's cover and gallery as separate concepts.
export default function CreateEvent({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const createEvent = useCreateEvent() as any;
  const spaceList = useSpaceList({ listId: "demo-events-create-spaces" }) as any;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [timezone, setTimezone] = useState("");
  const [type, setType] = useState<"online" | "physical" | "hybrid">("online");
  const [url, setUrl] = useState("");
  const [venueName, setVenueName] = useState("");
  const [address, setAddress] = useState("");
  const [spaceId, setSpaceId] = useState("");
  const [visibility, setVisibility] = useState<"public" | "members" | "invite">("public");
  const [capacity, setCapacity] = useState("");
  const [allowMaybe, setAllowMaybe] = useState(true);
  const [guestListVisible, setGuestListVisible] = useState(true);
  const [cover, setCover] = useState<File | null>(null);
  const [gallery, setGallery] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // First page of the user's accessible spaces for the optional space picker — no search/
  // typeahead, just a plain dropdown (see the design spec's "space picker search" out-of-scope note).
  useEffect(() => {
    spaceList.fetchSpaces?.({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async () => {
    if (!title.trim() || !startTime) return;
    setBusy(true);
    setError(null);
    try {
      await createEvent({
        title: title.trim(),
        description: description.trim() || undefined,
        startTime: inputValueToEventDateTime(startTime)!,
        endTime: endTime ? inputValueToEventDateTime(endTime) : undefined,
        timezone: timezone.trim() || undefined,
        type,
        url: url.trim() || undefined,
        venueName: venueName.trim() || undefined,
        address: address.trim() || undefined,
        spaceId: spaceId || undefined,
        visibility,
        capacity: capacity.trim() ? Number(capacity) : undefined,
        allowMaybe,
        guestListVisible,
        ...(cover ? { cover: { file: cover } } : {}),
        ...(gallery.length ? { gallery: { files: gallery } } : {}),
      });
      track("create_event", {
        type, visibility, hasCover: !!cover, hasGallery: gallery.length > 0, hasSpace: !!spaceId,
      });
      onDone();
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || "Failed to create event");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="col">
      <button onClick={onCancel}>← cancel</button>
      <div className="panel col">
        <strong>Create an event</strong>
        <input placeholder="title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea placeholder="description (optional)" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
        <div className="row">
          <label className="muted">starts</label>
          <input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          <label className="muted">ends (optional)</label>
          <input type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </div>
        <input placeholder="timezone, e.g. America/New_York (optional)" value={timezone} onChange={(e) => setTimezone(e.target.value)} />

        <select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
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

        <label className="muted">space (optional)</label>
        <select value={spaceId} onChange={(e) => setSpaceId(e.target.value)}>
          <option value="">— none —</option>
          {(spaceList.spaces ?? []).map((s: any) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <select value={visibility} onChange={(e) => setVisibility(e.target.value as typeof visibility)}>
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

        <label className="muted">🖼 Cover image (optional)</label>
        <input type="file" accept="image/*" onChange={(e) => setCover(e.target.files?.[0] ?? null)} />
        {cover && (
          <div className="row">
            <img src={URL.createObjectURL(cover)} alt={cover.name} style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border)" }} />
            <button onClick={() => setCover(null)}>clear</button>
          </div>
        )}

        <label className="muted">🖼 Gallery images (optional)</label>
        <input type="file" accept="image/*" multiple onChange={(e) => setGallery(Array.from(e.target.files ?? []))} />
        {gallery.length > 0 && (
          <div className="row" style={{ flexWrap: "wrap" }}>
            {gallery.map((f, i) => (
              <img key={i} src={URL.createObjectURL(f)} alt={f.name} style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border)" }} />
            ))}
            <button onClick={() => setGallery([])}>clear</button>
          </div>
        )}

        {error && <div className="error">{error}</div>}
        <div className="row">
          <span className="spacer" />
          <button className="primary" disabled={busy || !title.trim() || !startTime} onClick={submit}>
            {busy ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
