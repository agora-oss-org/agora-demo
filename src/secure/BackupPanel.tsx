import { useState } from "react";
import { useSecureBackup } from "@agora-sdk/secure-chat-react-js";

// Backup seals ALL local key material (identity + every group's MLS state) under an argon2id+AEAD
// envelope and uploads the opaque blob to the blind server. needsBackup flips true when a group
// advances (re-backup recommended). Restore/eviction-recovery lives in SecureBootstrap; this panel is
// only the manual "back up now" + "re-backup needed" surface.
export default function BackupPanel() {
  const { backup, backingUp, needsBackup, lastBackupAt, error, estimateStrength } = useSecureBackup() as any;
  const [pass, setPass] = useState("");
  const [open, setOpen] = useState(false);
  const strength = pass ? estimateStrength(pass) : null;

  return (
    <div className="panel col">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <strong>🗝️ Encrypted backup</strong>
        <button className="linklike" onClick={() => setOpen((o) => !o)}>{open ? "hide" : "manage"}</button>
      </div>
      <div className="muted">
        {needsBackup
          ? "⚠️ chats changed since your last backup — back up again."
          : lastBackupAt
            ? `last backup: ${new Date(lastBackupAt).toLocaleString()}`
            : "no backup yet"}
      </div>
      {open && (
        <div className="col" style={{ gap: 6 }}>
          <input type="password" placeholder="choose a strong passphrase" value={pass}
                 onChange={(e) => setPass(e.target.value)} />
          {strength && (
            <div className="muted">
              strength: {strength.label} ({strength.score}/4){strength.warning ? ` — ${strength.warning}` : ""}
            </div>
          )}
          {error ? <div className="error">{String((error as Error)?.message ?? error)}</div> : null}
          <button className="primary" disabled={backingUp || !pass}
                  onClick={() => backup(pass).then(() => setPass("")).catch(() => {})}>
            {backingUp ? "Sealing…" : "Back up now"}
          </button>
          <div className="muted">
            Lose this passphrase and your chats are unrecoverable — the server only holds ciphertext.
          </div>
        </div>
      )}
    </div>
  );
}
