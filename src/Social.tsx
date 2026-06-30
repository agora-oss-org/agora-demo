// Social.tsx — the ☀️ Social tab: exercises @agora-sdk/social-core + @agora-sdk/social-react-js, the
// "social graph as commons" surface (see agora-sdk-plus/packages/social/react-js/SOCIAL-GRAPH.md).
// Four read-only lenses, all GET /v7/:projectId/social/* (bearer-authed, feature-gated server-side),
// each rendered as the real drop-in SDK component PAIRED with a raw-debug column that dumps the hook's
// wire values — so this harness can verify what the server actually sends, and SEE why a component
// rendered null (lens disabled vs graph unavailable vs a real error).
//
//   ☀️ Weather        <CommunityWeather/>     useSocialWeather        GET /social/weather
//   ✨ Constellation   <Constellation/>        useSocialConstellation  GET /social/constellation
//   🏡 Neighborhood    <Neighborhood/>         useSocialNeighborhood   GET /social/neighborhood
//   🪟 Transparency    <SocialTransparency/>   useSocialTransparency    GET /social/transparency
//
// The <SocialProvider> is mounted in Shell.tsx (once signed in). NOTE: each useSocial* hook owns its
// OWN state, so the debug column's hook instance is INDEPENDENT of the one inside the SDK component
// (two fetches, two toggles). That's intentional here — it also proves the hooks work standalone.

import { useEffect, useState } from "react";
import {
  useSocial,
  useSocialWeather,
  useSocialConstellation,
  useSocialNeighborhood,
  useSocialTransparency,
  isSocialDegradation,
  SocialApiError,
  WEATHER_BANDS,
} from "@agora-sdk/social-core";
import {
  CommunityWeather,
  Constellation,
  Neighborhood,
  SocialTransparency,
  bandColors,
  brightnessTreatment,
} from "@agora-sdk/social-react-js";
import { track } from "./analytics";

// Render any caught social error in a member-safe, debug-friendly way: a "hide the surface"
// degradation (graph off / lens disabled) vs a real SocialApiError (status + machine code) vs an
// unexpected throw.
function describeError(err: unknown): string {
  if (err == null) return "—";
  if (isSocialDegradation(err)) return "hidden (lens disabled / graph unavailable)";
  if (err instanceof SocialApiError) return `SocialApiError ${err.status}${err.code ? ` ${err.code}` : ""}`;
  return String((err as any)?.message ?? err);
}

// One compact key/value row for the raw-debug columns.
function KV({ k, v }: { k: string; v: unknown }) {
  return (
    <div className="row" style={{ justifyContent: "space-between", gap: 12, fontSize: 13 }}>
      <span className="muted">{k}</span>
      <span className="prewrap" style={{ fontWeight: 600, textAlign: "right" }}>
        {typeof v === "object" && v !== null ? JSON.stringify(v) : String(v)}
      </span>
    </div>
  );
}

