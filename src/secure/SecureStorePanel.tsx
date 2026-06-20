import { useState } from "react";
import { useSecureStore } from "./SecureStoreContext";
import { track } from "../analytics";

// At-rest encryption controls for the unlocked store. "Lock store" re-seals the on-disk data and
// reloads (the reload is the honest part — lock() alone doesn't purge plaintext already cached in
// memory this session). "Change password" re-wraps the SAME data key under a new password, so there's
// no re-encryption and no data loss; it requires the store to be unlocked (the SDK enforces that).
export default function SecureStorePanel() {
  const { lock, changePassword } = useSecureStore();
  const [open, setOpen] = useState(false);
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPw || !newPw || busy) return;
    setBusy(true);
    setErr(null);
    setDone(false);
    try {
      await changePassword(oldPw, newPw);
      track("secure_change_password");
      setOldPw("");
      setNewPw("");
      setDone(true);
    } catch (e2) {
      setErr(String((e2 as Error)?.message ?? e2));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel col">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <strong>🗝️ Encryption at rest</strong>
        <button className="linklike" onClick={() => setOpen((o) => !o)}>
          {open ? "hide" : "password"}
        </button>
      </div>
      <div className="muted">Sealed under your password (AES-256-GCM). Lock re-seals + reloads.</div>
      <div className="row" style={{ gap: 8 }}>
        <button onClick={lock}>🔒 Lock store</button>
      </div>
      {open && (
        <form className="col" style={{ gap: 6 }} onSubmit={submit}>
          <input type="password" placeholder="current password" value={oldPw}
                 onChange={(e) => setOldPw(e.target.value)} />
          <input type="password" placeholder="new password" value={newPw}
                 onChange={(e) => setNewPw(e.target.value)} />
          {err ? <div className="error">{err}</div> : null}
          {done ? <div className="muted">✅ password changed</div> : null}
          <button className="primary" type="submit" disabled={!oldPw || !newPw || busy}>
            {busy ? "Re-wrapping…" : "Change password"}
          </button>
          <div className="muted">Re-wraps the same key — no re-encryption, no data loss.</div>
        </form>
      )}
    </div>
  );
}
