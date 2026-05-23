import { useEffect, useState } from "react";
import { useEntityList } from "@agora/react-js";
import EntityView from "./EntityView";

// Lists entities via useEntityList (→ GET /v7/:project/entities) and creates new ones.
export default function Feed() {
  const list = useEntityList({ listId: "demo-feed" }) as any;
  const { entities, loading, hasMore, fetchEntities, loadMore, createEntity } = list;
  const [selected, setSelected] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchEntities({}, undefined, { limit: 20 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const create = async () => {
    if (!content.trim() && !title.trim()) return;
    setBusy(true);
    try {
      await createEntity({ title: title || undefined, content: content || undefined });
      setTitle(""); setContent("");
      fetchEntities({}, undefined, { limit: 20 });
    } finally { setBusy(false); }
  };

  if (selected) return <EntityView entityId={selected} onBack={() => setSelected(null)} />;

  return (
    <div className="col">
      <div className="panel col">
        <strong>Create an entity</strong>
        <input placeholder="title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea placeholder="what's on your mind?" rows={2} value={content} onChange={(e) => setContent(e.target.value)} />
        <div className="row"><span className="spacer" /><button className="primary" disabled={busy} onClick={create}>Post</button></div>
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
