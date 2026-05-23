import { useState } from "react";
import { EntityProvider, useEntity, useReactionToggle, useCommentSectionData } from "@agora/react-js";

export default function EntityView({ entityId, onBack }: { entityId: string; onBack: () => void }) {
  return (
    <EntityProvider entityId={entityId}>
      <Inner onBack={onBack} entityId={entityId} />
    </EntityProvider>
  );
}

function Inner({ entityId, onBack }: { entityId: string; onBack: () => void }) {
  const { entity } = useEntity() as any;
  return (
    <div className="col">
      <button onClick={onBack}>← back to feed</button>
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

function Comments({ entityId }: { entityId: string }) {
  const cs = useCommentSectionData({ entityId, limit: 20 } as any) as any;
  const { comments, loading, createComment, loadMore, hasMore } = cs;
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const post = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try { await createComment({ content: text }); setText(""); } finally { setBusy(false); }
  };

  return (
    <div className="panel col">
      <strong>Comments {loading ? "…" : `(${comments?.length ?? 0})`}</strong>
      <div className="row">
        <input placeholder="add a comment" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="primary" disabled={busy} onClick={post}>Post</button>
      </div>
      <div className="scroll col">
        {(comments ?? []).map((c: any) => (
          <div key={c.id} className="msg">
            <div>{c.content}</div>
            <div className="muted">⬆ {c.reactionCounts?.upvote ?? 0} · {new Date(c.createdAt).toLocaleString()}</div>
          </div>
        ))}
      </div>
      {hasMore && <button onClick={() => loadMore()}>Load more</button>}
    </div>
  );
}
