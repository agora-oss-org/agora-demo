import { useEffect, useState } from "react";
import { useFetchConnections, useUser } from "@agora-sdk/react-js";
import { useSecureConversations } from "@agora-sdk/secure-chat-react-js";
import { track } from "../analytics";
import SecureThread from "./SecureThread";
import BackupPanel from "./BackupPanel";
import DevicePanel from "./DevicePanel";

// Mirrors Chat.tsx's connection-picker, but createDirectConversation runs the MLS handshake under the
// hood (claim a KeyPackage per peer device → build the group locally → relay targeted Welcomes); the
// group secrets never leave the client. The list comes from the blind server; titles fall back to ids
// (the demo doesn't resolve secure rosters to handles).
export default function SecureChat() {
  const { conversations, loading, createDirectConversation, refresh, error } = useSecureConversations() as any;
  const fetchConnections = useFetchConnections() as any;
  const { user } = useUser() as any;
  const [contacts, setContacts] = useState<any[]>([]);
  const [target, setTarget] = useState("");
  const [active, setActive] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchConnections({}).then((r: any) => setContacts(r?.data ?? [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startDm = async () => {
    if (!target) return;
    setBusy(true);
    try {
      const convo = await createDirectConversation(target);
      track("create_dm", { secure: true });
      await refresh();
      setActive(convo.id);
      setTarget("");
    } catch {
      /* error surfaces via the hook's `error` */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="row" style={{ gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <BackupPanel />
        <DevicePanel />
      </div>
      <div className="row" style={{ alignItems: "flex-start", gap: 16 }}>
        <div className="panel col" style={{ width: 300 }}>
          <div className="brand">🔒 Secure DMs</div>
          <div className="row">
            <select value={target} onChange={(e) => setTarget(e.target.value)} style={{ flex: 1 }}>
              <option value="">{contacts.length ? "encrypt a DM with…" : "no connections yet"}</option>
              {contacts.map((c: any) => (
                <option key={c.id} value={c.connectedUser?.id}>
                  @{c.connectedUser?.username || c.connectedUser?.id?.slice(0, 8)}
                </option>
              ))}
            </select>
            <button className="primary" disabled={!target || busy} onClick={startDm}>🔐</button>
          </div>
          {error ? <div className="error">{String((error as Error)?.message ?? error)}</div> : null}
          <div className="muted">{loading ? "Loading…" : `${conversations.length} conversations`}</div>
          <div className="scroll col">
            {conversations.map((c: any) => (
              <div key={c.id} className={"card" + (active === c.id ? " mine" : "")}
                   style={{ cursor: "pointer", marginBottom: 6 }} onClick={() => setActive(c.id)}>
                <strong>🔒 {c.id.slice(0, 8)}</strong>
                <div className="muted">{c.type}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="spacer" style={{ flex: 1 }}>
          {active
            ? <SecureThread key={active} conversationId={active} myUserId={user?.id} />
            : <div className="panel muted">Select or start a secure DM →</div>}
        </div>
      </div>
    </div>
  );
}
