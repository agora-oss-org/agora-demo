import { useState } from "react";
import { EntityProvider, useEntity, useReactionToggle, useCommentSectionData } from "@agora/react-js";

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
  const { entity } = useEntity() as any;
  return (
    <div className="col">
      <button onClick={onBack}>{backLabel}</button>
      <div className="panel col">
        <h3 style={{ margin: 0 }}>{entity?.title || "(untitled)"}</h3>
        <div>{entity?.content}</div>
        {entity && <Reactions entityId={entityId} entity={entity} />}
      </div>
      {entity && <Comments entityId={entityId} />}
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
      <span className="muted">your reaction: {currentReaction ?? "none"}</span>
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
        <span className="muted">{new Date(comment.createdAt).toLocaleString()}</span>
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
