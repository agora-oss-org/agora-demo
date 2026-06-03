import { useEffect, useState } from "react";
import { useSpaceList } from "@agora-sdk/react-js";
import SpaceView from "./SpaceView";
import { track } from "./analytics";

// Browses top-level spaces (→ GET /v7/:project/spaces with no parent = top-level) and creates them.
// Entering a space hands off to <SpaceView>, which shows its subspaces + entries and lets you nest.
export default function Spaces() {
  const list = useSpaceList({ listId: "demo-spaces-root" }) as any;
  const { spaces, loading, hasMore, fetchSpaces, loadMore, createSpace } = list;
  const [name, setName] = useState("");
  const [priv, setPriv] = useState(false);
  const [busy, setBusy] = useState(false);
  const [entered, setEntered] = useState<any | null>(null);

  const refresh = () => fetchSpaces?.({ parentSpaceId: null }); // null → top-level only

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      // Private = members-only reading + join requires admin approval. Public = anyone reads/joins.
      await createSpace({ name, ...(priv ? { readingPermission: "members", requireJoinApproval: true } : {}) });
      track("create_space", { parent: "root", private: priv });
      setName("");
      setPriv(false);
      refresh();
    } finally {
      setBusy(false);
    }
  };

  if (entered) return <SpaceView space={entered} onBack={() => { setEntered(null); refresh(); }} />;

  return (
    <div className="col">
      <div className="panel col">
        <strong>Create a top-level space</strong>
        <div className="row">
          <input placeholder="space name" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="primary" disabled={busy} onClick={create}>Create</button>
        </div>
        <label className="row" style={{ gap: 6 }}>
          <input type="checkbox" style={{ width: "auto" }} checked={priv} onChange={(e) => setPriv(e.target.checked)} />
          <span className="muted">🔒 Private (members-only; joining requires approval)</span>
        </label>
      </div>
      <div className="muted">{loading ? "Loading…" : `${spaces?.length ?? 0} top-level spaces`}</div>
      {(spaces ?? []).map((s: any) => (
        <div key={s.id} className="card" onClick={() => setEntered(s)} style={{ cursor: "pointer" }}>
          <h4>🏘️ {s.name}</h4>
          <div className="muted">{s.description || "—"}</div>
          <div className="row" style={{ marginTop: 8 }}>
            <span className="pill">👥 {s.membersCount ?? 0}</span>
            <span className="pill">🗂 {s.childSpacesCount ?? 0} sub</span>
            <span className="pill">{s.readingPermission}</span>
            <span className="spacer" />
            <span className="muted">enter →</span>
          </div>
        </div>
      ))}
      {hasMore && <button onClick={() => loadMore()}>Load more</button>}
    </div>
  );
}
