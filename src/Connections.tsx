import { useEffect, useState } from "react";
import {
  useFetchConnections, useFetchReceivedPendingConnections,
  useAcceptConnection, useDeclineConnection, useRequestConnection,
} from "@agora/react-js";

// Bidirectional connections (friend requests) via the connection action hooks
// (→ /v7/connections* + /v7/users/:id/connection, project derived from auth).
export default function Connections() {
  const fetchConnections = useFetchConnections() as any;
  const fetchPending = useFetchReceivedPendingConnections() as any;
  const accept = useAcceptConnection() as any;
  const decline = useDeclineConnection() as any;
  const request = useRequestConnection() as any;

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
  useEffect(() => { refresh(); /* eslint-disable-line */ }, []);

  const doRequest = async () => {
    if (!userId.trim()) return;
    try { await request({ userId, message: "Hi from the Agora demo!" }); setUserId(""); setMsg("✓ request sent"); refresh(); }
    catch (e: any) { setMsg(e?.response?.data?.error || e?.message); }
  };

  return (
    <div className="col">
      <div className="panel col">
        <strong>Request a connection</strong>
        <div className="row">
          <input placeholder="user id (uuid)" value={userId} onChange={(e) => setUserId(e.target.value)} />
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
