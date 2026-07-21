import { useState } from "react";
import { useSecureMessages } from "@agora-sdk/secure-chat-react-js";
import { track } from "../analytics";
import SafetyNumberModal from "./SafetyNumberModal";
import MarkdownBody from "../MarkdownBody";

// Renders decrypted text for one secure conversation; messages that fail decryption fail CLOSED —
// never raw bytes (see status handling below). SDK returns newest-first, so we reverse for display.
// "Mine" is decided by senderUserId === myUserId (secure messages DO carry a sender user id).
export default function SecureThread({
  conversationId, myUserId, peerLabel,
}: { conversationId: string; myUserId?: string; peerLabel?: string }) {
  const { messages, hasMore, loadMore, sendMessage, error } = useSecureMessages(conversationId) as any;
  const [text, setText] = useState("");
  const [showSafety, setShowSafety] = useState(false);
  const [sending, setSending] = useState(false);

  const submit = async () => {
    const t = text.trim();
    if (!t) return;
    setText("");
    setSending(true);
    try {
      await sendMessage(t);
      track("send_message", { secure: true });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="panel col" style={{ height: 480 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <strong>🔒 {peerLabel || conversationId.slice(0, 8)}</strong>
        <button className="linklike" onClick={() => setShowSafety(true)} title="verify identity keys">
          🔢 safety number
        </button>
      </div>
      {showSafety && <SafetyNumberModal conversationId={conversationId} onClose={() => setShowSafety(false)} />}
      {hasMore && <button onClick={() => loadMore()}>Load older</button>}
      {error ? <div className="error">{String((error as Error)?.message ?? error)}</div> : null}
      <div className="scroll col" style={{ flex: 1 }}>
        {/* SDK returns newest-first; reverse for chronological display. */}
        {[...messages].reverse().map((m: any) => {
          const mine = !!(m.model.senderUserId && myUserId && m.model.senderUserId === myUserId);
          return (
            <div key={m.model.id} className={"msg" + (mine ? " mine" : "")}>
              {m.status === "ok" &&
                (m.content?.deleted
                  ? <div className="muted">🗑️ message deleted</div>
                  // Markdown display is render-side only and fully local (sanitized, img/script
                  // stripped — nothing fetched at view time), so it's safe on decrypted bodies.
                  // Deliberately NO mentions array (secure messages don't persist one) and the
                  // authoring input stays a bare <input> — Composer's mention typeahead would
                  // stream pre-encryption plaintext fragments to the server, and GIFs would leak
                  // third-party CDN fetches out of the E2EE envelope.
                  : <MarkdownBody content={m.content?.body} />)}
              {m.status === "pending" && <div className="muted">⏳ waiting for key update…</div>}
              {m.status === "rejected" && (
                <div className="error">⚠️ couldn't be verified{m.rejectedReason ? ` (${m.rejectedReason})` : ""}</div>
              )}
              <div className="muted">{new Date(m.model.createdAt).toLocaleTimeString()}</div>
            </div>
          );
        })}
      </div>
      <div className="row">
        <input placeholder="encrypted message…" value={text}
               onChange={(e) => setText(e.target.value)}
               onKeyDown={(e) => e.key === "Enter" && submit()} />
        <button className="primary" disabled={sending} onClick={submit}>Send 🔐</button>
      </div>
    </div>
  );
}
