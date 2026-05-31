import { useEffect, useRef, useState } from "react";
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
  highlightCommentId,
}: {
  entityId: string;
  onBack: () => void;
  backLabel?: string;
  highlightCommentId?: string;
}) {
  return (
    <EntityProvider entityId={entityId}>
      <Inner onBack={onBack} entityId={entityId} backLabel={backLabel} highlightCommentId={highlightCommentId} />
    </EntityProvider>
  );
}

function Inner({ entityId, onBack, backLabel, highlightCommentId }: { entityId: string; onBack: () => void; backLabel: string; highlightCommentId?: string }) {
  const { entity, updateEntity } = useEntity() as any;
  const { user } = useUser() as any;
  const [editing, setEditing] = useState(false);
  const isOwner = !!(entity && user && entity.userId === user.id);

  // Fail closed on read. The server is the real gate (it 403s entities in members-only spaces for
  // non-members), and this mirrors it client-side: never render an entity's body, reactions, or
  // comment box until we've confirmed it loaded. The SDK leaves `entity` undefined while loading
  // AND when the fetch is rejected (a 403 is only logged — it never flips to null), so we can't
  // tell "loading" from "denied" by value alone. Use a grace window: still-undefined after it
  // elapses ⇒ treat as unavailable rather than spinning forever or flashing an empty "(untitled)".
  const [graceElapsed, setGraceElapsed] = useState(false);
  useEffect(() => {
    setGraceElapsed(false);
    const t = setTimeout(() => setGraceElapsed(true), 5000);
    return () => clearTimeout(t);
  }, [entityId]);

  const unavailable = entity === null || (entity === undefined && graceElapsed);
  if (unavailable) {
    return (
      <div className="col">
        <button onClick={onBack}>{backLabel}</button>
        <div className="panel muted">
          🔒 This content isn’t available. It may have been removed, or it lives in a members-only
          space you don’t have access to.
        </div>
      </div>
    );
  }
  if (!entity) {
    return (
      <div className="col">
        <button onClick={onBack}>{backLabel}</button>
        <div className="panel muted">Loading…</div>
      </div>
    );
  }

  const removed = isModeratedOut(entity);
  return (
    <div className="col">
      <button onClick={onBack}>{backLabel}</button>
      {removed && (
        <div className="error col" style={{ gap: 4 }}>
          <div>
            🚫 This entity was removed by moderation
            {entity.moderatedAt ? ` on ${new Date(entity.moderatedAt).toLocaleString()}` : ""}. You can
            see it because you have operator access; other users cannot.
          </div>
          {entity.moderationReason && (
            <div className="prewrap">📝 Reason: {entity.moderationReason}</div>
          )}
        </div>
      )}
      <div className={"panel col" + (removed ? " redacted" : "")}>
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
              <ModerationPill entity={entity} />
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
      {entity && <Comments entityId={entityId} highlightCommentId={highlightCommentId} />}
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

// An entity is "removed" once a moderator takes it down. The server hides removed entities from
// everyone EXCEPT operators (god-view), so when we render one it's because the viewer is privileged —
// flag it as redacted rather than passing it off as live content.
export function isModeratedOut(entity: any): boolean {
  return entity?.moderationStatus === "removed";
}

// A moderator reviewed a report and chose to KEEP the content (moderationStatus "approved"). Unlike
// "removed", kept content stays live for everyone — we just badge the resolved decision.
export function isModeratedKept(entity: any): boolean {
  return entity?.moderationStatus === "approved";
}

// A moderation-status pill for an entity or comment, with the moderator timestamp/reason in its
// tooltip: 🚫 red for removed (redacted, operator-only), ✅ green for reviewed-and-kept. Renders
// nothing for un-moderated content, so it's safe to drop into any card/comment pill row.
export function ModerationPill({ entity }: { entity: any }) {
  const removed = isModeratedOut(entity);
  const kept = isModeratedKept(entity);
  if (!removed && !kept) return null;
  const when = entity.moderatedAt ? new Date(entity.moderatedAt).toLocaleString() : null;
  const verb = removed ? "Removed by moderation" : "Reviewed and kept";
  const title = [verb, when && `· ${when}`, entity.moderationReason && `— ${entity.moderationReason}`]
    .filter(Boolean).join(" ");
  return removed
    ? <span className="pill danger" title={title}>🚫 removed</span>
    : <span className="pill success" title={title}>✅ kept</span>;
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
  const [err, setErr] = useState<string | null>(null);
  // The server gates reactions behind read access; if it rejects (e.g. access changed under us),
  // surface it instead of letting the optimistic toggle silently desync.
  const react = async (reactionType: string) => {
    setErr(null);
    try { await toggleReaction({ reactionType }); }
    catch (e: any) { setErr(e?.response?.data?.error || "Couldn't save your reaction."); }
  };
  return (
    <div className="row">
      <button className={currentReaction === "upvote" ? "primary" : ""} disabled={loading} onClick={() => react("upvote")}>
        ⬆ Upvote ({reactionCounts?.upvote ?? 0})
      </button>
      <button className={currentReaction === "downvote" ? "primary" : ""} disabled={loading} onClick={() => react("downvote")}>
        ⬇ Downvote ({reactionCounts?.downvote ?? 0})
      </button>
      <span className="muted">your reaction: {currentReaction ?? "none"}</span>
      {err && <span className="error">{err}</span>}
      <span className="spacer" />
      <ReportButton targetType="entity" targetId={entityId} ownerId={entity.userId} />
    </div>
  );
}

// A single comment with its own upvote toggle (→ POST/DELETE /comments/:id/reactions).
function CommentRow({ comment, highlighted }: { comment: any; highlighted?: boolean }) {
  const isReal = /^[0-9a-f-]{36}$/i.test(comment.id); // optimistic temp comments have a short id
  const { currentReaction, reactionCounts, toggleReaction, loading } = useReactionToggle({
    targetType: "comment",
    targetId: comment.id,
    initialReaction: comment.userReaction ?? null,
    initialReactionCounts: comment.reactionCounts,
  }) as any;
  // Scroll a deep-linked comment into view once it's mounted (admin "view in demo" flow).
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (highlighted) ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlighted]);
  // Same moderation contract as entities: a "removed" comment is hidden from everyone but
  // operators, so when one renders here it's operator god-view — flag it as redacted.
  const removed = isModeratedOut(comment);
  return (
    <div ref={ref} className={"msg" + (removed ? " redacted" : "") + (highlighted ? " highlight" : "")}>
      <div className="prewrap">{comment.content}</div>
      <div className="row" style={{ marginTop: 4 }}>
        <ModerationPill entity={comment} />
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

function Comments({ entityId, highlightCommentId }: { entityId: string; highlightCommentId?: string }) {
  const cs = useCommentSectionData({ entityId, limit: 20 } as any) as any;
  const { comments, newComments, loading, createComment, loadMore, hasMore } = cs;
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const post = async () => {
    if (!text.trim()) return;
    setBusy(true);
    setErr(null);
    // The server requires read access to comment (assertCanReadEntity); show its rejection rather
    // than dropping the comment silently.
    try { await createComment({ content: text }); setText(""); }
    catch (e: any) { setErr(e?.response?.data?.error || "Couldn't post your comment — you may not have access."); }
    finally { setBusy(false); }
  };

  // The SDK keeps optimistically-added comments (the ones you just posted) in a separate
  // `newComments` array until the next refetch folds them into `comments`. Render both, with
  // the freshly-posted ones on top, so a new comment shows immediately.
  const all = [...((newComments as any[]) ?? []), ...((comments as any[]) ?? [])];

  // A deep-linked comment may sit beyond the first page; tell the moderator to page in if so.
  const highlightLoaded = !highlightCommentId || all.some((c: any) => c.id === highlightCommentId);

  return (
    <div className="panel col">
      <strong>Comments {loading ? "…" : `(${all.length})`}</strong>
      {!loading && !highlightLoaded && (
        <div className="muted">
          🔗 The linked comment isn’t on this page yet — keep loading more to reach it.
        </div>
      )}
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
          {err && <span className="error">{err}</span>}
          <span className="spacer" />
          <button className="primary" disabled={busy} onClick={post}>Post</button>
        </div>
      </div>
      <div className="scroll col">
        {all.map((c: any) => (
          <CommentRow key={c.id} comment={c} highlighted={!!highlightCommentId && c.id === highlightCommentId} />
        ))}
      </div>
      {hasMore && <button onClick={() => loadMore()}>Load more</button>}
    </div>
  );
}
