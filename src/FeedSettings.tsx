import { useEffect, useState } from "react";
import { useAuth } from "@agora-sdk/react-js";

// Admin panel driving the server's project-admin feed config (GET/PATCH /settings/feed). There is no
// SDK hook for this server-admin surface, so we call it directly with the access token + Vite env
// (same baseUrl/projectId App.tsx feeds the SDK). Non-admins get a friendly gate message.
const BASE = import.meta.env.VITE_API_BASE_URL;   // e.g. http://localhost:4000/v7
const PID = import.meta.env.VITE_PROJECT_ID;

const ALGORITHMS = ["hot", "top", "new", "controversial", "decay", "gravity", "wilson", "bayesian"];
const HALF_LIVES: [string, number][] = [
  ["6 hours", 6], ["12 hours", 12], ["1 day", 24], ["3 days", 72],
  ["5 days", 120], ["7 days", 168], ["30 days", 720],
];

export default function FeedSettings() {
  const { accessToken } = useAuth() as any;
  const [cfg, setCfg] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const api = (path: string, init?: RequestInit) =>
    fetch(`${BASE}/${PID}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}`, ...(init?.headers || {}) },
    });

  const load = async () => {
    setError(null);
    try {
      const r = await api("/settings/feed");
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error || `HTTP ${r.status}`); setCfg(null); return; }
      setCfg(d);
    } catch (e: any) { setError(e?.message || "Failed to load"); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const save = async (patch: Record<string, unknown>) => {
    setBusy(true); setMsg(null); setError(null);
    try {
      const r = await api("/settings/feed", { method: "PATCH", body: JSON.stringify(patch) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error || `HTTP ${r.status}`); return; }
      setCfg(d); setMsg("✓ saved");
    } catch (e: any) { setError(e?.message || "Failed to save"); } finally { setBusy(false); }
  };

  if (error && !cfg) {
    return (
      <div className="panel col">
        <strong>⚙️ Feed ranking</strong>
        <div className="muted">{error}{/admin/i.test(error) ? " — sign in as a project-admin to edit feed settings (the demo user is a visitor)." : ""}</div>
      </div>
    );
  }
  if (!cfg) return <div className="panel muted">Loading feed settings…</div>;

  const algo = cfg.defaultAlgorithm;
  return (
    <div className="panel col">
      <strong>⚙️ Feed ranking — project default</strong>
      <div className="muted">Applies to feed requests that don't override <code>sortBy</code>. Control how the feed is ordered for everyone.</div>

      <label className="muted">Default algorithm</label>
      <select value={algo} disabled={busy} onChange={(e) => save({ defaultAlgorithm: e.target.value })}>
        {ALGORITHMS.map((a) => <option key={a} value={a}>{a}</option>)}
      </select>

      {algo === "decay" && (
        <>
          <label className="muted">Score half-life — after this, a post decays to ~50% of its peak</label>
          <select
            value={cfg.params.halfLifeHours}
            disabled={busy}
            onChange={(e) => save({ halfLifeHours: Number(e.target.value) })}
          >
            {HALF_LIVES.map(([label, h]) => <option key={h} value={h}>{label}</option>)}
            {!HALF_LIVES.some(([, h]) => h === cfg.params.halfLifeHours) && (
              <option value={cfg.params.halfLifeHours}>{cfg.params.halfLifeHours} hours</option>
            )}
          </select>
          <label className="muted">Decay mode</label>
          <select value={cfg.decayMode} disabled={busy} onChange={(e) => save({ decayMode: e.target.value })}>
            <option value="query-time">query-time (live, exact)</option>
            <option value="stored">stored (cron-snapshotted, index-served)</option>
          </select>
        </>
      )}

      {algo === "gravity" && (
        <>
          <label className="muted">Gravity exponent (higher = faster sink): {cfg.params.gravity}</label>
          <input
            type="range" min={0.5} max={5} step={0.1} value={cfg.params.gravity} disabled={busy}
            onChange={(e) => setCfg({ ...cfg, params: { ...cfg.params, gravity: Number(e.target.value) } })}
            onMouseUp={(e) => save({ gravity: Number((e.target as HTMLInputElement).value) })}
          />
        </>
      )}

      <div className="row">
        <span className="muted">{busy ? "saving…" : msg ?? ""}</span>
        <span className="spacer" />
        {error && <span className="error">{error}</span>}
      </div>
    </div>
  );
}
