import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { track, trackPageView, PATHS } from "./analytics";
import { useProfileViewer } from "./ProfileViewerContext";
import { useModerationRefresh } from "./useModerationRefresh";
import {
  EntityProvider, useEntity, useUser, useAuth,
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
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>("spam");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const PANEL_W = 280;
  const PANEL_H = 260; // approx, only used to decide whether to flip the panel upward

  // Position the portal panel in viewport coords, anchored to the flag: right-aligned and below it,
  // flipped above when there isn't room below, clamped to stay on-screen.
  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const left = Math.max(8, Math.min(r.right - PANEL_W, window.innerWidth - PANEL_W - 8));
    const roomBelow = window.innerHeight - r.bottom;
    const top = roomBelow > PANEL_H + 8 ? r.bottom + 4 : Math.max(8, r.top - PANEL_H - 4);
    setPos({ left, top });
  };

  // While open, keep the panel glued to the flag across scrolls (capture catches inner scroll
  // containers too) and resizes; Escape closes. Rendered in a portal so the comments' overflow box
  // can't clip it — the bug this replaces: a short comments area cut off the bottom of the dialog.
  useEffect(() => {
    if (!open) return;
    place();
    const on = () => place();
    window.addEventListener("scroll", on, true);
    window.addEventListener("resize", on);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", on, true);
      window.removeEventListener("resize", on);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (disabled) return null;
  if (user && ownerId && user.id === ownerId) return null;
  if (done) return <span className="muted" style={{ fontSize: 12 }}>✓ Reported</span>;

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      await createReport({ targetId, reason, details: details.trim() || undefined });
      track("submit_report", { reason, target: targetType });
      setDone(true); setOpen(false);
      setReason("spam"); setDetails("");
    } catch (e: any) {
      setErr(e?.response?.data?.error || e?.message || "Couldn't submit report");
    } finally { setBusy(false); }
  };

  return (
    <>
      <button
        ref={btnRef}
        title={`Report this ${targetType}`}
        onClick={() => setOpen((o) => !o)}
        style={{ fontSize: 12, color: "var(--muted)", padding: "2px 6px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--panel)" }}
      >🚩</button>
      {open && pos && createPortal(
        <>
          {/* click-away backdrop */}
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 1000 }} />
          <div
            className="col"
            style={{
              position: "fixed", left: pos.left, top: pos.top, zIndex: 1001,
              gap: 4, padding: 8, border: "1px solid var(--border)", borderRadius: 8,
              width: `min(${PANEL_W}px, calc(100vw - 16px))`,
              background: "var(--panel)", boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
            }}
          >
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
        </>,
        document.body
      )}
    </>
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
  // include:["user"] loads the entity author so the detail title shows who posted it. Cast to any:
  // the published @agora-sdk types still lag the local fork that adds `include` to EntityProvider
  // (see docs/CR-2026-05-31-entityprovider-include.md). The fork supplies the runtime via the vite
  // alias; drop the cast once the package is republished with the include support and reinstalled.
  // One /entity page view per detail open — covers every entry point (feed, search, space, deep
  // link), since they all render this component.
  useEffect(() => { trackPageView(PATHS.entity); }, []);
  const providerProps = { entityId, include: ["user"] } as any;
  return (
    <EntityProvider {...providerProps}>
      <Inner onBack={onBack} entityId={entityId} backLabel={backLabel} highlightCommentId={highlightCommentId} />
    </EntityProvider>
  );
}

