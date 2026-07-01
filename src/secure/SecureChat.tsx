import { useEffect, useMemo, useState } from "react";
import { useFetchConnections, useUser } from "@agora-sdk/react-js";
import { useSecureConversations } from "@agora-sdk/secure-chat-react-js";
import { track } from "../analytics";
import SecureThread from "./SecureThread";
import SecureStorePanel from "./SecureStorePanel";
import DevicePanel from "./DevicePanel";

// username → name → id-slice, matching AuthorTag's convention (EntityView.tsx).
function displayName(u: any): string {
  return u?.username || u?.name || u?.id?.slice(0, 8) || "unknown";
}

// The E2EE chat surface (see Chat.tsx for the non-encrypted socket.io equivalent). A
// connection-picker starts DMs, but createDirectConversation runs the MLS handshake under the
// hood (claim a KeyPackage per peer device → build the group locally → relay targeted Welcomes); the
// group secrets never leave the client. SecureConversationModel carries no counterparty field (only
// `createdById`), so titles are resolved best-effort: conversations the *peer* started are matched
// via `createdById` against the connections list; conversations *we* started are remembered locally
// (peerNames) since we know the target right when we create them. Either miss falls back to the id.
export default function SecureChat() {
  const { conversations, loading, createDirectConversation, refresh, error } = useSecureConversations() as any;
  const fetchConnections = useFetchConnections() as any;
  const { user } = useUser() as any;
  const [contacts, setContacts] = useState<any[]>([]);
  const [peerNames, setPeerNames] = useState<Record<string, string>>({});
  const [target, setTarget] = useState("");
  const [active, setActive] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchConnections({}).then((r: any) => setContacts(r?.data ?? [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const contactsById = useMemo(() => {
    const map = new Map<string, any>();
    for (const c of contacts) if (c.connectedUser?.id) map.set(c.connectedUser.id, c.connectedUser);
    return map;
  }, [contacts]);

  const conversationLabel = (c: any): string => {
    if (peerNames[c.id]) return peerNames[c.id];
    const peerId = c.createdById && c.createdById !== user?.id ? c.createdById : null;
    const peer = peerId ? contactsById.get(peerId) : undefined;
    return peer ? displayName(peer) : c.id.slice(0, 8);
  };

  const startDm = async () => {
    if (!target) return;
    setBusy(true);
    try {
      const peer = contactsById.get(target);
      const convo = await createDirectConversation(target);
      track("create_dm", { secure: true });
      await refresh();
      if (peer) setPeerNames((prev) => ({ ...prev, [convo.id]: displayName(peer) }));
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
        <SecureStorePanel />
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
                  @{displayName(c.connectedUser)}
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
                <strong>🔒 {conversationLabel(c)}</strong>
                <div className="muted">{c.type}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="spacer" style={{ flex: 1 }}>
          {active
            ? (
              <SecureThread
                key={active}
                conversationId={active}
                myUserId={user?.id}
                peerLabel={(() => {
                  const c = conversations.find((x: any) => x.id === active);
                  return c ? conversationLabel(c) : undefined;
                })()}
              />
            )
            : <div className="panel muted">Select or start a secure DM →</div>}
        </div>
      </div>
    </div>
  );
}
