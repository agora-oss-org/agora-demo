import { useState } from "react";
import { useCreateEntity } from "@agora/react-js";

// Standalone "create an entity" form, routed to from the Feed (and from inside a space).
// Uses useCreateEntity (→ POST /v7/:project/entities), which takes an optional `spaceId` so the
// same form can post a top-level entity or an entry scoped to a space.
export default function CreateEntity({
  spaceId,
  spaceName,
  onDone,
  onCancel,
}: {
  spaceId?: string;
  spaceName?: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const createEntity = useCreateEntity() as any;
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!content.trim() && !title.trim() && images.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      // useCreateEntity switches to a multipart request when `images.files` is present, uploading
      // each image and attaching the resulting file records to the new entity (entity.files).
      await createEntity({
        title: title || undefined,
        content: content || undefined,
        spaceId,
        ...(images.length ? { images: { files: images } } : {}),
      });
      onDone();
    } catch (e: any) {
      setError(e?.message || "Failed to create entity");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="col">
      <button onClick={onCancel}>← cancel</button>
      <div className="panel col">
        <strong>Create an entity{spaceName ? ` in 🏘️ ${spaceName}` : ""}</strong>
        <input placeholder="title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea
          placeholder="what's on your mind?"
          rows={4}
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />

        <label className="muted">🖼 Images (optional)</label>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => setImages(Array.from(e.target.files ?? []))}
        />
        {images.length > 0 && (
          <div className="row" style={{ flexWrap: "wrap" }}>
            {images.map((f, i) => (
              <img
                key={i}
                src={URL.createObjectURL(f)}
                alt={f.name}
                style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border)" }}
              />
            ))}
            <button onClick={() => setImages([])}>clear</button>
          </div>
        )}

        {error && <div className="error">{error}</div>}
        <div className="row">
          <span className="spacer" />
          <button className="primary" disabled={busy} onClick={submit}>
            {busy ? "Posting…" : "Post"}
          </button>
        </div>
      </div>
    </div>
  );
}
