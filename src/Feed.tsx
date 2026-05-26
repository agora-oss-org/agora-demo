import { useEffect, useState } from "react";
import { useEntityList } from "@agora/react-js";
import EntityView from "./EntityView";
import CreateEntity from "./CreateEntity";

// Lists entities via useEntityList (→ GET /v7/:project/entities). Creating a new entity is now its
// own routed form (CreateEntity), reached via the "New post" button.
export default function Feed() {
  const list = useEntityList({ listId: "demo-feed" }) as any;
  const { entities, loading, hasMore, fetchEntities, loadMore } = list;
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const refresh = () => fetchEntities({}, undefined, { limit: 20 });

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (selected) return <EntityView entityId={selected} onBack={() => setSelected(null)} backLabel="← back to feed" />;
  if (creating)
    return (
      <CreateEntity
        onCancel={() => setCreating(false)}
        onDone={() => { setCreating(false); refresh(); }}
      />
    );

  return (
    <div className="col">
      <div className="row">
        <strong>Feed</strong>
        <span className="spacer" />
        <button className="primary" onClick={() => setCreating(true)}>➕ New post</button>
      </div>

      <div className="muted">{loading ? "Loading…" : `${entities?.length ?? 0} entities`}</div>
      {(entities ?? []).map((e: any) => (
        <div key={e.id} className="card" onClick={() => setSelected(e.id)} style={{ cursor: "pointer" }}>
          <h4>{e.title || "(untitled)"}</h4>
          <div>{e.content}</div>
          <div className="row" style={{ marginTop: 8 }}>
            <span className="pill">⬆ {e.reactionCounts?.upvote ?? 0}</span>
            <span className="pill">💬 {e.repliesCount ?? 0}</span>
            <span className="spacer" />
            <span className="muted">open →</span>
          </div>
        </div>
      ))}
      {hasMore && <button onClick={() => loadMore()}>Load more</button>}
    </div>
  );
}
