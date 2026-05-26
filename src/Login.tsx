import { useState } from "react";
import { useAuth } from "@agora-sdk/react-js";

// Email/password against the Agora server's /auth/sign-in (Supabase-backed identity, Agora tokens).
export default function Login() {
  const { signInWithEmailAndPassword, signUpWithEmailAndPassword } = useAuth();
  const [email, setEmail] = useState(import.meta.env.VITE_DEMO_EMAIL || "");
  const [password, setPassword] = useState(import.meta.env.VITE_DEMO_PASSWORD || "");
  const [mode, setMode] = useState<"in" | "up">("in");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Set after a sign-up that needs email confirmation — show "check your email" instead of an error.
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      if (mode === "in") {
        await signInWithEmailAndPassword({ email, password });
      } else {
        const res = await signUpWithEmailAndPassword({ email, password });
        // With email confirmation enabled the user is created but NOT signed in yet — they must
        // click the link in their inbox, then sign in. (status === "signed_in" means auto-confirm
        // is on and they're already in, so we just fall through and the auth gate renders the app.)
        if (res?.status === "confirmation_required") setPendingEmail(res.email);
      }
    } catch (e: any) {
      setErr(e?.response?.data?.error || e?.message || "Authentication failed");
    } finally {
      setBusy(false);
    }
  };

  // Post-sign-up confirmation screen.
  if (pendingEmail) {
    return (
      <div className="panel login col">
        <div className="brand">📬 Check your email</div>
        <div className="muted">
          We sent a confirmation link to <code>{pendingEmail}</code>. Click it to activate your
          account (check spam too), then come back and sign in.
        </div>
        <button
          className="primary"
          onClick={() => {
            setPendingEmail(null);
            setMode("in");
            setErr(null);
          }}
        >
          Back to sign in
        </button>
      </div>
    );
  }

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
