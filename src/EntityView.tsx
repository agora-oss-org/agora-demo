import { useState } from "react";
import {
  EntityProvider, useEntity, useUser,
  useReactionToggle, useCommentSectionData, useCreateReport,
} from "@agora-sdk/react-js";

// Report reasons. The SDK exposes only the ReportReasonKey *type* from its index, not the
// runtime label map, so we mirror the labels here (kept in sync with @agora-sdk/core's
// constants/reportReasons). Used by ReportButton below.
const REPORT_REASONS: ReadonlyArray<[string, string]> = [
  ["spam", "It's spam"],
  ["inappropriateContent", "Contains inappropriate content"],
  ["harassment", "It's harassment or bullying"],
  ["misinformation", "Spreads false information"],
  ["hateSpeech", "Contains hate speech or symbols"],
  ["violence", "Promotes violence or dangerous behavior"],
  ["illegalActivity", "Promotes illegal activity"],
  ["selfHarm", "Promotes self-harm or suicide"],
  ["other", "Other"],
];

// 🚩 Report this entity/comment to moderators via useCreateReport (→ POST /reports). Hidden for
// content you authored, and for optimistic-only comments that don't have a server id yet.
// Inline disclosure via <details>: closed = just the 🚩 chip; open = a reason picker + optional
// details + Submit. After a successful report we replace the control with a "✓ Reported" pill.
function ReportButton({
  targetType, targetId, ownerId, disabled,
}: {
  targetType: "entity" | "comment";
  targetId: string;
  ownerId?: string;
  disabled?: boolean;
}) {
  const { user } = useUser() as any;
  const createReport = useCreateReport({ type: targetType }) as any;
  const [reason, setReason] = useState<string>("spam");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (disabled) return null;
  if (user && ownerId && user.id === ownerId) return null;
  if (done) return <span className="muted" style={{ fontSize: 12 }}>✓ Reported</span>;

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      await createReport({ targetId, reason, details: details.trim() || undefined });
      setDone(true);
      setReason("spam"); setDetails("");
    } catch (e: any) {
      setErr(e?.response?.data?.error || e?.message || "Couldn't submit report");
    } finally { setBusy(false); }
  };

  return (
    <details>
      <summary
        title={`Report this ${targetType}`}
        style={{ cursor: "pointer", listStyle: "none", fontSize: 12, color: "var(--muted)", padding: "2px 6px", border: "1px solid var(--border)", borderRadius: 6 }}
      >🚩</summary>
      <div className="col" style={{ gap: 4, padding: 8, marginTop: 4, border: "1px solid var(--border)", borderRadius: 8, minWidth: 240 }}>
        <strong style={{ fontSize: 13 }}>Report this {targetType}</strong>
        <label className="muted">Reason</label>
        <select value={reason} disabled={busy} onChange={(e) => setReason(e.target.value)}>
          {REPORT_REASONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        <label className="muted">Details (optional)</label>
        <textarea
          placeholder="anything that would help a moderator…"
          rows={2}
          disabled={busy}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
        />
        {err && <div className="error">{err}</div>}
        <div className="row">
          <span className="spacer" />
          <button className="primary" disabled={busy} onClick={submit}>{busy ? "Submitting…" : "Submit report"}</button>
        </div>
      </div>
    </details>
  );
}

export default function EntityView({
  entityId,
  onBack,
  backLabel = "← back",
}: {
  entityId: string;
  onBack: () => void;
  backLabel?: string;
}) {
  return (
    <EntityProvider entityId={entityId}>
      <Inner onBack={onBack} entityId={entityId} backLabel={backLabel} />
    </EntityProvider>
  );
}

function Inner({ entityId, onBack, backLabel }: { entityId: string; onBack: () => void; backLabel: string }) {
  const { entity, updateEntity } = useEntity() as any;
  const { user } = useUser() as any;
  const [editing, setEditing] = useState(false);
  const isOwner = !!(entity && user && entity.userId === user.id);

  return (
    <div className="col">
      <button onClick={onBack}>{backLabel}</button>
      <div className="panel col">
        {editing ? (
          <EntityEditor
            entity={entity}
            onCancel={() => setEditing(false)}
            onSave={async (update) => { await updateEntity({ update }); setEditing(false); }}
          />
        ) : (
          <>
            <div className="row">
              <h3 style={{ margin: 0 }}>{entity?.title || "(untitled)"}</h3>
              <span className="spacer" />
              {isOwner && <button onClick={() => setEditing(true)}>✏️ Edit</button>}
            </div>
            {/* preserve newlines/whitespace and wrap long unbroken strings so the full body shows */}
            <div className="prewrap">{entity?.content}</div>
            <EntityImages files={entity?.files} />
            {entity && <Reactions entityId={entityId} entity={entity} />}
          </>
        )}
      </div>
      {entity && <Comments entityId={entityId} />}
    </div>
  );
}