function Inner({ entityId, onBack, backLabel, highlightCommentId }: { entityId: string; onBack: () => void; backLabel: string; highlightCommentId?: string }) {
  const { entity, updateEntity, deleteEntity } = useEntity() as any;
  const { user } = useUser() as any;
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isOwner = !!(entity && user && entity.userId === user.id);

  // Force a fresh server pull of the comment section ~5s after a comment is posted, so async
  // moderation/censorship is reflected (useCommentSectionData exposes no refetch, so we remount it
  // by bumping its key — same keyed-remount pattern used for ConversationProvider / ProfileViewer).
  const [commentsKey, setCommentsKey] = useState(0);
  const scheduleModerationRefresh = useModerationRefresh();

  // Owner deletes their own post (→ DELETE /entities/:id via useEntity().deleteEntity). Confirm
  // first (irreversible), then leave the now-gone entity via onBack. The server still authorizes,
  // so a rejection (e.g. access changed) surfaces instead of silently failing.
  const removeEntity = async () => {
    if (!window.confirm("Delete this post? This can’t be undone.")) return;
    setDeleting(true);
    try {
      await deleteEntity();
      track("delete_entity");
      onBack();
    } catch (e: any) {
      alert(e?.response?.data?.error || "Couldn’t delete this post.");
      setDeleting(false);
    }
  };

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
            onSave={async (update) => { await updateEntity({ update }); track("edit_entity"); setEditing(false); }}
          />
        ) : (
          <>
            <div className="row">
              <h3 style={{ margin: 0 }}>{entity?.title || "(untitled)"}</h3>
              <ModerationPill entity={entity} />
              {/* Renders once the SDK supports include=user on EntityProvider (see the CR). */}
              <AuthorTag user={entity?.user} />
              <span className="spacer" />
              {isOwner && (
                <>
                  <button onClick={() => setEditing(true)} disabled={deleting}>✏️ Edit</button>
                  <button className="danger" onClick={removeEntity} disabled={deleting}>
                    {deleting ? "Deleting…" : "🗑️ Delete"}
                  </button>
                </>
              )}
            </div>
            {/* preserve newlines/whitespace and wrap long unbroken strings so the full body shows */}
            <div className="prewrap">{entity?.content}</div>
            <EntityImages files={entity?.files} />
            {entity && <Reactions entityId={entityId} entity={entity} />}
          </>
        )}
      </div>
      {entity && (
        <Comments
          key={commentsKey}
          entityId={entityId}
          highlightCommentId={highlightCommentId}
          onPosted={() => scheduleModerationRefresh(() => setCommentsKey((k) => k + 1))}
        />
      )}
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

