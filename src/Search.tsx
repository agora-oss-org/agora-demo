import { useEffect, useRef, useState } from "react";
import { useSearchContent } from "@agora-sdk/react-js";
import EntityView, { isModeratedOut, ModerationPill, PublicPill } from "./EntityView";
import { track } from "./analytics";

// Semantic search via the SDK's useSearchContent → POST /v7/:project/search/content (Voyage + pgvector).
// Entity results are clickable: opening one renders EntityView in place, and its "← back" returns
// here with the results + query intact (both live in this component / the hook, so nothing refetches).
export default function Search() {
  const { results, loading, error, search } = useSearchContent() as any;
  const [q, setQ] = useState("japanese noodle soup");
  const [selected, setSelected] = useState<string | null>(null);

  // Track submit_search with the RESULT COUNT (never the query text). The count isn't known until
  // the request settles, so a ref marks "a user search is in flight" and we record it when loading
  // falls back to false.
  const searchedRef = useRef(false);
  const runSearch = () => { searchedRef.current = true; search({ query: q, sourceTypes: ["entity"], limit: 10 }); };
  useEffect(() => {
    if (!loading && searchedRef.current) {
      searchedRef.current = false;
      track("submit_search", { results: results?.length ?? 0 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  if (selected) return <EntityView entityId={selected} onBack={() => setSelected(null)} backLabel="← back to results" />;

  return (
    <div className="col">
      <div className="panel row">
        <input
          placeholder="semantic query…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && runSearch()}
        />
        <button className="primary" onClick={runSearch}>Search</button>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="muted">{loading ? "Searching…" : `${results?.length ?? 0} results (by semantic similarity)`}</div>
      {(results ?? []).map((r: any, i: number) => {
        const isEntity = r.sourceType === "entity" && r.record?.id;
        // Removed content reaches search only for operators (the server hides it from everyone else),
        // same as the feed — so flag it with the same redacted styling + pill instead of passing it
        // off as live content (mirrors Feed.tsx).
        const removed = isEntity && isModeratedOut(r.record);
        return (
          <div
            key={r.record?.id ?? i}
            className={"card" + (removed ? " redacted" : "")}
            onClick={isEntity ? () => setSelected(r.record.id) : undefined}
            style={isEntity ? { cursor: "pointer" } : undefined}
          >
            <div className="row">
              <h4 style={{ margin: 0 }}>{r.record?.title || "(untitled)"}</h4>
              {isEntity && <PublicPill entity={r.record} />}
              {isEntity && <ModerationPill entity={r.record} />}
            </div>
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