// Inline editor for an existing entity's title + content (→ PATCH /entities/:id via useEntity().updateEntity).
function EntityEditor({
  entity,
  onSave,
  onCancel,
}: {
  entity: any;
  onSave: (update: { title: string | null; content: string | null }) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState<string>(entity?.title ?? "");
  const [content, setContent] = useState<string>(entity?.content ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSave({ title: title.trim() || null, content: content.trim() || null });
    } catch (e: any) {
      setError(e?.message || "Failed to save changes");
      setBusy(false);
    }
  };

  return (
    <div className="col">
      <strong>Edit entity</strong>
      <input placeholder="title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea placeholder="content" rows={6} value={content} onChange={(e) => setContent(e.target.value)} />
      {error && <div className="error">{error}</div>}
      <div className="row">
        <button onClick={onCancel} disabled={busy}>Cancel</button>
        <span className="spacer" />
        <button className="primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
      </div>
    </div>
  );
}

// Pick a renderable URL from an uploaded file record (medium variant → original).
export function fileImageSrc(file: any): string | null {
  if (!file || file.type !== "image") return null;
  const v = file.image?.variants ?? {};
  return v.medium?.publicPath || v.small?.publicPath || v.thumbnail?.publicPath || file.originalPath || null;
}

function EntityImages({ files }: { files?: any[] }) {
  const imgs = (files ?? []).map(fileImageSrc).filter(Boolean) as string[];
  if (imgs.length === 0) return null;
  return (
    <div className="row" style={{ flexWrap: "wrap" }}>
      {imgs.map((src, i) => (
        <img
          key={i}
          src={src}
          alt=""
          style={{ maxWidth: "100%", maxHeight: 360, borderRadius: 10, border: "1px solid var(--border)" }}
        />
      ))}
    </div>
  );
}

function Reactions({ entityId, entity }: { entityId: string; entity: any }) {
  const { currentReaction, reactionCounts, toggleReaction, loading } = useReactionToggle({
    targetType: "entity",
    targetId: entityId,
    initialReaction: entity.userReaction ?? null,
    initialReactionCounts: entity.reactionCounts,
  }) as any;
  return (
    <div className="row">
      <button
        className={currentReaction === "upvote" ? "primary" : ""}
        disabled={loading}
        onClick={() => toggleReaction({ reactionType: "upvote" })}
      >
        ⬆ Upvote ({reactionCounts?.upvote ?? 0})
      </button>
      <button
        className={currentReaction === "downvote" ? "primary" : ""}
        disabled={loading}
        onClick={() => toggleReaction({ reactionType: "downvote" })}
      >
        ⬇ Downvote ({reactionCounts?.downvote ?? 0})
      </button>
      <span className="muted">your reaction: {currentReaction ?? "none"}</span>
      <span className="spacer" />
      <ReportButton targetType="entity" targetId={entityId} ownerId={entity.userId} />
    </div>
  );
}

// A single comment with its own upvote toggle (→ POST/DELETE /comments/:id/reactions).
function CommentRow({ comment }: { comment: any }) {
  const isReal = /^[0-9a-f-]{36}$/i.test(comment.id); // optimistic temp comments have a short id
  const { currentReaction, reactionCounts, toggleReaction, loading } = useReactionToggle({
    targetType: "comment",
    targetId: comment.id,
    initialReaction: comment.userReaction ?? null,
    initialReactionCounts: comment.reactionCounts,
  }) as any;
  return (
    <div className="msg">
      <div className="prewrap">{comment.content}</div>
      <div className="row" style={{ marginTop: 4 }}>
        <button
          className={currentReaction === "upvote" ? "primary" : ""}
          disabled={loading || !isReal}
          onClick={() => toggleReaction({ reactionType: "upvote" })}
          style={{ padding: "2px 8px", fontSize: 12 }}
        >
          ⬆ {reactionCounts?.upvote ?? 0}
        </button>
        <button
          className={currentReaction === "downvote" ? "primary" : ""}
          disabled={loading || !isReal}
          onClick={() => toggleReaction({ reactionType: "downvote" })}
          style={{ padding: "2px 8px", fontSize: 12 }}
        >
          ⬇ {reactionCounts?.downvote ?? 0}
        </button>
        <span className="muted">{new Date(comment.createdAt).toLocaleString()}</span>
        <span className="spacer" />
        <ReportButton targetType="comment" targetId={comment.id} ownerId={comment.userId} disabled={!isReal} />
      </div>
    </div>
  );
}

function Comments({ entityId }: { entityId: string }) {
  const cs = useCommentSectionData({ entityId, limit: 20 } as any) as any;
  const { comments, newComments, loading, createComment, loadMore, hasMore } = cs;
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const post = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try { await createComment({ content: text }); setText(""); } finally { setBusy(false); }
  };

  // The SDK keeps optimistically-added comments (the ones you just posted) in a separate
  // `newComments` array until the next refetch folds them into `comments`. Render both, with
  // the freshly-posted ones on top, so a new comment shows immediately.
  const all = [...((newComments as any[]) ?? []), ...((comments as any[]) ?? [])];

  return (
    <div className="panel col">
      <strong>Comments {loading ? "…" : `(${all.length})`}</strong>
      <div className="col">
        <textarea
          placeholder="add a comment"
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") post(); }}
        />
        <div className="row">
          <span className="muted">⌘/Ctrl + Enter to post</span>
          <span className="spacer" />
          <button className="primary" disabled={busy} onClick={post}>Post</button>
        </div>
      </div>
      <div className="scroll col">
        {all.map((c: any) => (
          <CommentRow key={c.id} comment={c} />
        ))}
      </div>
      {hasMore && <button onClick={() => loadMore()}>Load more</button>}
    </div>
  );
}