// Small author chip: avatar (when present) + @username / name. The `user` object only rides along
// when the request asked for include=user — the feed list and comment section do, so it renders
// there. The single-entity detail view won't have it until the SDK threads include through
// EntityProvider (see docs/CR-2026-05-31-entityprovider-include.md); this renders nothing until then.
export function AuthorTag({ user, prefix = "by " }: { user?: any; prefix?: string }) {
  const { openProfile } = useProfileViewer();
  if (!user) return null;
  const name = user.username ? "@" + user.username : (user.name || user.id?.slice(0, 8) || "someone");
  // Clickable when we know the user's id → opens their public profile overlay. stopPropagation so
  // clicking the author inside a feed card / comment doesn't also trigger the card's own onClick
  // (which would open the entity instead).
  const clickable = !!user.id;
  return (
    <span
      className="row muted"
      style={{ gap: 4, fontSize: 12, cursor: clickable ? "pointer" : undefined }}
      onClick={clickable ? (e) => { e.stopPropagation(); openProfile(user.id); } : undefined}
      title={clickable ? "View profile" : undefined}
    >
      {prefix}
      {user.avatar ? (
        <img src={user.avatar} alt="" style={{ width: 16, height: 16, borderRadius: "50%", objectFit: "cover" }} />
      ) : null}
      <span className={clickable ? "linklike" : undefined} style={clickable ? { padding: 0, fontSize: 12 } : undefined}>{name}</span>
    </span>
  );
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

// Reddit-style soft delete: deleting a comment doesn't drop it from the tree (so any replies
// survive) — the SDK/server keep the row and blank it, setting userDeletedAt (and deletedAt after a
// server refetch) while nulling content/userId. So a "still there but empty" row = successfully
// deleted; render it as a tombstone, not a live comment.
export function isDeletedComment(comment: any): boolean {
  return !!(comment?.userDeletedAt || comment?.deletedAt);
}

// "Operator" here is the *deployment-operator* god-view, NOT the user's profile role. The server
// stamps a boolean `operator` claim into the access JWT (from the OPERATOR_USER_IDS/OPERATOR_EMAILS
// allowlist) — independent of the "admin"/"moderator"/"visitor" UserRole. We read it back by
// decoding the token client-side. Display-only gate; the server is the real enforcement (it already
// hides removed content from non-operators), so an unverified decode is fine here.
export function isOperatorToken(accessToken: string | null | undefined): boolean {
  if (!accessToken) return false;
  try {
    let b64 = accessToken.split(".")[1];
    if (!b64) return false;
    b64 = b64.replace(/-/g, "+").replace(/_/g, "/");
    b64 += "=".repeat((4 - (b64.length % 4)) % 4); // restore base64url padding
    return JSON.parse(atob(b64)).operator === true;
  } catch {
    return false;
  }
}

// A moderation-status pill for an entity or comment, with the moderator timestamp/reason in its
// tooltip: 🚫 red for removed (redacted), ✅ green for reviewed-and-kept. Renders nothing for
// un-moderated content — AND nothing for non-operators. "removed" content already only reaches
// operators (the server hides it from everyone else), but "kept"/"approved" stays live for all
// viewers with the field attached (shape.ts sends moderationStatus to every reader), so without
// this gate a plain visitor would see "✅ kept". Gate on the JWT operator claim, not user.role.
export function ModerationPill({ entity }: { entity: any }) {
  const { accessToken } = useAuth() as any;
  const removed = isModeratedOut(entity);
  const kept = isModeratedKept(entity);
  if (!removed && !kept) return null;
  if (!isOperatorToken(accessToken)) return null;
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
    // Toggling the reaction you already hold clears it; otherwise it's an add (or a switch).
    const action = currentReaction === reactionType ? "remove_reaction" : "add_reaction";
    try { await toggleReaction({ reactionType }); track(action, { type: reactionType, target: "entity" }); }
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

// A single comment with its own upvote toggle (→ POST/DELETE /comments/:id/reactions), plus inline
// edit + delete for the comment's author (→ PATCH/DELETE /comments/:id via the comment section's
// updateComment/deleteComment, which keep the local tree in sync).
function CommentRow({
  comment, highlighted, currentUserId, onUpdate, onDelete,
}: {
  comment: any;
  highlighted?: boolean;
  currentUserId?: string;
  onUpdate: (p: { commentId: string; content: string }) => Promise<void>;
  onDelete: (p: { commentId: string }) => Promise<void>;
}) {
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
  // Edit/delete are author-only, and only for real (server-persisted) comments.
  const isOwner = !!(currentUserId && comment.userId === currentUserId);
  const canManage = isOwner && isReal;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(comment.content ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!draft.trim()) return;
    setBusy(true); setErr(null);
    try { await onUpdate({ commentId: comment.id, content: draft.trim() }); track("edit_comment"); setEditing(false); }
    catch (e: any) { setErr(e?.response?.data?.error || "Couldn’t save your edit."); }
    finally { setBusy(false); }
  };
  const del = async () => {
    if (!window.confirm("Delete this comment? This can’t be undone.")) return;
    setBusy(true); setErr(null);
    // On success the SDK marks it deleted in place (Reddit-style) and the row re-renders as the
    // tombstone below; only reset busy on error.
    try { await onDelete({ commentId: comment.id }); track("delete_comment"); }
    catch (e: any) { setErr(e?.response?.data?.error || "Couldn’t delete your comment."); setBusy(false); }
  };
  // Same add-vs-remove derivation as entity reactions; the hook owns the optimistic UI so we just
  // record the outcome (swallow errors as before).
  const reactComment = async (reactionType: string) => {
    const action = currentReaction === reactionType ? "remove_reaction" : "add_reaction";
    try { await toggleReaction({ reactionType }); track(action, { type: reactionType, target: "comment" }); }
    catch { /* optimistic toggle reverts itself */ }
  };

  // A soft-deleted comment is kept in the tree but blanked — show a tombstone instead of empty
  // content + live reaction/report controls. (All hooks above already ran, so the early return is
  // safe.)
  if (isDeletedComment(comment)) {
    return (
      <div ref={ref} className={"msg" + (highlighted ? " highlight" : "")}>
        <span className="muted">🗑️ comment deleted</span>
      </div>
    );
  }

  return (
    <div ref={ref} className={"msg" + (removed ? " redacted" : "") + (highlighted ? " highlight" : "")}>
      {editing ? (
        <div className="col" style={{ gap: 4 }}>
          <textarea
            rows={3}
            value={draft}
            disabled={busy}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") save(); }}
          />
          {err && <div className="error">{err}</div>}
          <div className="row">
            <button onClick={() => { setEditing(false); setDraft(comment.content ?? ""); setErr(null); }} disabled={busy}>Cancel</button>
            <span className="spacer" />
            <button className="primary" onClick={save} disabled={busy || !draft.trim()}>{busy ? "Saving…" : "Save"}</button>
          </div>
        </div>
      ) : (
        <>
          {comment.user && <AuthorTag user={comment.user} prefix="" />}
          <div className="prewrap">{comment.content}</div>
        </>
      )}
      <div className="row" style={{ marginTop: 4 }}>
        <ModerationPill entity={comment} />
        <button
          className={currentReaction === "upvote" ? "primary" : ""}
          disabled={loading || !isReal}
          onClick={() => reactComment("upvote")}
          style={{ padding: "2px 8px", fontSize: 12 }}
        >
          ⬆ {reactionCounts?.upvote ?? 0}
        </button>
        <button
          className={currentReaction === "downvote" ? "primary" : ""}
          disabled={loading || !isReal}
          onClick={() => reactComment("downvote")}
          style={{ padding: "2px 8px", fontSize: 12 }}
        >
          ⬇ {reactionCounts?.downvote ?? 0}
        </button>
        <span className="muted">{new Date(comment.createdAt).toLocaleString()}</span>
        <span className="spacer" />
        {canManage && !editing && (
          <>
            <button className="linklike" onClick={() => { setDraft(comment.content ?? ""); setErr(null); setEditing(true); }}>✏️ edit</button>
            <button className="linklike" onClick={del} disabled={busy}>🗑️ delete</button>
          </>
        )}
        {!isOwner && (
          <ReportButton targetType="comment" targetId={comment.id} ownerId={comment.userId} disabled={!isReal} />
        )}
      </div>
      {/* surface a delete error that happens with the editor closed */}
      {!editing && err && <div className="error" style={{ marginTop: 4 }}>{err}</div>}
    </div>
  );
}

function Comments({ entityId, highlightCommentId, onPosted }: { entityId: string; highlightCommentId?: string; onPosted?: () => void }) {
  const cs = useCommentSectionData({ entityId, limit: 20 } as any) as any;
  const { comments, newComments, loading, createComment, updateComment, deleteComment, loadMore, hasMore } = cs;
  const { user } = useUser() as any;
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const post = async () => {
    if (!text.trim()) return;
    setBusy(true);
    setErr(null);
    // The server requires read access to comment (assertCanReadEntity); show its rejection rather
    // than dropping the comment silently.
    try { await createComment({ content: text }); track("post_comment"); setText(""); onPosted?.(); }
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
          <CommentRow
            key={c.id}
            comment={c}
            highlighted={!!highlightCommentId && c.id === highlightCommentId}
            currentUserId={user?.id}
            onUpdate={updateComment}
            onDelete={deleteComment}
          />
        ))}
      </div>
      {hasMore && <button onClick={() => loadMore()}>Load more</button>}
    </div>
  );
}
