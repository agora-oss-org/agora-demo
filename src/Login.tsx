import { useState } from "react";
import { useAuth } from "@agora/react-js";

// Email/password against the Agora server's /auth/sign-in (Supabase-backed identity, Agora tokens).
export default function Login() {
  const { signInWithEmailAndPassword, signUpWithEmailAndPassword } = useAuth();
  const [email, setEmail] = useState(import.meta.env.VITE_DEMO_EMAIL || "");
  const [password, setPassword] = useState(import.meta.env.VITE_DEMO_PASSWORD || "");
  const [mode, setMode] = useState<"in" | "up">("in");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      if (mode === "in") await signInWithEmailAndPassword({ email, password });
      else await signUpWithEmailAndPassword({ email, password });
    } catch (e: any) {
      setErr(e?.response?.data?.error || e?.message || "Authentication failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel login col">
      <div className="brand">🏛️ Agora demo</div>
      <div className="muted">{mode === "in" ? "Sign in" : "Sign up"} via the @agora SDK → Agora <code>/auth</code></div>
      <input placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input placeholder="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      {err && <div className="error">{err}</div>}
      <button className="primary" disabled={busy} onClick={submit}>
        {busy ? "…" : mode === "in" ? "Sign in" : "Sign up"}
      </button>
      <button onClick={() => { setMode(mode === "in" ? "up" : "in"); setErr(null); }}>
        {mode === "in" ? "Need an account? Sign up" : "Have an account? Sign in"}
      </button>
    </div>
  );
}
