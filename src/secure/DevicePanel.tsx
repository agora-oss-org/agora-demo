import { useState } from "react";
import { useSecureDevice } from "@agora-sdk/secure-chat-react-js";

// KeyPackages are single-use MLS pre-keys uploaded to the server. When a peer adds your device
// to a conversation they consume one; if the supply runs out they can't add you. The SDK +
// SecureBootstrap handle automatic replenishment, but this panel exposes the manual surface so
// the compat harness can exercise count-refresh, targeted top-ups, and bulk-publish.
export default function DevicePanel() {
  const {
    device,
    keyPackagesAvailable,
    refreshKeyPackageCount,
    checkAndReplenish,
    publishKeyPackages,
    error,
  } = useSecureDevice() as any;

  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch {
      /* errors surface via `error` from the hook */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel col">
      <strong>🔐 Device &amp; KeyPackages</strong>

      {device ? (
        <div className="col" style={{ gap: 4 }}>
          <div className="row" style={{ gap: 12 }}>
            <span className="pill">{device.id.slice(0, 8)}</span>
            <span className="muted">ciphersuite&nbsp;{device.ciphersuite}</span>
            <span className="spacer" />
            <span className="muted">registered&nbsp;{new Date(device.createdAt).toLocaleDateString()}</span>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <span className="muted">KeyPackages available:</span>
            <strong>{keyPackagesAvailable ?? "…"}</strong>
          </div>
        </div>
      ) : (
        <div className="muted">no device yet</div>
      )}

      {error ? (
        <div className="error">{String((error as Error)?.message ?? error)}</div>
      ) : null}

      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <button
          disabled={!device || busy}
          onClick={() => run(() => refreshKeyPackageCount())}
        >
          Refresh count
        </button>
        <button
          className="primary"
          disabled={!device || busy}
          onClick={() => run(() => checkAndReplenish())}
        >
          Replenish
        </button>
        <button
          disabled={!device || busy}
          onClick={() => run(() => publishKeyPackages(20))}
        >
          Publish 20
        </button>
      </div>
    </div>
  );
}
