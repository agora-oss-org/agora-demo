import { useEffect, useState } from "react";
import {
  useConversations,
  useChatContext,
  useUser,
  useFetchConnections,
  useCreateDirectConversation,
  useConversationMembers,
  ConversationProvider,
  useConversationContext,
} from "@agora-sdk/react-js";

// Realtime chat. The list comes from useConversations; the open thread is wrapped in
// ConversationProvider, which (a) joins the socket.io room so message:created events arrive live
// and (b) exposes messages/send/loadOlder via useConversationContext. The socket itself is managed
// by ChatProvider (App.tsx). Open two tabs as the same user to watch live cross-client delivery.
export default function Chat() {
  const { conversations, loading, createGroup, refresh } = useConversations({ types: ["direct", "group", "space"] }) as any;
  const { connected } = useChatContext() as any;
  const fetchConnections = useFetchConnections() as any;
  const createDirect = useCreateDirectConversation() as any;
  const { user } = useUser() as any;
  const [active, setActive] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [contacts, setContacts] = useState<any[]>([]);
  const [dmTarget, setDmTarget] = useState("");
  // Direct conversations have no name; remember the partner's handle for ones we open this session.
  const [dmLabels, setDmLabels] = useState<Record<string, string>>({});

  // Load the user's established connections to populate the "DM a connection" picker.
  useEffect(() => {
    fetchConnections({}).then((r: any) => setContacts(r?.data ?? [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const create = async () => {
    const convo = await createGroup({ name: name || `Demo group ${Date.now() % 1000}` });
    setName("");
    await refresh?.();
    if (convo?.id) setActive(convo.id);
  };

  // Get-or-create a 1:1 direct conversation with a connected user, then open it.
  const startDm = async () => {
    if (!dmTarget) return;
    const contact = contacts.find((c: any) => c.connectedUser?.id === dmTarget);
    const handle = "@" + (contact?.connectedUser?.username || dmTarget.slice(0, 8));
    const convo = await createDirect({ userId: dmTarget });
    setDmTarget("");
    await refresh?.();
    if (convo?.id) {
      setDmLabels((m) => ({ ...m, [convo.id]: handle }));
      setActive(convo.id);
    }
  };

  // A readable title: explicit name → remembered DM partner → "direct message" → type.
  const labelFor = (c: any): string =>
    c?.name || dmLabels[c?.id] || (c?.type === "direct" ? "direct message" : c?.type) || "conversation";

  const activeConvo = (conversations ?? []).find((c: any) => c.id === active);

  return (
    <div className="row" style={{ alignItems: "flex-start", gap: 16 }}>
      <div className="panel col" style={{ width: 300 }}>
        <div className="row">
          <span className={"dot " + (connected ? "on" : "off")} />
          <span className="muted">socket {connected ? "connected" : "disconnected"}</span>
        </div>
        <div className="row">
          <input placeholder="new group name" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="primary" onClick={create}>+</button>
        </div>
        <div className="row">
          <select value={dmTarget} onChange={(e) => setDmTarget(e.target.value)} style={{ flex: 1 }}>
            <option value="">{contacts.length ? "DM a connection…" : "no connections yet"}</option>
            {contacts.map((c: any) => (
              <option key={c.id} value={c.connectedUser?.id}>
                @{c.connectedUser?.username || c.connectedUser?.id?.slice(0, 8)}
              </option>
            ))}
          </select>
          <button className="primary" onClick={startDm} disabled={!dmTarget}>💬</button>
        </div>
        <div className="muted">{loading ? "Loading…" : `${conversations?.length ?? 0} conversations`}</div>
        <div className="scroll col">
          {(conversations ?? []).map((c: any) => (
            <div key={c.id} className={"card" + (active === c.id ? " mine" : "")} style={{ cursor: "pointer", marginBottom: 6 }} onClick={() => setActive(c.id)}>
              <strong>
                {c.type === "direct"
                  ? <DirectLabel conversationId={c.id} myId={user?.id} fallback={labelFor(c)} />
                  : labelFor(c)}
              </strong>
              <div className="muted">{c.lastMessage?.content ?? "no messages yet"}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="spacer" style={{ flex: 1 }}>
        {active ? (
          // key=active remounts the provider (re-joins the room) when switching conversations.
          <ConversationProvider key={active} conversationId={active}>
            <Conversation convo={activeConvo} fallback={labelFor(activeConvo)} />
          </ConversationProvider>
        ) : (
          <div className="panel muted">Select or create a conversation →</div>
        )}
      </div>
    </div>
  );
}

function Conversation({ convo, fallback }: { convo: any; fallback: string }) {
  const { user } = useUser() as any;
  // useConversationContext (from ConversationProvider) exposes messages/send/… AND members (the
  // provider loads them), so we can title a DM with the other participant — no server change needed.
  const { messages, send, loadOlder, hasMore, mark, members } = useConversationContext() as any;
  const [text, setText] = useState("");

  // Title: explicit group name → the DM partner's handle (from members) → caller's fallback.
  const partner = convo?.type === "direct" ? (members ?? []).find((m: any) => m.userId !== user?.id) : null;
  const title = convo?.name
    || (partner ? "@" + (partner.user?.username || partner.userId?.slice(0, 8)) : fallback);

  // Mark the newest message as read whenever the thread grows.
  useEffect(() => {
    const newest = messages?.[messages.length - 1];
    if (newest?.id) mark?.({ messageId: newest.id });
  }, [messages?.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (!text.trim()) return;
    const t = text; setText("");
    await send({ content: t });
  };

  return (
    <div className="panel col" style={{ height: 460 }}>
      <strong>{title}</strong>
      {hasMore && <button onClick={() => loadOlder()}>Load older</button>}
      <div className="scroll col" style={{ flex: 1 }}>
        {/* SDK returns messages newest-first; reverse for chronological top-to-bottom display. */}
        {[...(messages ?? [])].reverse().map((m: any) => (
          <div key={m.id} className={"msg" + (m.userId === user?.id ? " mine" : "")}>
            <div>{m.content}</div>
            <div className="muted">{m.userId === user?.id ? "you" : (m.userId?.slice(0, 8) || "system")} · {new Date(m.createdAt).toLocaleTimeString()}</div>
          </div>
        ))}
      </div>
      <div className="row">
        <input placeholder="message…" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
        <button className="primary" onClick={submit}>Send</button>
      </div>
    </div>
  );
}

// Resolves a direct conversation's sidebar label to the OTHER participant's handle by fetching its
// members (the conversation-list payload only carries the current user, per the Replyke contract).
// One members fetch per DM card — fine at demo scale. Falls back until members load.
function DirectLabel({ conversationId, myId, fallback }: { conversationId: string; myId?: string; fallback: string }) {
  const { members } = useConversationMembers({ conversationId }) as any;
  const partner = (members ?? []).find((m: any) => m.userId !== myId);
  return <>{partner ? "@" + (partner.user?.username || partner.userId?.slice(0, 8)) : fallback}</>;
}
