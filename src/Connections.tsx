import { useEffect, useState } from "react";
import {
  useFetchConnections, useFetchReceivedPendingConnections,
  useAcceptConnection, useDeclineConnection, useRequestConnection,
  useFetchUserByUsername,
} from "@agora/react-js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Bidirectional connections (friend requests) via the connection action hooks
// (→ /v7/connections* + /v7/users/:id/connection, project derived from auth).
export default function Connections() {
  const fetchConnections = useFetchConnections() as any;
  const fetchPending = useFetchReceivedPendingConnections() as any;
  const accept = useAcceptConnection() as any;
  const decline = useDeclineConnection() as any;
  const request = useRequestConnection() as any;
  const fetchUserByUsername = useFetchUserByUsername() as any;

  const [established, setEstablished] = useState<any[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [userId, setUserId] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const c = await fetchConnections({}); setEstablished(c?.data ?? []);
      const p = await fetchPending({}); setPending(p?.data ?? []);
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

  const doRequest = async () => {
    const input = userId.trim();
    if (!input) return;
    try {
      // Accept a raw UUID or a @username — resolve the username to an id first (the server's
      // connection request is keyed by user id, per the SDK/Replyke contract).
      let targetId = input;
      if (!UUID_RE.test(input)) {
        const u = await fetchUserByUsername({ username: input.replace(/^@/, "") });
        targetId = u.id;
      }
      await request({ userId: targetId, message: "Hi from the Agora demo!" });
      setUserId(""); setMsg("✓ request sent"); refresh();
    } catch (e: any) { setMsg(e?.response?.data?.error || e?.message); }
  };

  return (
    <div className="col">
      <div className="panel col">
        <strong>Request a connection</strong>
        <div className="row">
          <input placeholder="@username or user id" value={userId} onChange={(e) => setUserId(e.target.value)} />
          <button className="primary" onClick={doRequest}>Request</button>
        </div>
        {msg && <div className="muted">{msg}</div>}
      </div>

      <div className="panel col">
        <strong>Pending requests (received) — {pending.length}</strong>
        {pending.map((p) => (
          <div key={p.id} className="card row">
            <span>@{p.user?.username || p.user?.id?.slice(0, 8)} wants to connect{p.message ? `: "${p.message}"` : ""}</span>
            <span className="spacer" />
            <button className="primary" onClick={async () => { await accept({ connectionId: p.id }); refresh(); }}>Accept</button>
            <button onClick={async () => { await decline({ connectionId: p.id }); refresh(); }}>Decline</button>
          </div>
        ))}
        {pending.length === 0 && <div className="muted">none</div>}
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
