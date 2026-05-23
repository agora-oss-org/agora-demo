import { useState } from "react";
import { useSearchContent } from "@agora/react-js";

// Semantic search via the SDK's useSearchContent → POST /v7/:project/search/content (Voyage + pgvector).
export default function Search() {
  const { results, loading, error, search } = useSearchContent() as any;
  const [q, setQ] = useState("japanese noodle soup");

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
      {(results ?? []).map((r: any, i: number) => (
        <div key={r.record?.id ?? i} className="card">
          <h4>{r.record?.title || "(untitled)"}</h4>
          <div>{r.record?.content}</div>
          <div className="muted" style={{ marginTop: 6 }}>
            <span className="pill">{r.sourceType}</span> similarity {Number(r.similarity).toFixed(3)}
          </div>
        </div>
      ))}
    </div>
  );
}
