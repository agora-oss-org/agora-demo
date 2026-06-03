import { useEffect, useState } from "react";
import {
  useFetchConnections, useFetchReceivedPendingConnections, useFetchSentPendingConnections,
  useAcceptConnection, useDeclineConnection, useRequestConnection, useRemoveConnection,
  useFetchUserByUsername, useSearchUsers, useUser,
} from "@agora-sdk/react-js";
import { track } from "./analytics";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Bidirectional connections (friend requests) via the connection action hooks
// (→ /v7/connections* + /v7/users/:id/connection, project derived from auth).
export default function Connections() {
  const fetchConnections = useFetchConnections() as any;
  const fetchPending = useFetchReceivedPendingConnections() as any;
  const fetchSent = useFetchSentPendingConnections() as any;
  const accept = useAcceptConnection() as any;
  const decline = useDeclineConnection() as any;
  const remove = useRemoveConnection() as any;
  const request = useRequestConnection() as any;
  const fetchUserByUsername = useFetchUserByUsername() as any;
  const userSearch = useSearchUsers() as any;
  const { user: me } = useUser() as any;

  const [established, setEstablished] = useState<any[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [sent, setSent] = useState<any[]>([]);
  const [userId, setUserId] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Typeahead: debounce the input and search users by username/name prefix (→ POST /search/users).
  // Skip while a result is already selected (the input holds the chosen @username then).
  useEffect(() => {
    const q = userId.trim().replace(/^@/, "");
    if (selectedId || q.length < 1 || UUID_RE.test(userId.trim())) {
      userSearch.reset?.();
      setShowResults(false);
      return;
    }
    const t = setTimeout(() => { userSearch.search({ query: q, limit: 8 }); setShowResults(true); }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, selectedId]);

  const refresh = async () => {
    try {
      const c = await fetchConnections({}); setEstablished(c?.data ?? []);
      const p = await fetchPending({}); setPending(p?.data ?? []);
      const s = await fetchSent({}); setSent(s?.data ?? []);
    } catch (e: any) { setMsg(e?.response?.data?.error || e?.message); }
  };
  // Connections aren't realtime (Replyke's socket layer is chat-only), so the other party
  // accepting won't push to us. Poll while this tab is mounted so accepted/incoming requests
  // appear within a few seconds without a manual refresh.
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 6000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickUser = (u: any) => {
    setUserId("@" + (u.username || u.id));
    setSelectedId(u.id);
    setShowResults(false);
    userSearch.reset?.();
  };

  const doRequest = async () => {
    const input = userId.trim();
    if (!input && !selectedId) return;
    try {
      // A typeahead pick gives us the id directly. Otherwise accept a raw UUID or a @username —
      // resolve the username to an id first (the connection request is keyed by user id).
      let targetId = selectedId || input;
      if (!selectedId && !UUID_RE.test(input)) {
        const u = await fetchUserByUsername({ username: input.replace(/^@/, "") });
        targetId = u.id;
      }
      await request({ userId: targetId, message: "Hi from the Agora demo!" });
      track("request_connection");
      setUserId(""); setSelectedId(null); setShowResults(false); userSearch.reset?.();
      setMsg("✓ request sent"); refresh();
    } catch (e: any) { setMsg(e?.response?.data?.error || e?.message); }
  };

  return (
    <div className="col">
      <div className="panel col">
        <strong>Request a connection</strong>
        <div className="row">
          <input
            placeholder="@username or user id"
            value={userId}
            onChange={(e) => { setUserId(e.target.value); setSelectedId(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") doRequest(); }}
          />
          <button className="primary" onClick={doRequest}>Request</button>
        </div>

        {showResults && !selectedId && (
          <div className="col" style={{ gap: 4 }}>
            {userSearch.loading && <div className="muted">searching…</div>}
            {!userSearch.loading && (userSearch.results?.length ?? 0) === 0 && (
              <div className="muted">no users match</div>
            )}
            {(userSearch.results ?? [])
              .map((r: any) => r.record)
              .filter((u: any) => u && u.id !== me?.id)
              .map((u: any) => (
                <div
                  key={u.id}
                  className="card row"
                  style={{ cursor: "pointer", marginBottom: 0 }}
                  onClick={() => pickUser(u)}
                >
                  <span>@{u.username || u.id.slice(0, 8)}</span>
                  {u.name && <span className="muted">{u.name}</span>}
                  <span className="spacer" />
                  <span className="muted">select →</span>
                </div>
              ))}
          </div>
        )}
        {selectedId && <div className="muted">will request {userId}</div>}
        {msg && <div className="muted">{msg}</div>}
      </div>

      <div className="panel col">
        <strong>Pending requests (received) — {pending.length}</strong>
        {pending.map((p) => (
          <div key={p.id} className="card row">
            <span>@{p.user?.username || p.user?.id?.slice(0, 8)} wants to connect{p.message ? `: "${p.message}"` : ""}</span>
            <span className="spacer" />
            <button className="primary" onClick={async () => { await accept({ connectionId: p.id }); track("accept_connection"); refresh(); }}>Accept</button>
            <button onClick={async () => { await decline({ connectionId: p.id }); track("decline_connection"); refresh(); }}>Decline</button>
          </div>
        ))}
        {pending.length === 0 && <div className="muted">none</div>}
      </div>

      <div className="panel col">
        <strong>Pending requests (sent) — {sent.length}</strong>
        {sent.map((p) => (
          <div key={p.id} className="card row">
            <span>→ @{p.user?.username || p.user?.id?.slice(0, 8)}{p.message ? `: "${p.message}"` : ""}</span>
            <span className="spacer" />
            <button onClick={async () => { await remove({ connectionId: p.id }); track("cancel_request"); refresh(); }}>Cancel</button>
          </div>
        ))}
        {sent.length === 0 && <div className="muted">none</div>}
      </div>

      <div className="panel col">
        <strong>Connections — {established.length}</strong>
        {established.map((c) => (
          <div key={c.id} className="card">@{c.connectedUser?.username || c.connectedUser?.id?.slice(0, 8)}</div>
        ))}
        {established.length === 0 && <div className="muted">none yet</div>}
      </div>
    </div>
  );
}
