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
      <div className="row">
        <input placeholder="add a comment" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="primary" disabled={busy} onClick={post}>Post</button>
      </div>
      <div className="scroll col">
        {all.map((c: any) => (
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
