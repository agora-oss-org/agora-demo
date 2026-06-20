import { useState } from "react";
import { useSecureStore } from "./SecureStoreContext";

// The Chat-tab body while the encrypted store is locked. Submitting calls store.unlock(password):
// the first time on a device this MINTS the at-rest key (so the password you type becomes the one
// that opens it from now on); afterwards it UNWRAPS the existing key. A wrong password (or a tampered
// store) throws one generic error — we deliberately don't distinguish "wrong password" from "corrupt"
// (there's no password hash on disk to check against; the decrypt IS the check). On success this
// unmounts (Shell swaps in the real SecureChat once the provider is unlocked + mounted).
export default function SecureUnlock() {
  const { unlock } = useSecureStore();
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pass || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await unlock(pass);
      // success → this component unmounts; nothing else to do.
    } catch (e2) {
      setErr(String((e2 as Error)?.message ?? e2));
      setPass("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="panel col" style={{ maxWidth: 420, gap: 10 }} onSubmit={submit}>
      <div className="brand">🔒 Unlock secure chat</div>
      <div className="muted">
        Your secure chats are encrypted at rest. Pick a password the first time on this browser; it
        seals the keys, message history, and group secrets in IndexedDB. Enter the same password to
        unlock on later visits. The password never leaves this device and isn't stored — so there's no
        way to recover it if you forget it.
      </div>
      <input
        type="password"
        placeholder="secure-chat password"
        value={pass}
        autoFocus
        onChange={(e) => setPass(e.target.value)}
      />
      {err ? <div className="error">{err}</div> : null}
      <button className="primary" type="submit" disabled={!pass || busy}>
        {busy ? "Unlocking…" : "Unlock"}
      </button>
    </form>
  );
}
