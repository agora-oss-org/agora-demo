import { useEffect, useState } from "react";
import { useConversations, useConversationData, useChatContext, useUser } from "@agora/react-js";

// Realtime chat: useConversations (list/create) + useConversationData (messages/send) over the
// socket.io connection managed by ChatProvider. Open two tabs to see live cross-client delivery.
export default function Chat() {
  const { conversations, loading, createGroup, refresh } = useConversations({ types: ["direct", "group", "space"] }) as any;
  const { connected } = useChatContext() as any;
  const [active, setActive] = useState<string | null>(null);
  const [name, setName] = useState("");

  const create = async () => {
    const convo = await createGroup({ name: name || `Demo group ${Date.now() % 1000}` });
    setName("");
    await refresh?.();
    if (convo?.id) setActive(convo.id);
  };

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
        <div className="muted">{loading ? "Loading…" : `${conversations?.length ?? 0} conversations`}</div>
        <div className="scroll col">
          {(conversations ?? []).map((c: any) => (
            <div key={c.id} className={"card" + (active === c.id ? " mine" : "")} style={{ cursor: "pointer", marginBottom: 6 }} onClick={() => setActive(c.id)}>
              <strong>{c.name || c.type || "conversation"}</strong>
              <div className="muted">{c.lastMessage?.content ?? "no messages yet"}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="spacer" style={{ flex: 1 }}>
        {active ? <Conversation conversationId={active} /> : <div className="panel muted">Select or create a conversation →</div>}
      </div>
    </div>
  );
}

function Conversation({ conversationId }: { conversationId: string }) {
  const { user } = useUser() as any;
  const cd = useConversationData({ conversationId }) as any;
  const { conversation, messages, sendMessage, loadMore, hasMore } = cd;
  const [text, setText] = useState("");

  useEffect(() => { cd.markAsRead?.(); }, [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    if (!text.trim()) return;
    const t = text; setText("");
    await sendMessage({ content: t });
  };

  return (
    <div className="panel col" style={{ height: 460 }}>
      <strong>{conversation?.name || "conversation"}</strong>
      {hasMore && <button onClick={() => loadMore()}>Load older</button>}
      <div className="scroll col" style={{ flex: 1 }}>
        {[...(messages ?? [])].reverse().map((m: any) => (
          <div key={m.id} className={"msg" + (m.userId === user?.id ? " mine" : "")}>
            <div>{m.content}</div>
            <div className="muted">{m.userId === user?.id ? "you" : (m.userId?.slice(0, 8) || "system")} · {new Date(m.createdAt).toLocaleTimeString()}</div>
          </div>
        ))}
      </div>
      <div className="row">
        <input placeholder="message…" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
        <button className="primary" onClick={send}>Send</button>
      </div>
    </div>
  );
}
