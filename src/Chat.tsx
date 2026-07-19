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
import { fileImageSrc } from "./EntityView";
import MarkdownBody from "./MarkdownBody";
import Composer from "./Composer";
import { track, trackPageView, PATHS } from "./analytics";

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
    track("create_group");
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
    track("create_dm");
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
            <Conversation
              convo={activeConvo}
              fallback={labelFor(activeConvo)}
              myId={user?.id}
              contacts={contacts}
              onLeave={async () => { await refresh?.(); setActive(null); }}
            />
          </ConversationProvider>
        ) : (
          <div className="panel muted">Select or create a conversation →</div>
        )}
      </div>
    </div>
  );
}

function Conversation({
  convo, fallback, myId, contacts, onLeave,
}: {
  convo: any; fallback: string; myId?: string; contacts?: any[]; onLeave?: () => void;
}) {
  const { user } = useUser() as any;
  // useConversationContext (from ConversationProvider) exposes messages/send/… AND members (the
  // provider loads them), so we can title a DM with the other participant — no server change needed.
  const { messages, send, loadOlder, hasMore, mark, members } = useConversationContext() as any;
  const [files, setFiles] = useState<File[]>([]);
  const [showMembers, setShowMembers] = useState(false);
  const isGroup = convo?.type === "group";

  // Title: explicit group name → the DM partner's handle (from members) → caller's fallback.
  const partner = convo?.type === "direct" ? (members ?? []).find((m: any) => m.userId !== user?.id) : null;
  const title = convo?.name
    || (partner ? "@" + (partner.user?.username || partner.userId?.slice(0, 8)) : fallback);

  // Mark the newest message as read whenever the thread grows.
  useEffect(() => {
    const newest = messages?.[messages.length - 1];
    if (newest?.id) mark?.({ messageId: newest.id });
  }, [messages?.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // One /conversation page view per opened thread (the provider is keyed by id, so this remounts
  // on every switch).
  useEffect(() => { trackPageView(PATHS.conversation); }, []);

  const submit = async ({ content, mentions, gif }: { content: string; mentions: any[]; gif?: any }) => {
    const f = files;
    setFiles([]);
    // useSendMessage switches to a multipart upload when `files` is present; file-only is allowed.
    // It carries `gif` and `mentions` over both the JSON and multipart paths.
    await send({
      ...(content ? { content } : {}),
      ...(mentions?.length ? { mentions } : {}),
      ...(gif ? { gif } : {}),
      ...(f.length ? { files: f } : {}),
    });
    track("send_message", {
      convo: convo?.type === "direct" ? "dm" : (convo?.type ?? "group"),
      hasFiles: f.length > 0,
    });
  };

  return (
    <div className="panel col" style={{ height: 460 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <strong>{title}</strong>
        {isGroup && (
          <button className="linklike" onClick={() => setShowMembers((s) => !s)} title="manage members">
            👥 {members?.length ?? 0}
          </button>
        )}
      </div>
      {/* Groups are private/member-scoped: people see the group only once an admin adds them.
          This panel (useConversationMembers.addMember/removeMember/leave) is what makes a group
          more than a solo room. */}
      {isGroup && showMembers && (
        <GroupMembers conversationId={convo.id} myId={myId} contacts={contacts} onLeave={onLeave} />
      )}
      {hasMore && <button onClick={() => loadOlder()}>Load older</button>}
      <div className="scroll col" style={{ flex: 1 }}>
        {/* SDK returns messages newest-first; reverse for chronological top-to-bottom display. */}
        {[...(messages ?? [])].reverse().map((m: any) => (
          <div key={m.id} className={"msg" + (m.userId === user?.id ? " mine" : "")}>
            <MarkdownBody content={m.content} mentions={m.mentions} />
            {m.gif && (
              <img
                src={m.gif.gifUrl}
                alt={m.gif.altText}
                style={{ maxWidth: "100%", maxHeight: 220, borderRadius: 8, marginTop: 4 }}
              />
            )}
            <MessageFiles files={m.files} />
            <div className="muted">{m.userId === user?.id ? "you" : (m.userId?.slice(0, 8) || "system")} · {new Date(m.createdAt).toLocaleTimeString()}</div>
          </div>
        ))}
      </div>
      <div className="col">
        <div className="row" style={{ alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            {/* submitOnEnter preserves the old single-line input's Enter-to-send; Shift+Enter now
                inserts a newline, which the old <input> couldn't do at all. */}
            <Composer
              onSubmit={submit}
              placeholder="message…"
              submitLabel="Send"
              rows={2}
              allowGif
              submitOnEnter
              analyticsTarget="chat"
              hasOtherContent={files.length > 0}
            />
          </div>
          <label title="attach files" style={{ cursor: "pointer", padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 8 }}>
            📎
            <input type="file" multiple style={{ display: "none" }} onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
          </label>
        </div>
        {files.length > 0 && (
          <div className="muted">📎 {files.map((f) => f.name).join(", ")} <button onClick={() => setFiles([])}>clear</button></div>
        )}
      </div>
    </div>
  );
}

// Group member management. Admins (the creator, and anyone they promote) add connections, remove
// members, or leave. Added members immediately see the group in their own conversation list (the
// server lists conversations you're a member of), which is the whole point — a group is only useful
// once you invite people. Uses useConversationMembers (addMember/removeMember/leave) — no SDK change.
function GroupMembers({
  conversationId, myId, contacts, onLeave,
}: {
  conversationId: string; myId?: string; contacts?: any[]; onLeave?: () => void;
}) {
  const { members, addMember, removeMember, leave } = useConversationMembers({ conversationId }) as any;
  // Read the current user here too (not just the passed prop) so we're resilient to a stale/late
  // prop (e.g. right after an OAuth round-trip the prop can lag the store).
  const { user } = useUser() as any;
  const me = user?.id ?? myId;
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const memberIds = new Set((members ?? []).map((m: any) => m.userId));
  const myMember = (members ?? []).find((m: any) => m.userId === me);
  const iAmAdmin = myMember?.role === "admin";
  // Show member-management unless we POSITIVELY know we're a non-admin member. If we can't identify
  // our own membership (id mismatch / user not loaded yet), still show it — the server enforces
  // admin-only and surfaces a clear error, so the creator is never locked out by a client glitch.
  const canManage = iAmAdmin || !myMember;
  // Connections not already in the group → candidates to add.
  const addable = (contacts ?? []).filter((c: any) => c.connectedUser?.id && !memberIds.has(c.connectedUser.id));

  const add = async () => {
    if (!pick) return;
    setBusy(true); setErr(null);
    try { await addMember({ userId: pick }); setPick(""); }
    catch (e: any) { setErr(e?.response?.data?.error || "Could not add member (admins only)"); }
    finally { setBusy(false); }
  };
  const doLeave = async () => { try { await leave(); onLeave?.(); } catch (e: any) { setErr(e?.message || "Could not leave"); } };

  return (
    <div className="col" style={{ borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)", padding: "8px 0", gap: 6 }}>
      <div className="muted">👥 {members?.length ?? 0} member{(members?.length ?? 0) === 1 ? "" : "s"}{iAmAdmin ? " · you're admin" : ""}</div>
      <div className="col" style={{ gap: 2 }}>
        {(members ?? []).map((m: any) => (
          <div key={m.userId} className="row" style={{ justifyContent: "space-between" }}>
            <span>@{m.user?.username || m.userId?.slice(0, 8)}{m.userId === me ? " (you)" : ""}{m.role === "admin" ? " · admin" : ""}</span>
            {canManage && m.userId !== me && (
              <button className="linklike" title="remove" onClick={() => removeMember({ userId: m.userId }).catch(() => {})}>✕</button>
            )}
          </div>
        ))}
      </div>
      {canManage && (
        <div className="col" style={{ gap: 4 }}>
          <div className="row">
            <select value={pick} onChange={(e) => setPick(e.target.value)} style={{ flex: 1 }}>
              <option value="">{addable.length ? "add a connection…" : "no connections to add"}</option>
              {addable.map((c: any) => (
                <option key={c.id} value={c.connectedUser.id}>
                  @{c.connectedUser?.username || c.connectedUser?.id?.slice(0, 8)}
                </option>
              ))}
            </select>
            <button className="primary" onClick={add} disabled={!pick || busy}>➕ add</button>
          </div>
          {!addable.length && (
            <div className="muted">Add connections in the 🤝 Connections tab first — group members are picked from your connections.</div>
          )}
        </div>
      )}
      {err && <div className="error">{err}</div>}
      <button onClick={doLeave}>Leave group</button>
    </div>
  );
}

// Render a chat message's attachments: images inline, other files as download links.
function MessageFiles({ files }: { files?: any[] }) {
  if (!files?.length) return null;
  return (
    <div className="col" style={{ gap: 4, marginTop: 4 }}>
      {files.map((f: any) => {
        const img = fileImageSrc(f);
        return img ? (
          <a key={f.id} href={f.originalPath} target="_blank" rel="noreferrer">
            <img src={img} alt="" style={{ maxWidth: 240, maxHeight: 240, borderRadius: 8, border: "1px solid var(--border)" }} />
          </a>
        ) : (
          <a key={f.id} href={f.originalPath} target="_blank" rel="noreferrer">
            📄 {(f.originalMimeType || "file")} ({Math.round((f.originalSize || 0) / 1024)} KB)
          </a>
        );
      })}
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
