import { useEffect, useState } from "react";
import { useSecureDevice, useSecureHandshakes, useSecureBackup } from "@agora-sdk/secure-chat-react-js";

// Always-mounted, mostly headless: brings the device online and keeps the /secure inbox draining so
// Welcomes/messages arrive live and on reload. If this client was evicted/cleared (Safari ITP, "clear
// browsing data") or is a fresh browser BUT a backup exists on the server, route to a passphrase
// prompt → restore() instead of registering a fresh, history-less identity.
export default function SecureBootstrap() {
  const { device, loading, register } = useSecureDevice() as any;
  const { needsRestore, checkingRestore, restore, restoring, error } = useSecureBackup() as any;
  const [pass, setPass] = useState("");

  // Auto-register exactly once — but ONLY when this isn't an evicted client with a recoverable backup.
  useEffect(() => {
    if (loading || checkingRestore) return;   // wait for both the device load and the eviction check
    if (device || needsRestore) return;        // already have a device, or must restore first
    register().catch(() => {});
  }, [loading, checkingRestore, device, needsRestore, register]);

  // Drain the handshake inbox for the registered device (Welcomes + Commits, seq-ordered).
  // MUST be called unconditionally before any early return (React hooks rule).
  useSecureHandshakes({ deviceId: device?.id });

  if (needsRestore) {
    return (
      <div className="panel col" style={{ position: "fixed", inset: "20% 30%", zIndex: 50, gap: 12 }}>
        <div className="brand">🔑 Restore your encrypted chats</div>
        <div className="muted">
          This browser has no local keys but a backup exists on the server. Enter your backup
          passphrase to recover your secure conversations (otherwise you'd start a fresh identity and
          lose history).
        </div>
        <input type="password" placeholder="backup passphrase" value={pass}
               onChange={(e) => setPass(e.target.value)} />
        {error ? <div className="error">{String((error as Error)?.message ?? error)}</div> : null}
        <button className="primary" disabled={restoring || !pass}
                onClick={() => restore(pass).catch(() => {})}>
          {restoring ? "Restoring…" : "Restore"}
        </button>
      </div>
    );
  }

  // Tiny status line; safe to render. Never log keys/passphrase.
  return (
    <div className="muted" style={{ position: "fixed", bottom: 6, right: 8, fontSize: 11 }}>
      🔒 {device ? `device ${device.id.slice(0, 8)}` : checkingRestore ? "checking…" : "starting…"}
    </div>
  );
}