// Two-column card: the real SDK component on the left, the raw hook values on the right.
function LensCard({
  title,
  component,
  debug,
}: {
  title: string;
  component: React.ReactNode;
  debug: React.ReactNode;
}) {
  return (
    <div className="panel col" style={{ gap: 12 }}>
      <h3 style={{ margin: 0 }}>{title}</h3>
      <div className="row" style={{ gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div className="card" style={{ flex: "1 1 280px", minHeight: 80 }}>{component}</div>
        <div className="col" style={{ flex: "1 1 280px", gap: 4 }}>
          <div className="muted" style={{ fontSize: 12, textTransform: "uppercase" }}>raw hook values</div>
          {debug}
        </div>
      </div>
    </div>
  );
}

function WeatherCard() {
  const { weather, loading, error, refresh } = useSocialWeather() as any;
  useEffect(() => {
    if (weather) track("social_lens_rendered", { lens: "weather" });
  }, [Boolean(weather)]);
  return (
    <LensCard
      title="☀️ Community Weather"
      component={<CommunityWeather />}
      debug={
        <>
          <KV k="rendered?" v={weather ? "yes" : "null (disabled/loading/empty)"} />
          <KV k="value" v={weather?.value ?? null} />
          <KV k="band" v={weather?.band ?? "—"} />
          <KV k="trend" v={weather?.trend ?? null} />
          <KV k="asOf" v={weather?.asOf ?? "—"} />
          <KV k="loading" v={loading} />
          <KV k="error" v={describeError(error)} />
          <button onClick={() => { void refresh(); track("social_refreshed", { lens: "weather" }); }}>
            ↻ refresh
          </button>
        </>
      }
    />
  );
}

function ConstellationCard() {
  const { constellation, loading, error, refresh } = useSocialConstellation() as any;
  // The component re-randomizes its layout on mount / when the blob set changes; bump this key to
  // remount it and force a fresh layout pass (privacy: no stable blob positions across loads). The
  // remount also re-runs the component's OWN useSocialConstellation mount effect, so it issues a
  // fresh GET — harmless (the snapshot is slow-moving) and distinct from the debug instance's refetch.
  const [layoutKey, setLayoutKey] = useState(0);
  useEffect(() => {
    if (constellation) track("social_lens_rendered", { lens: "constellation" });
  }, [Boolean(constellation)]);
  return (
    <LensCard
      title="✨ Constellation"
      component={<Constellation key={layoutKey} width={320} height={220} />}
      debug={
        <>
          <KV k="rendered?" v={constellation ? "yes" : "null (disabled/loading)"} />
          <KV k="asOf" v={constellation?.asOf ?? "null (still forming)"} />
          <KV k="method" v={constellation?.method ?? "—"} />
          <KV k="blobs" v={constellation?.blobs?.length ?? 0} />
          {(constellation?.blobs ?? []).map((b: any, i: number) => (
            <KV key={i} k={`  blob[${i}]`} v={`${b.size} · ${b.warmth}`} />
          ))}
          <KV k="loading" v={loading} />
          <KV k="error" v={describeError(error)} />
          <div className="row" style={{ gap: 8 }}>
            <button onClick={() => { setLayoutKey((k) => k + 1); track("social_refreshed", { lens: "constellation" }); }}>
              🎲 re-randomize layout
            </button>
            <button onClick={() => { void refresh(); }}>↻ refetch</button>
          </div>
        </>
      }
    />
  );
}

function NeighborhoodCard() {
  // Independent debug instance (own toggle/fetch) — see file header. We render OUR toggle in the debug
  // column so it's the source of truth; the component below also has its own built-in toggle.
  const { neighborhood, loading, error, includeInteractions, setIncludeInteractions } =
    useSocialNeighborhood() as any;
  useEffect(() => {
    if (neighborhood) track("social_lens_rendered", { lens: "neighborhood" });
  }, [Boolean(neighborhood)]);
  return (
    <LensCard
      title="🏡 Neighborhood"
      component={<Neighborhood showInteractionsToggle />}
      debug={
        <>
          <KV k="rendered?" v={neighborhood ? "yes" : "null (disabled/loading/empty)"} />
          <KV k="includesInteractions (echoed)" v={neighborhood?.includesInteractions ?? "—"} />
          <KV k="asOf" v={neighborhood?.asOf ?? "—"} />
          <KV k="ties" v={neighborhood?.ties?.length ?? 0} />
          {(neighborhood?.ties ?? []).map((t: any) => (
            <KV
              key={t.userId}
              k={`  ${t.name ?? t.username ?? String(t.userId).slice(0, 8)}`}
              v={`b=${t.brightness} [${(t.tieKinds ?? []).join(",")}]`}
            />
          ))}
          <KV k="loading" v={loading} />
          <KV k="error" v={describeError(error)} />
          <label className="row" style={{ gap: 6 }}>
            <input
              type="checkbox"
              checked={includeInteractions}
              onChange={(e) => {
                setIncludeInteractions(e.target.checked);
                track("social_interactions_toggled", { on: e.target.checked });
              }}
            />
            includeInteractions (debug instance)
          </label>
        </>
      }
    />
  );
}

function TransparencyCard() {
  const { config, loading, error } = useSocialTransparency() as any;
  return (
    <LensCard
      title="🪟 Transparency"
      component={<SocialTransparency />}
      debug={
        <>
          <KV k="loading" v={loading} />
          <KV k="error" v={describeError(error)} />
          {config ? (
            Object.entries(config).map(([k, v]) => <KV key={k} k={k} v={v as unknown} />)
          ) : (
            <KV k="config" v="null (loading / unavailable)" />
          )}
        </>
      }
    />
  );
}

// Palette legend — exercises the exported bandColors() over every WeatherBand plus a
// brightnessTreatment() sample, so the shared climate vocabulary renders even when every lens is off.
function PaletteLegend() {
  return (
    <div className="panel col" style={{ gap: 8 }}>
      <h3 style={{ margin: 0 }}>
        🎨 Climate palette <small className="muted">(bandColors / brightnessTreatment)</small>
      </h3>
      <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
        {WEATHER_BANDS.map((band) => {
          const c = bandColors(band);
          return (
            <div key={band} className="col" style={{ alignItems: "center", gap: 4 }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: c.core, boxShadow: `0 0 16px ${c.glow}` }} />
              <span className="muted" style={{ fontSize: 12 }}>{band}</span>
            </div>
          );
        })}
      </div>
      <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
        {[0.15, 0.4, 0.7, 1.0].map((b) => {
          const t = brightnessTreatment(b);
          return (
            <div key={b} className="col" style={{ alignItems: "center", gap: 4 }}>
              <div
                style={{
                  width: 28 * t.scale,
                  height: 28 * t.scale,
                  borderRadius: "50%",
                  background: t.isSprout ? "#e0a955" : "#f4c64a",
                  boxShadow: `0 0 ${t.glowRadius}px rgba(244,198,74,${t.glowOpacity})`,
                }}
              />
              <span className="muted" style={{ fontSize: 12 }}>{t.isSprout ? "sprout" : `b=${b}`}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Social() {
  const { config, configLoading, configError } = useSocial() as any;
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="panel col" style={{ gap: 8 }}>
        <h2 style={{ margin: 0 }}>
          ☀️ Social graph <small className="muted">— the Garden 🌷 (read-only commons)</small>
        </h2>
        <p className="muted" style={{ margin: 0 }}>
          Four privacy-first lenses from <code>@agora-sdk/social-*</code>. Each shows the real drop-in SDK
          component beside the raw hook values it received. Components render <code>null</code> when a lens
          is disabled or the graph is unavailable — the debug column tells you which.
        </p>
        <KV k="provider configLoading" v={configLoading} />
        <KV k="provider configError" v={describeError(configError)} />
        <KV k="graphEnabled" v={config?.graphEnabled ?? "—"} />
      </div>
      <PaletteLegend />
      <WeatherCard />
      <ConstellationCard />
      <NeighborhoodCard />
      <TransparencyCard />
    </div>
  );
}
