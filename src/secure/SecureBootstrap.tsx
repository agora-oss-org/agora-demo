import { useEffect } from "react";
import { useSecureDevice, useSecureHandshakes } from "@agora-sdk/secure-chat-react-js";

// Always-mounted (inside the now-unlocked secure provider), mostly headless: brings the device online
// and keeps the /secure inbox draining so Welcomes/messages arrive live and on reload. A fresh or
// cleared client (Safari ITP, "clear browsing data") simply registers a new identity; at-rest
// protection of the local keys/history is handled by the EncryptedStore (SecureChatGate).
export default function SecureBootstrap() {
  const { device, loading, register } = useSecureDevice() as any;

  // Auto-register exactly once, after the device load settles.
  useEffect(() => {
    if (loading || device) return;
    register().catch(() => {});
  }, [loading, device, register]);

  // Drain the handshake inbox for the registered device (Welcomes + Commits, seq-ordered).
  useSecureHandshakes({ deviceId: device?.id });

  // Tiny status line; safe to render. Never log keys/passphrase.
  return (
    <div className="muted" style={{ position: "fixed", bottom: 6, right: 8, fontSize: 11 }}>
      🔒 {device ? `device ${device.id.slice(0, 8)}` : loading ? "starting…" : "registering…"}
    </div>
  );
}
