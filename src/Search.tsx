import { useState } from "react";
import { useSearchContent } from "@agora-sdk/react-js";
import EntityView from "./EntityView";

// Semantic search via the SDK's useSearchContent → POST /v7/:project/search/content (Voyage + pgvector).
// Entity results are clickable: opening one renders EntityView in place, and its "← back" returns
// here with the results + query intact (both live in this component / the hook, so nothing refetches).
export default function Search() {
  const { results, loading, error, search } = useSearchContent() as any;
  const [q, setQ] = useState("japanese noodle soup");
  const [selected, setSelected] = useState<string | null>(null);

  if (selected) return <EntityView entityId={selected} onBack={() => setSelected(null)} backLabel="← back to results" />;

  return (
    <div className="col">
      <div className="panel row">
        <input
          placeholder="semantic query…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search({ query: q, sourceTypes: ["entity"], limit: 10 })}
        />
        <button className="primary" onClick={() => search({ query: q, sourceTypes: ["entity"], limit: 10 })}>Search</button>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="muted">{loading ? "Searching…" : `${results?.length ?? 0} results (by semantic similarity)`}</div>
      {(results ?? []).map((r: any, i: number) => {
        const isEntity = r.sourceType === "entity" && r.record?.id;
        return (
          <div
            key={r.record?.id ?? i}
            className="card"
            onClick={isEntity ? () => setSelected(r.record.id) : undefined}
            style={isEntity ? { cursor: "pointer" } : undefined}
          >
            <h4>{r.record?.title || "(untitled)"}</h4>
            <div className="clamp3">{r.record?.content}</div>
            <div className="row" style={{ marginTop: 6 }}>
              <span className="muted">
                <span className="pill">{r.sourceType}</span> similarity {Number(r.similarity).toFixed(3)}
              </span>
              {isEntity && (
                <>
                  <span className="spacer" />
                  <span className="muted">open →</span>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
