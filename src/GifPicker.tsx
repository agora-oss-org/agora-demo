import { useEffect, useMemo, useRef, useState } from "react";
import { GiphyFetch } from "@giphy/js-fetch-api";
import { Grid } from "@giphy/react-components";
import type { IGif } from "@giphy/js-types";
import { GIPHY_API_KEY } from "./config";

// Map a GIPHY result onto the SDK's GifData shape (core/interfaces/models/Comment.d.ts:5) — the
// exact object that gets persisted on Comment.gif / ChatMessage.gif.
function toGifData(gif: IGif) {
  const img = gif.images;
  const w = Number(img.original?.width) || 1;
  const h = Number(img.original?.height) || 1;
  return {
    id: String(gif.id),
    url: img.original.url,
    gifUrl: img.original.url,
    gifPreviewUrl: img.fixed_width_small?.url ?? img.preview_gif?.url ?? img.original.url,
    altText: gif.title || (gif as { alt_text?: string }).alt_text || "GIF",
    aspectRatio: `${w} / ${h}`,
  };
}

export default function GifPicker({
  onSelect,
  onClose,
}: {
  onSelect: (gif: ReturnType<typeof toGifData>) => void;
  onClose: () => void;
}) {
  const gf = useMemo(() => (GIPHY_API_KEY ? new GiphyFetch(GIPHY_API_KEY) : null), []);
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [width, setWidth] = useState(320);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Debounce so we don't hit the API on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 350);
    return () => clearTimeout(t);
  }, [term]);

  // <Grid> requires an explicit pixel width, so track the container.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!gf) return null;

  // A failed fetch (bad key, offline, rate limit) just yields an empty grid — posting is never
  // blocked by a GIPHY outage.
  const fetchGifs = (offset: number) =>
    debounced ? gf.search(debounced, { offset, limit: 12 }) : gf.trending({ offset, limit: 12 });

  return (
    <div className="panel col" style={{ gap: 8 }}>
      <div className="row">
        <input
          autoFocus
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search GIPHY…"
          style={{ flex: 1 }}
        />
        <button className="linklike" onClick={onClose}>close</button>
      </div>
      <div ref={wrapRef} className="scroll" style={{ maxHeight: 280 }}>
        <Grid
          key={debounced}
          width={width}
          columns={3}
          gutter={6}
          hideAttribution
          fetchGifs={fetchGifs}
          noLink
          onGifClick={(gif, e) => {
            e.preventDefault();
            onSelect(toGifData(gif));
          }}
        />
      </div>
      {/* GIPHY's API terms require attribution. `hideAttribution` only suppresses the per-tile
          badge, so this line is what satisfies it — it is not optional. */}
      <div className="muted" style={{ textAlign: "center", fontSize: 10, letterSpacing: 1 }}>
        POWERED BY GIPHY
      </div>
    </div>
  );
}
