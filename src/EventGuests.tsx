import { useEffect, useState } from "react";
import {
  useFetchUser, useSearchUsers, useUser,
  useAddHost, useRemoveHost, useAddInvite, useRemoveInvite,
  useFetchInvitees, useFetchEventRsvps,
} from "@agora-sdk/react-js";
import { AuthorTag } from "./EntityView";
import { track } from "./analytics";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RSVP_STATUSES = ["all", "going", "maybe", "not_going"] as const;

// Debounced username/name typeahead — a verbatim adaptation of Connections.tsx's pattern, kept as
// its own local copy rather than extracted into a shared component (avoids an unrelated refactor
// of Connections.tsx for this feature). Resolves to a picked user id.
function UserPicker({ onPick, excludeUserIds }: { onPick: (userId: string) => void; excludeUserIds?: string[] }) {
  const search = useSearchUsers() as any;
  const fetchUser = useFetchUser() as any;
  const { user: me } = useUser() as any;
  const [query, setQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [uuidLoading, setUuidLoading] = useState(false);
  const [uuidError, setUuidError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim().replace(/^@/, "");
    if (q.length < 1) {
      search.reset?.();
      setShowResults(false);
      setUuidError(null);
      return;
    }
    if (UUID_RE.test(query.trim())) {
      setShowResults(false);
      search.reset?.();
      setUuidLoading(true);
      setUuidError(null);
      fetchUser({ userId: q }).then((u: any) => {
        setUuidLoading(false);
        if (u) { onPick(u.id); setQuery(""); } else { setUuidError("user not found"); }
      }).catch(() => { setUuidLoading(false); setUuidError("user not found"); });
      return;
    }
    setUuidError(null);
    const t = setTimeout(() => { search.search({ query: q, limit: 8 }); setShowResults(true); }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const pick = (u: any) => {
    onPick(u.id);
    setQuery("");
    setShowResults(false);
    search.reset?.();
  };

  return (
    <div className="col" style={{ gap: 4 }}>
      <input placeholder="@username or user id" value={query} onChange={(e) => setQuery(e.target.value)} />
      {(showResults || uuidLoading || uuidError) && (
        <div className="col" style={{ gap: 4 }}>
          {uuidLoading && <div className="muted">resolving user…</div>}
          {uuidError && <div className="muted error">{uuidError}</div>}
          {showResults && (
            <>
              {search.loading && <div className="muted">searching…</div>}
              {!search.loading && (search.results?.length ?? 0) === 0 && <div className="muted">no users match</div>}
              {(search.results ?? [])
                .map((r: any) => r.record)
                .filter((u: any) => u && u.id !== me?.id && !excludeUserIds?.includes(u.id))
                .map((u: any) => (
                  <div key={u.id} className="card row" style={{ cursor: "pointer", marginBottom: 0 }} onClick={() => pick(u)}>
                    <span>@{u.username || u.id.slice(0, 8)}</span>
                    {u.name && <span className="muted">{u.name}</span>}
                    <span className="spacer" />
                    <span className="muted">select →</span>
                  </div>
                ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function HostRow({ userId, canRemove, onRemove }: { userId: string; canRemove: boolean; onRemove: () => void }) {
  const fetchUser = useFetchUser() as any;
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    let alive = true;
    fetchUser({ userId }).then((u: any) => { if (alive) setUser(u); }).catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return (
    <div className="card row">
      {user ? <AuthorTag user={user} prefix="" /> : <span className="muted">{userId.slice(0, 8)}…</span>}
      <span className="spacer" />
      <button disabled={!canRemove} title={canRemove ? undefined : "an event needs at least one host"} onClick={onRemove}>
        remove
      </button>
    </div>
  );
}

// Host-only guest management: co-host add/remove, invite add/remove, and the named RSVP/invitee
// lists. Rendered by EventView.tsx only when the viewer is a host. `onEventChange` re-syncs the
// parent's event state after host add/remove — those hooks return the updated Event but aren't
// tied to the EventContext the way updateEvent/cancelEvent/setRsvp are (SDK gotcha #2).
export default function EventGuests({
  eventId,
  hostIds,
  onEventChange,
}: {
  eventId: string;
  hostIds: string[];
  onEventChange: (event: any) => void;
}) {
  const addHost = useAddHost() as any;
  const removeHost = useRemoveHost() as any;
  const addInvite = useAddInvite() as any;
  const removeInvite = useRemoveInvite() as any;
  const fetchInvitees = useFetchInvitees() as any;
  const fetchRsvps = useFetchEventRsvps() as any;

  const [hostError, setHostError] = useState<string | null>(null);
  const [invitees, setInvitees] = useState<any[]>([]);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [rsvpStatus, setRsvpStatus] = useState<(typeof RSVP_STATUSES)[number]>("all");
  const [rsvps, setRsvps] = useState<any[]>([]);

  const refreshInvitees = async () => {
    try {
      const res = await fetchInvitees({ eventId, limit: 50 });
      setInvitees(res?.data ?? []);
    } catch (e: any) { setInviteError(e?.response?.data?.error || e?.message); }
  };
  const refreshRsvps = async (status: (typeof RSVP_STATUSES)[number] = rsvpStatus) => {
    try {
      const res = await fetchRsvps({ eventId, limit: 50, ...(status === "all" ? {} : { status }) });
      setRsvps(res?.data ?? []);
    } catch { /* guest list is best-effort display */ }
  };

  useEffect(() => {
    refreshInvitees();
    refreshRsvps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const doAddHost = async (userId: string) => {
    setHostError(null);
    try {
      const updated = await addHost({ eventId, userId });
      onEventChange(updated);
      track("add_host");
    } catch (e: any) { setHostError(e?.response?.data?.error || e?.message || "Couldn't add host"); }
  };
  const doRemoveHost = async (userId: string) => {
    setHostError(null);
    try {
      const updated = await removeHost({ eventId, userId });
      onEventChange(updated);
      track("remove_host");
    } catch (e: any) { setHostError(e?.response?.data?.error || e?.message || "Couldn't remove host"); }
  };
  const doAddInvite = async (userId: string) => {
    setInviteError(null);
    try {
      await addInvite({ eventId, userId });
      track("add_invite");
      refreshInvitees();
    } catch (e: any) { setInviteError(e?.response?.data?.error || e?.message || "Couldn't add invite"); }
  };
  const doRemoveInvite = async (userId: string) => {
    setInviteError(null);
    try {
      await removeInvite({ eventId, userId });
      track("remove_invite");
      refreshInvitees();
    } catch (e: any) { setInviteError(e?.response?.data?.error || e?.message || "Couldn't remove invite"); }
  };

  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="panel col">
        <strong>Hosts ({hostIds.length})</strong>
        {hostIds.map((id) => (
          <HostRow key={id} userId={id} canRemove={hostIds.length > 1} onRemove={() => doRemoveHost(id)} />
        ))}
        <label className="muted">add a co-host</label>
        <UserPicker onPick={doAddHost} excludeUserIds={hostIds} />
        {hostError && <div className="error">{hostError}</div>}
      </div>

      <div className="panel col">
        <strong>Invites ({invitees.length})</strong>
        {invitees.map((inv: any) => (
          <div key={inv.id} className="card row">
            {inv.user ? <AuthorTag user={inv.user} prefix="" /> : <span className="muted">{inv.userId.slice(0, 8)}…</span>}
            <span className="spacer" />
            <button onClick={() => doRemoveInvite(inv.userId)}>remove</button>
          </div>
        ))}
        {invitees.length === 0 && <div className="muted">none yet</div>}
        <label className="muted">invite someone</label>
        <UserPicker onPick={doAddInvite} excludeUserIds={invitees.map((inv) => inv.userId)} />
        {inviteError && <div className="error">{inviteError}</div>}
      </div>

      <div className="panel col">
        <div className="row">
          <strong>Guest list ({rsvps.length})</strong>
          <span className="spacer" />
          <label className="muted">status</label>
          <select
            value={rsvpStatus}
            onChange={(e) => {
              const next = e.target.value as (typeof RSVP_STATUSES)[number];
              setRsvpStatus(next);
              refreshRsvps(next);
            }}
            style={{ width: "auto" }}
          >
            {RSVP_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {rsvps.map((r: any) => (
          <div key={r.id} className="card row">
            {r.user ? <AuthorTag user={r.user} prefix="" /> : <span className="muted">{r.userId.slice(0, 8)}…</span>}
            <span className="spacer" />
            <span className="pill">{r.status}</span>
          </div>
        ))}
        {rsvps.length === 0 && <div className="muted">no RSVPs yet</div>}
      </div>
    </div>
  );
}
