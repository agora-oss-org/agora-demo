import { useEffect, useState } from "react";
import { useSpaceList } from "@agora/react-js";

// Lists + creates spaces via useSpaceList (→ /v7/:project/spaces).
export default function Spaces() {
  const list = useSpaceList({ listId: "demo-spaces" }) as any;
  const { spaces, loading, hasMore, fetchSpaces, loadMore, createSpace } = list;
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { fetchSpaces?.({}); /* eslint-disable-line */ }, []);

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try { await createSpace({ name }); setName(""); fetchSpaces?.({}); } finally { setBusy(false); }
  };

  return (
    <div className="col">
      <div className="panel col">
        <strong>Create a space</strong>
        <div className="row">
          <input placeholder="space name" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="primary" disabled={busy} onClick={create}>Create</button>
        </div>
      </div>
      <div className="muted">{loading ? "Loading…" : `${spaces?.length ?? 0} spaces`}</div>
      {(spaces ?? []).map((s: any) => (
        <div key={s.id} className="card">
          <h4>{s.name}</h4>
          <div className="muted">{s.description || "—"}</div>
          <div className="row" style={{ marginTop: 8 }}>
            <span className="pill">👥 {s.membersCount ?? 0}</span>
            <span className="pill">🗂 {s.childSpacesCount ?? 0} sub</span>
            <span className="pill">{s.readingPermission}</span>
          </div>
        </div>
      ))}
      {hasMore && <button onClick={() => loadMore()}>Load more</button>}
    </div>
  );
}
