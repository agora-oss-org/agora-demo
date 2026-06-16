import { useSecureSafetyNumber } from "@agora-sdk/secure-chat-react-js";

// Out-of-band key verification: both people open this on their own device and confirm the 60 digits
// match. Equal numbers ⇒ each holds the other's real identity key (the blind-but-untrusted server
// didn't swap a KeyPackage). null ⇒ not a resolvable 1:1 DM yet (e.g. the peer hasn't joined). The
// number is symmetric (per-party fingerprints are sorted before hashing) so both sides compute the same.
export default function SafetyNumberModal({
  conversationId, onClose,
}: { conversationId: string; onClose: () => void }) {
  const { safetyNumber, loading, error, refresh } = useSecureSafetyNumber(conversationId);
  return (
    <div className="panel col" style={{ position: "fixed", inset: "25% 30%", zIndex: 50, gap: 12 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <strong>🔢 Safety number</strong>
        <button className="linklike" onClick={onClose}>✕</button>
      </div>
      <div className="muted">
        Compare these digits with your contact out-of-band. If they match, your chat is verified.
      </div>
      {loading && <div className="muted">Computing…</div>}
      {error ? <div className="error">{String((error as Error)?.message ?? error)}</div> : null}
      {!loading && !safetyNumber && (
        <div className="muted">Not a verifiable DM yet (waiting for the peer to join).</div>
      )}
      {safetyNumber && (
        <div className="card" style={{ fontFamily: "monospace", fontSize: 18, letterSpacing: 1 }}>
          {/* 12 groups of 5 → render as a 4-column grid (3 rows) for readability */}
          {safetyNumber.groups.map((g, i) => (
            <span key={i} style={{ display: "inline-block", width: "25%" }}>{g}</span>
          ))}
        </div>
      )}
      <button onClick={refresh}>Recompute</button>
    </div>
  );
}
