import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { track, trackPageView, PATHS } from "./analytics";
import { useProfileViewer } from "./ProfileViewerContext";
import { useModerationRefresh } from "./useModerationRefresh";
import {
  EntityProvider, useEntity, useUser, useAuth,
  useReactionToggle, useFetchEntityReactionsWrapper,
  CommentSectionProvider, useCommentSection, useFetchManyComments, useCreateReport,
} from "@agora-sdk/react-js";
import { REACTIONS, reactionEmoji } from "./reactions";
import { reportAndRemove } from "./operatorModeration";
import MarkdownBody from "./MarkdownBody";
import Composer from "./Composer";

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
  targetType, targetId, ownerId, disabled, onRemoved,
}: {
  targetType: "entity" | "comment";
  targetId: string;
  ownerId?: string;
  disabled?: boolean;
  onRemoved?: () => void;
}) {
  const { user } = useUser() as any;
  const { accessToken } = useAuth() as any;
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

  // Operator-only shortcut: file THIS report as filled in, then remove the content in one go
  // (reportAndRemove → the admin's project-level report-resolve). Preserved in moderation history.
  // No confirm: the operator already filled the panel and clicked a labelled danger button.
  const removeNow = async () => {
    setBusy(true); setErr(null);
    try {
      await reportAndRemove({ targetType, targetId, reason, details, accessToken });
      track("moderate_remove", { target: targetType });
      setDone(true); setOpen(false);
      setReason("spam"); setDetails("");
      onRemoved?.();
    } catch (e: any) {
      setErr(e?.response?.data?.error || e?.message || "Couldn't remove this content");
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
              {isOperatorToken(accessToken) && (
                <button
                  className="danger"
                  disabled={busy}
                  onClick={removeNow}
                  title="Files this report, then removes the content — kept in moderation history"
                >{busy ? "Working…" : "🚫 Remove"}</button>
              )}
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
  highlightEntity,
}: {
  entityId: string;
  onBack: () => void;
  backLabel?: string;
  highlightCommentId?: string;
  highlightEntity?: boolean;
}) {
  // include:["user"] loads the entity author so the detail title shows who posted it. Cast to any:
  // the published @agora-sdk types still lag the local fork that adds `include` to EntityProvider
  // (see docs/CR-2026-05-31-entityprovider-include.md). The fork supplies the runtime via the vite
  // alias; drop the cast once the package is republished with the include support and reinstalled.
  // One /entity page view per detail open — covers every entry point (feed, search, space, deep
  // link), since they all render this component.
  useEffect(() => { trackPageView(PATHS.entity); }, []);
  const providerProps = { entityId, include: ["user"] } as any;
  // After an operator removes the entity/a comment, remount the provider so it re-pulls the entity
  // and comment section from the server — operators still receive removed content, so the existing
  // tombstone branches render it. This callback lives ABOVE the provider, so it survives the remount.
  const [refreshKey, setRefreshKey] = useState(0);
  const onRemoved = () => setRefreshKey((k) => k + 1);
  return (
    <EntityProvider key={refreshKey} {...providerProps}>
      <Inner onBack={onBack} entityId={entityId} backLabel={backLabel} highlightCommentId={highlightCommentId} highlightEntity={highlightEntity} onRemoved={onRemoved} />
    </EntityProvider>
  );
}

function Inner({ entityId, onBack, backLabel, highlightCommentId, highlightEntity, onRemoved }: { entityId: string; onBack: () => void; backLabel: string; highlightCommentId?: string; highlightEntity?: boolean; onRemoved?: () => void }) {
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

  // Entity-level notifications (upvote/reaction/mention on the post itself) deep-link here with
  // highlightEntity set: scroll the post into view and flash it (the comment case is handled by
  // CommentRow's own highlight). Fire once the entity has loaded.
  const entityRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (highlightEntity && entity) entityRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightEntity, entity?.id]);

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
      <div ref={entityRef} className={"panel col" + (removed ? " redacted" : "") + (highlightEntity ? " highlight" : "")}>
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
              <PublicPill entity={entity} />
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
            {/* Markdown-authored body → sanitized HTML (see markdown.ts). `breaks: true` preserves
                single newlines, so this keeps the old prewrap behaviour. */}
            <MarkdownBody content={entity?.content} mentions={entity?.mentions} />
            <EntityImages files={entity?.files} />
            {entity && <Reactions entityId={entityId} entity={entity} onRemoved={onRemoved} />}
          </>
        )}
      </div>
      {entity && (
        <Comments
          key={commentsKey}
          entityId={entityId}
          highlightCommentId={highlightCommentId}
          onPosted={() => scheduleModerationRefresh(() => setCommentsKey((k) => k + 1))}
          onRemoved={onRemoved}
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

  return (
    <div className="col">
      <strong>Edit entity</strong>
      <input placeholder="title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
      <Composer
        onSubmit={async ({ content }) => {
          await onSave({ title: title.trim() || null, content: content.trim() || null });
        }}
        initialValue={entity?.content ?? ""}
        placeholder="content"
        submitLabel="Save"
        rows={6}
        analyticsTarget="entity"
        onCancel={onCancel}
      />
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

// Internet-visibility pill (Agora extension). `entity.public` is shaped onto every entity response
// (server `shape.ts`: `public: row.isPublic ?? false`) — no `include` needed — but the published
// @agora-sdk `Entity` type doesn't declare it yet, hence the `any` entity like everywhere else here.
//
// `true` means the post is readable anonymously off the auth wall via `GET /public/entities/:id`.
// Renders nothing when false (the default), so a normal post's display is unchanged.
//
// Caveat worth knowing when reading this pill: the server's real gate re-derives
// `entity.public AND space-is-public` live, and only `public: true` is ladder-validated on write —
// un-publishing is never blocked. So an entity can keep a stale `public: true` after its space went
// members-only, in which case /public/* 404s it despite this pill. Distinguishing that needs
// `include: ["space"]` on the fetches to check `readingPermission`; not worth it for a flag display.
export function PublicPill({ entity }: { entity: any }) {
  if (entity?.public !== true) return null;
  return (
    <span className="pill" title="Internet-public — readable anonymously, without an account, via the /public API">
      🌐 Public
    </span>
  );
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

function Reactions({ entityId, entity, onRemoved }: { entityId: string; entity: any; onRemoved?: () => void }) {
  const { currentReaction, reactionCounts, toggleReaction, loading } = useReactionToggle({
    targetType: "entity",
    targetId: entityId,
    initialReaction: entity.userReaction ?? null,
    initialReactionCounts: entity.reactionCounts,
  }) as any;
  const [err, setErr] = useState<string | null>(null);
  // null = collapsed; "all" or one reaction type = the who-reacted panel's active filter.
  const [whoFilter, setWhoFilter] = useState<string | null>(null);
  // The server gates reactions behind read access; if it rejects (e.g. access changed under us),
  // surface it instead of letting the optimistic toggle silently desync.
  const react = async (reactionType: string) => {
    setErr(null);
    // One reaction per user per target (radio semantics): toggling the one you hold clears it;
    // any other type is an add — or a *switch*, which silently clears the previous one.
    const action = currentReaction === reactionType ? "remove_reaction" : "add_reaction";
    try { await toggleReaction({ reactionType }); track(action, { type: reactionType, target: "entity" }); }
    catch (e: any) { setErr(e?.response?.data?.error || "Couldn't save your reaction."); }
  };
  const openWho = (filter: string | null) => {
    setWhoFilter(filter);
    if (filter) track("view_reactions", { type: filter, target: "entity" });
  };
  return (
    <div className="col" style={{ gap: 6 }}>
      <div className="row" style={{ flexWrap: "wrap" }}>
        {REACTIONS.map((r) => (
          <button
            key={r.type}
            className={currentReaction === r.type ? "primary" : ""}
            aria-pressed={currentReaction === r.type}
            title={r.label}
            disabled={loading}
            onClick={() => react(r.type)}
          >
            {r.emoji} {reactionCounts?.[r.type] ?? 0}
          </button>
        ))}
        <button className="linklike" onClick={() => openWho(whoFilter ? null : "all")}>
          {whoFilter ? "hide reactions" : "👀 who reacted"}
        </button>
        <span className="muted">your reaction: {currentReaction ?? "none"}</span>
        {err && <span className="error">{err}</span>}
        <span className="spacer" />
        <ReportButton targetType="entity" targetId={entityId} ownerId={entity.userId} onRemoved={onRemoved} />
      </div>
      {whoFilter && <ReactorsPanel entityId={entityId} filter={whoFilter} onFilter={openWho} />}
    </div>
  );
}

// Who reacted: inline expandable panel under the reaction row (→ GET /entities/:id/reactions,
// paginated, optional ?reactionType filter). Inline rather than a portal on purpose — it's scoped
// to this one entity and preserves thread scroll, like the comment tree (the profile overlay is a
// portal because it's app-wide). Reactor rows reuse AuthorTag, so each opens the profile overlay.
function ReactorsPanel({
  entityId, filter, onFilter,
}: { entityId: string; filter: string; onFilter: (f: string) => void }) {
  return (
    <div className="card">
      <div className="row" style={{ flexWrap: "wrap" }}>
        {["all", ...REACTIONS.map((r) => r.type)].map((t) => (
          <button key={t} className={filter === t ? "primary" : ""} title={t} onClick={() => onFilter(t)}>
            {t === "all" ? "all" : reactionEmoji(t)}
          </button>
        ))}
      </div>
      {/* Keyed by filter so the wrapper hook's page/list state resets cleanly on a filter switch. */}
      <ReactorsList key={filter} entityId={entityId} reactionType={filter === "all" ? undefined : filter} />
    </div>
  );
}

function ReactorsList({ entityId, reactionType }: { entityId: string; reactionType?: string }) {
  const { reactions, loading, hasMore, loadMore } = useFetchEntityReactionsWrapper({
    entityId, reactionType, limit: 20, autoFetch: true,
  } as any) as any;
  return (
    <div className="col" style={{ gap: 4, marginTop: 8 }}>
      {(reactions ?? []).map((r: any) => (
        <div key={r.id} className="row">
          <span>{reactionEmoji(r.reactionType)}</span>
          <AuthorTag user={r.user} />
          <span className="spacer" />
          <span className="muted">{r.createdAt ? new Date(r.createdAt).toLocaleString() : ""}</span>
        </div>
      ))}
      {loading && <div className="muted">Loading…</div>}
      {!loading && (reactions?.length ?? 0) === 0 && <div className="muted">No reactions yet.</div>}
      {hasMore && !loading && <button onClick={() => loadMore()}>Load more</button>}
    </div>
  );
}

// A single comment with its own upvote toggle (→ POST/DELETE /comments/:id/reactions), plus inline
// edit + delete for the comment's author (→ PATCH/DELETE /comments/:id via the comment section's
// updateComment/deleteComment, which keep the local tree in sync).
function CommentRow({
  comment, highlighted, currentUserId, onUpdate, onDelete, onRemoved, depth = 0, highlightCommentId,
}: {
  comment: any;
  highlighted?: boolean;
  currentUserId?: string;
  onUpdate: (p: { commentId: string; content: string }) => Promise<void>;
  onDelete: (p: { commentId: string }) => Promise<void>;
  onRemoved?: () => void;
  depth?: number;
  highlightCommentId?: string;
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
  // Nested replies: collapsed by default ("View N replies"), so a subthread is only fetched when
  // someone asks for it. Everything here comes from the shared CommentSectionContext rather than
  // being prop-drilled down every level of the tree.
  //
  // NOTE: this deliberately does NOT use the SDK's `useReplies`, which is the hook this surface is
  // "supposed" to use. That hook omits `entityId` from its request and the server rejects it with
  // `400 comments/missing-entity-id`, so it cannot fetch replies at all — see
  // ../agora-sdk/docs/BUG_REPORT.md #1. We drive `useFetchManyComments` directly instead (passing
  // entityId ourselves), mirroring what agora-www's CommentNode.tsx does for the same reason.
  // Swap back to `useReplies` once that lands; the surrounding UI shouldn't need to change.
  const { createComment, entity, entityCommentsTree, addCommentsToTree, sortBy } = useCommentSection() as any;
  const fetchManyComments = useFetchManyComments() as any;
  const [expanded, setExpanded] = useState(false);
  const [replying, setReplying] = useState(false);
  const [repliesPage, setRepliesPage] = useState(0);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [hasMoreReplies, setHasMoreReplies] = useState(false);
  const replyCount = comment.repliesCount ?? 0;
  // Indent each level, but stop compounding after a few so deep threads don't march off-screen.
  const indent = Math.min(depth, 4) * 16;

  // Replies live in the shared tree (the fetch below folds them in), not in local state — so an
  // optimistically-posted reply and a fetched one render through the same path. Oldest-first, which
  // is how a conversation reads.
  const repliesMap = entityCommentsTree?.[comment.id]?.replies ?? {};
  const replies = Object.values(repliesMap).sort(
    (a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  ) as any[];
  const hasReplies = replyCount > 0 || replies.length > 0;

  const loadReplies = async (reset = false) => {
    if (!entity?.id || loadingReplies) return;
    setLoadingReplies(true);
    try {
      const nextPage = reset ? 1 : repliesPage + 1;
      const res = await fetchManyComments({
        entityId: entity.id, // ← the param useReplies forgets
        parentId: comment.id,
        page: nextPage,
        sortBy: sortBy ?? "top",
        limit: 10,
        include: "user",
      });
      if (res?.data?.length) addCommentsToTree?.(res.data, false);
      setRepliesPage(nextPage);
      setHasMoreReplies(Boolean(res?.pagination?.hasMore));
    } catch { /* transient — the expander stays clickable */ }
    finally { setLoadingReplies(false); }
  };

  const expandReplies = () => {
    setExpanded(true);
    track("expand_replies");
    if (repliesPage === 0 && replies.length === 0) loadReplies(true);
  };

  const postReply = async ({ content, mentions, gif }: { content: string; mentions: any[]; gif?: any }) => {
    // parentId is what makes this a reply — the SDK folds the result into the tree under this
    // comment, so expand or it lands somewhere unseen.
    await createComment({ content: content || undefined, mentions, gif, parentId: comment.id });
    track("post_comment");
    setReplying(false);
    setExpanded(true);
    // Replying to a comment whose existing replies were never loaded would otherwise show only
    // your own — the optimistic insert makes replies.length non-zero, defeating the guard above.
    if (repliesPage === 0 && replyCount > 0) loadReplies(true);
  };

  // The replies subtree + its expander, shared by the tombstone and normal render paths below —
  // a soft-deleted comment keeps its children (Reddit-style), so they must stay reachable.
  const repliesBlock = hasReplies ? (
    <>
      {!expanded && (
        <button
          className="linklike"
          style={{ alignSelf: "flex-start", fontSize: 12 }}
          onClick={expandReplies}
        >
          ▶ View {replyCount || replies.length} {(replyCount || replies.length) === 1 ? "reply" : "replies"}
        </button>
      )}
      {expanded && (
        <div className="col" style={{ gap: 4 }}>
          <button
            className="linklike"
            style={{ alignSelf: "flex-start", fontSize: 12 }}
            onClick={() => setExpanded(false)}
          >
            ▼ Hide replies
          </button>
          {replies.map((r: any) => (
            <CommentRow
              key={r.id}
              comment={r}
              depth={depth + 1}
              highlighted={!!highlightCommentId && r.id === highlightCommentId}
              highlightCommentId={highlightCommentId}
              currentUserId={currentUserId}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onRemoved={onRemoved}
            />
          ))}
          {loadingReplies && <span className="muted" style={{ fontSize: 12 }}>Loading replies…</span>}
          {!loadingReplies && hasMoreReplies && (
            <button
              className="linklike"
              style={{ alignSelf: "flex-start", fontSize: 12 }}
              onClick={() => { loadReplies(); track("load_more_replies"); }}
            >
              Load more replies
            </button>
          )}
        </div>
      )}
    </>
  ) : null;

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
      <div className="col" style={{ gap: 4, marginLeft: indent, borderLeft: depth > 0 ? "2px solid var(--border)" : undefined, paddingLeft: depth > 0 ? 8 : undefined }}>
        <div ref={ref} className={"msg" + (highlighted ? " highlight" : "")}>
          <span className="muted">🗑️ comment deleted</span>
        </div>
        {repliesBlock}
      </div>
    );
  }

  return (
    <div className="col" style={{ gap: 4, marginLeft: indent, borderLeft: depth > 0 ? "2px solid var(--border)" : undefined, paddingLeft: depth > 0 ? 8 : undefined }}>
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
          <MarkdownBody content={comment.content} mentions={comment.mentions} />
          {comment.gif && (
            <img
              src={comment.gif.gifUrl}
              alt={comment.gif.altText}
              style={{ maxWidth: "100%", maxHeight: 260, borderRadius: 8, marginTop: 4 }}
            />
          )}
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
        {isReal && !editing && (
          <button className="linklike" onClick={() => setReplying((r) => !r)}>💬 reply</button>
        )}
        {canManage && !editing && (
          <>
            <button className="linklike" onClick={() => { setDraft(comment.content ?? ""); setErr(null); setEditing(true); }}>✏️ edit</button>
            <button className="linklike" onClick={del} disabled={busy}>🗑️ delete</button>
          </>
        )}
        {!isOwner && (
          <ReportButton targetType="comment" targetId={comment.id} ownerId={comment.userId} disabled={!isReal} onRemoved={onRemoved} />
        )}
      </div>
      {/* surface a delete error that happens with the editor closed */}
      {!editing && err && <div className="error" style={{ marginTop: 4 }}>{err}</div>}
    </div>
      {replying && (
        <div className="col" style={{ marginLeft: 16 }}>
          <Composer
            onSubmit={postReply}
            placeholder={`reply to @${comment.user?.username ?? "comment"}`}
            submitLabel="Reply"
            allowGif
            analyticsTarget="comment"
          />
        </div>
      )}
      {repliesBlock}
    </div>
  );
}

// Comments moved from a bare useCommentSectionData() call to CommentSectionProvider + the
// useCommentSection() consumer. This is NOT cosmetic: `useReplies` (which powers the nested reply
// threads below) reads the shared `entityCommentsTree` out of CommentSectionContext, so replies and
// the top-level list must come from ONE provider instance. Calling the data hook directly leaves
// that context empty and `useReplies` dereferences `entityCommentsTree![commentId]` → TypeError.
// Same provider-then-consume shape as EntityProvider/useEntity above.
function Comments(props: { entityId: string; highlightCommentId?: string; onPosted?: () => void; onRemoved?: () => void }) {
  return (
    <CommentSectionProvider entityId={props.entityId} limit={20}>
      <CommentsBody {...props} />
    </CommentSectionProvider>
  );
}

function CommentsBody({ entityId: _entityId, highlightCommentId, onPosted, onRemoved }: { entityId: string; highlightCommentId?: string; onPosted?: () => void; onRemoved?: () => void }) {
  const cs = useCommentSection() as any;
  const { comments, newComments, loading, createComment, updateComment, deleteComment, loadMore, hasMore, sortBy, setSortBy, sortDir, setSortDir } = cs;
  const { user } = useUser() as any;

  const post = async ({ content, mentions, gif }: { content: string; mentions: any[]; gif?: any }) => {
    // The SDK's comment path self-filters `mentions` to those whose @username still appears in the
    // content, so typed-then-deleted mentions need no handling here.
    await createComment({ content: content || undefined, mentions, gif });
    track("post_comment");
    onPosted?.();
  };

  // The SDK keeps optimistically-added comments (the ones you just posted) in a separate
  // `newComments` array until the next refetch folds them into `comments`. Render both, with
  // the freshly-posted ones on top, so a new comment shows immediately.
  const all = [...((newComments as any[]) ?? []), ...((comments as any[]) ?? [])];

  // A deep-linked comment may sit beyond the first page; tell the moderator to page in if so.
  const highlightLoaded = !highlightCommentId || all.some((c: any) => c.id === highlightCommentId);

  const COMMENT_SORTS = ["createdAt", "top", "controversial"] as const;

  return (
    <div className="panel col">
      <div className="row">
        <strong>Comments {loading ? "…" : `(${all.length})`}</strong>
        <span className="spacer" />
        <label className="muted">sort</label>
        <select
          value={sortBy ?? "createdAt"}
          onChange={(e) => {
            const next = e.target.value as (typeof COMMENT_SORTS)[number];
            setSortBy(next);
            track("change_comment_sort", { sortBy: next, sortDir });
          }}
          style={{ width: "auto" }}
        >
          {COMMENT_SORTS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button
          disabled={sortBy !== "createdAt"}
          onClick={() => {
            const next = sortDir === "asc" ? "desc" : "asc";
            setSortDir(next);
            track("change_comment_sort", { sortBy: sortBy ?? "createdAt", sortDir: next });
          }}
        >
          {sortDir === "asc" ? "▲ asc" : "▼ desc"}
        </button>
      </div>
      {!loading && !highlightLoaded && (
        <div className="muted">
          🔗 The linked comment isn’t on this page yet — keep loading more to reach it.
        </div>
      )}
      <div className="col">
        <Composer
          onSubmit={post}
          placeholder="add a comment"
          submitLabel="Post"
          allowGif
          analyticsTarget="comment"
        />
      </div>
      <div className="scroll col">
        {all.map((c: any) => (
          <CommentRow
            key={c.id}
            comment={c}
            highlighted={!!highlightCommentId && c.id === highlightCommentId}
            highlightCommentId={highlightCommentId}
            currentUserId={user?.id}
            onUpdate={updateComment}
            onDelete={deleteComment}
            onRemoved={onRemoved}
          />
        ))}
      </div>
      {hasMore && <button onClick={() => loadMore()}>Load more</button>}
    </div>
  );
}
