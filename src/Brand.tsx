import logoUrl from "./assets/agora-logo.png";

// The app's wordmark, used by every header (Shell's app bar + the Login/auth panels). Imported
// rather than referenced from public/ so Vite hashes it and rewrites the URL for the relative
// `base` (the bundle has to work mounted at any path — see vite.config.ts).
//
// The logo already CONTAINS the word "Agora", so callers pass only the trailing bits ("demo", the
// version line) as children — no redundant "Agora" text beside it. alt="Agora" carries the name for
// screen readers and for a broken-image fallback.
export default function Brand({ large = false, children }: { large?: boolean; children?: React.ReactNode }) {
  return (
    <div className="brand">
      <img src={logoUrl} alt="Agora" className={"brand-logo" + (large ? " large" : "")} />
      {children}
    </div>
  );
}
