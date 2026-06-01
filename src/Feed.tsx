import { useEffect, useState } from "react";
import { useEntityList } from "@agora-sdk/react-js";
import EntityView, { fileImageSrc, isModeratedOut, ModerationPill, AuthorTag } from "./EntityView";
import CreateEntity from "./CreateEntity";

// Lists entities via useEntityList (→ GET /v7/:project/entities). The sort dropdown switches the
// ranking algorithm per request (hot/decay/gravity/…).
const SORTS = ["hot", "top", "new", "controversial", "decay", "gravity", "wilson", "bayesian"];

export default function Feed() {
  const list = useEntityList({ listId: "demo-feed" }) as any;
  const { entities, loading, hasMore, fetchEntities, loadMore } = list;
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [sortBy, setSortBy] = useState("hot");

  // include: ["user"] so each card can show its author (the 3rd fetchEntities arg is the config).
  const refresh = (sort = sortBy) => fetchEntities({}, { sortBy: sort }, { limit: 20, include: ["user"] });

  // Refetch whenever the chosen algorithm changes (also covers the initial load).
  useEffect(() => {
    refresh(sortBy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortBy]);

  if (selected) return <EntityView entityId={selected} onBack={() => { setSelected(null); refresh(); }} backLabel="← back to feed" />;
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
        <label className="muted">sort</label>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ width: "auto" }}>
          {SORTS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="spacer" />
        <button className="primary" onClick={() => setCreating(true)}>➕ New post</button>
      </div>

      <div className="muted">{loading ? "Loading…" : `${entities?.length ?? 0} entities · sorted by ${sortBy}`}</div>
      {(entities ?? []).map((e: any) => (
        <div key={e.id} className={"card" + (isModeratedOut(e) ? " redacted" : "")} onClick={() => setSelected(e.id)} style={{ cursor: "pointer" }}>
          <div className="row">
            <h4 style={{ margin: 0 }}>{e.title || "(untitled)"}</h4>
            <ModerationPill entity={e} />
            <span className="spacer" />
            <AuthorTag user={e.user} />
          </div>
          <div className="clamp3">{e.content}</div>
          {(() => {
            const src = (e.files ?? []).map(fileImageSrc).find(Boolean);
            return src ? (
              <img src={src} alt="" style={{ marginTop: 8, maxWidth: "100%", maxHeight: 220, borderRadius: 8, border: "1px solid var(--border)" }} />
            ) : null;
          })()}
          <div className="row" style={{ marginTop: 8 }}>
            <span className="pill">⬆ {e.reactionCounts?.upvote ?? 0}</span>
            <span className="pill">⬇ {e.reactionCounts?.downvote ?? 0}</span>
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
