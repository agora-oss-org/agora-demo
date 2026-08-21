import { useState } from "react";
import { useAuth, useRequestPasswordReset } from "@agora-sdk/react-js";
import { ResendVerificationButton } from "@agora-sdk/auth-react-js";
import { track } from "./analytics";
import Brand from "./Brand";
import { DEMO_EMAIL, DEMO_PASSWORD } from "./config";

// Email/password only, against the Agora server's /auth/sign-in (Supabase-backed identity, Agora
// tokens). Forgot-password uses the core useRequestPasswordReset hook to email a reset link; the link
// itself lands on /auth/reset-password, handled by @agora-sdk/auth-react-js's PasswordResetHandler in
// Shell.tsx. The same package's ResendVerificationButton covers "didn't get the confirmation email?".
//
// Two ways in, separated by an "or": your own account via the normal form, or the demo's operator
// account in one click. The operator path is the whole reason this screen isn't just a login box —
// the moderation and admin surfaces are invisible without an operator token (see isOperatorToken in
// EntityView.tsx), so a visitor who only ever signs up their own account would never know they exist.

// Only offer the one-click path when the deployment actually configured an account for it. Both
// halves are required — an email with no password can't sign in, and a dangling "or" with nothing
// above it reads as a bug.
const ADMIN_LOGIN = Boolean(DEMO_EMAIL && DEMO_PASSWORD);

export default function Login() {
  const { signInWithEmailAndPassword, signUpWithEmailAndPassword } = useAuth();
  const requestPasswordReset = useRequestPasswordReset();
  // Deliberately NOT prefilled with the demo credentials any more: the operator account now has its
  // own button, so this form is unambiguously "your own account".
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"in" | "up" | "reset">("in");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Set after a sign-up that needs email confirmation — show "check your email" instead of an error.
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  // Set after a successful forgot-password request — show "check your email" instead of the form.
  const [resetSent, setResetSent] = useState(false);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      if (mode === "in") {
        await signInWithEmailAndPassword({ email, password });
        track("login", { method: "password" });
      } else {
        const res = await signUpWithEmailAndPassword({ email, password });
        // With email confirmation enabled the user is created but NOT signed in yet — they must
        // click the link in their inbox, then sign in. (status === "signed_in" means auto-confirm
        // is on and they're already in, so we just fall through and the auth gate renders the app.)
        if (res?.status === "confirmation_required") setPendingEmail(res.email);
        else track("login", { method: "signup" });
      }
    } catch (e: any) {
      setErr(e?.response?.data?.error || e?.message || "Authentication failed");
    } finally {
      setBusy(false);
    }
  };

  const signInAsAdmin = async () => {
    setBusy(true);
    setErr(null);
    try {
      await signInWithEmailAndPassword({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
      track("login", { method: "demo_admin" });
    } catch (e: any) {
      setErr(e?.response?.data?.error || e?.message || "Couldn't sign in as the demo admin");
    } finally {
      setBusy(false);
    }
  };

  const submitReset = async () => {
    setBusy(true);
    setErr(null);
    try {
      await requestPasswordReset({ email });
      setResetSent(true);
    } catch (e: any) {
      setErr(e?.response?.data?.error || e?.message || "Couldn't send the reset email");
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
        <ResendVerificationButton email={pendingEmail} />
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

  // Post-forgot-password confirmation screen.
  if (resetSent) {
    return (
      <div className="panel login col">
        <div className="brand">📬 Check your email</div>
        <div className="muted">
          If <code>{email}</code> has an account, we sent a password reset link to it. Click it to
          set a new password, then come back and sign in.
        </div>
        <button
          className="primary"
          onClick={() => {
            setResetSent(false);
            setMode("in");
            setErr(null);
          }}
        >
          Back to sign in
        </button>
      </div>
    );
  }

  if (mode === "reset") {
    return (
      <div className="panel login col">
        <Brand large><small>demo</small></Brand>
        <div className="muted">Reset your password</div>
        <input placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        {err && <div className="error">{err}</div>}
        <button className="primary" disabled={busy || !email} onClick={submitReset}>
          {busy ? "…" : "Send reset link"}
        </button>
        <button onClick={() => { setMode("in"); setErr(null); }}>Back to sign in</button>
      </div>
    );
  }

  return (
    <div className="panel login col">
      <Brand large><small>demo</small></Brand>
      <div className="muted">
        Welcome 👋 This is a <strong>reference implementation</strong> of the @agora SDK — every
        screen drives the real hooks against a live Agora server. Judge it on what it does, not how
        it looks: the styling is deliberately plain, the functionality is the whole point.
      </div>

      <input placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input placeholder="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      {err && <div className="error">{err}</div>}
      <button className="primary" disabled={busy || !email || !password} onClick={submit}>
        {busy ? "…" : mode === "in" ? "Sign in" : "Sign up"}
      </button>
      <button onClick={() => { setMode(mode === "in" ? "up" : "in"); setErr(null); }}>
        {mode === "in" ? "Need an account? Sign up" : "Have an account? Sign in"}
      </button>
      {mode === "in" && (
        <button className="linklike" onClick={() => { setMode("reset"); setErr(null); }}>
          Forgot password?
        </button>
      )}

      {ADMIN_LOGIN && mode === "in" && (
        <>
          <div className="or">or</div>
          {/* Deliberately not `primary` — the form above owns that now. Two gradient buttons in one
              340px panel leave neither reading as the default action. */}
          <button disabled={busy} onClick={signInAsAdmin}>
            {busy ? "…" : "🛠️ Log in as admin"}
          </button>
          <div className="muted">
            Signs you in as a demo <strong>operator</strong> account, so you can see the
            administration side: a 🚫 Remove control in the report panel that takes down a reported
            post or comment inline (and keeps it in moderation history), moderation pills (🚫 removed
            / ✅ kept) showing what's been actioned, plus the 🛠️ Admin link to the admin app.
          </div>
        </>
      )}
    </div>
  );
}
