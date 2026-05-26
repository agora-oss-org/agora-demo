import { useEffect, useState } from "react";
import { useSpaceList, useEntityList } from "@agora/react-js";
import EntityView from "./EntityView";
import CreateEntity from "./CreateEntity";

// A single space: shows its subspaces (with a create-subspace form) and its entries (with the
// standalone create-entity form). Recurses into subspaces via a nested <SpaceView>, so you can
// drill arbitrarily deep. List ids are keyed by space.id so each level keeps independent state.
export default function SpaceView({ space, onBack }: { space: any; onBack: () => void }) {
  const subs = useSpaceList({ listId: `subspaces-${space.id}` }) as any;
  const ents = useEntityList({ listId: `space-entities-${space.id}` }) as any;

  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [enteredChild, setEnteredChild] = useState<any | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const refreshSubs = () => subs.fetchSpaces?.({ parentSpaceId: space.id });
  const refreshEnts = () => ents.fetchEntities?.({}, undefined, { spaceId: space.id, limit: 20 });

  useEffect(() => {
    refreshSubs();
    refreshEnts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [space.id]);

  const createSubspace = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await subs.createSpace({ name, parentSpaceId: space.id });
      setName("");
      refreshSubs();
    } finally {
      setBusy(false);
    }
  };

  if (enteredChild)
    return <SpaceView space={enteredChild} onBack={() => { setEnteredChild(null); refreshSubs(); }} />;
  if (selectedEntity)
    return <EntityView entityId={selectedEntity} onBack={() => { setSelectedEntity(null); refreshEnts(); }} backLabel={`← back to 🏘️ ${space.name}`} />;
  if (creating)
    return (
      <CreateEntity
        spaceId={space.id}
        spaceName={space.name}
        onCancel={() => setCreating(false)}
        onDone={() => { setCreating(false); refreshEnts(); }}
      />
    );

  return (
    <div className="col">
      <button onClick={onBack}>← back</button>

      <div className="panel col">
        <h3 style={{ margin: 0 }}>🏘️ {space.name}</h3>
        <div className="muted">{space.description || "—"}</div>
        <div className="row" style={{ marginTop: 4 }}>
          <span className="pill">👥 {space.membersCount ?? 0}</span>
          <span className="pill">🗂 {space.childSpacesCount ?? 0} sub</span>
          <span className="pill">{space.readingPermission}</span>
          {typeof space.depth === "number" && <span className="pill">depth {space.depth}</span>}
        </div>
      </div>

      {/* Subspaces */}
      <div className="panel col">
        <strong>Create a subspace</strong>
        <div className="row">
          <input placeholder="subspace name" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="primary" disabled={busy} onClick={createSubspace}>Create subspace</button>
        </div>
      </div>
      <div className="muted">{subs.loading ? "Loading…" : `${subs.spaces?.length ?? 0} subspaces`}</div>
      {(subs.spaces ?? []).map((s: any) => (
        <div key={s.id} className="card" onClick={() => setEnteredChild(s)} style={{ cursor: "pointer" }}>
          <h4>🏘️ {s.name}</h4>
          <div className="muted">{s.description || "—"}</div>
          <div className="row" style={{ marginTop: 8 }}>
            <span className="pill">👥 {s.membersCount ?? 0}</span>
            <span className="pill">🗂 {s.childSpacesCount ?? 0} sub</span>
            <span className="spacer" />
            <span className="muted">enter →</span>
          </div>
        </div>
      ))}
      {subs.hasMore && <button onClick={() => subs.loadMore()}>Load more subspaces</button>}

      {/* Entries */}
      <div className="row" style={{ marginTop: 12 }}>
        <strong>Entries</strong>
        <span className="spacer" />
        <button className="primary" onClick={() => setCreating(true)}>➕ New post here</button>
      </div>
      <div className="muted">{ents.loading ? "Loading…" : `${ents.entities?.length ?? 0} entries`}</div>
      {(ents.entities ?? []).map((e: any) => (
        <div key={e.id} className="card" onClick={() => setSelectedEntity(e.id)} style={{ cursor: "pointer" }}>
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
      {ents.hasMore && <button onClick={() => ents.loadMore()}>Load more entries</button>}
    </div>
  );
}
