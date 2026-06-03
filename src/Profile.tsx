import { useEffect, useState } from "react";
import { useUser, useCheckUsernameAvailability } from "@agora-sdk/react-js";
import { track } from "./analytics";

// Edit the current user's profile via useUser().updateUser → PATCH /users/:id (self-only on the
// server). Exercises the user-update SDK surface. The header shows @username, falling back to name,
// then the id slice — so setting a username/name here is what turns "@e8968a4e" into something human.
//
// Username availability is checked live via useCheckUsernameAvailability (→ GET /users/check-username),
// so the user learns a name is taken BEFORE saving (the server also enforces uniqueness, which is what
// surfaced as a bare "Update failed" before).
type AvailState =
  | { kind: "idle" }
  | { kind: "current" }   // unchanged from the user's own username — always fine
  | { kind: "checking" }
  | { kind: "available" }
  | { kind: "taken" }
  | { kind: "error"; msg: string };

export default function Profile() {
  const { user, updateUser, updating } = useUser() as any;
  const checkUsername = useCheckUsernameAvailability() as any;
  const [username, setUsername] = useState(user?.username ?? "");
  const [name, setName] = useState(user?.name ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [avatar, setAvatar] = useState(user?.avatar ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [avail, setAvail] = useState<AvailState>({ kind: "idle" });

  const currentUsername = (user?.username ?? "").trim();

  // Debounced availability check. The server's check-username reports a name as unavailable even
  // when *you* hold it, so short-circuit the unchanged case to "current" rather than calling the API.
  useEffect(() => {
    const u = username.trim();
    setMsg(null);
    if (!u) { setAvail({ kind: "idle" }); return; }                 // empty = clears the field, allowed
    if (u === currentUsername) { setAvail({ kind: "current" }); return; }
    setAvail({ kind: "checking" });
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const res = await checkUsername({ username: u });
        if (alive) setAvail({ kind: res?.available ? "available" : "taken" });
      } catch (e: any) {
        if (alive) setAvail({ kind: "error", msg: e?.response?.data?.error || "couldn't check availability" });
      }
    }, 350);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username, currentUsername]);

  // Block saving a username we know is taken (the PATCH would fail the unique constraint anyway).
  const usernameBlocks = avail.kind === "taken" || avail.kind === "checking";

  const save = async () => {
    setMsg(null);
    try {
      // Empty string → null clears the field; bio stays a string (server stores "" fine).
      await updateUser({
        username: username.trim() || null,
        name: name.trim() || null,
        bio: bio.trim(),
        avatar: avatar.trim() || null,
      });
      // Which fields actually changed (booleans only — never the values themselves).
      track("update_profile", {
        changedUsername: (username.trim() || null) !== (user?.username ?? null),
        changedName: (name.trim() || null) !== (user?.name ?? null),
        changedBio: bio.trim() !== (user?.bio ?? ""),
        changedAvatar: (avatar.trim() || null) !== (user?.avatar ?? null),
      });
      setMsg("✓ saved");
      if (username.trim()) setAvail({ kind: "current" }); // it's now ours
    } catch (e: any) {
      setMsg(e?.response?.data?.error || e?.message || "Update failed");
    }
  };

  const usernameStatus = () => {
    switch (avail.kind) {
      case "checking": return <span className="muted">checking…</span>;
      case "available": return <span style={{ color: "#4ade80", fontSize: 13 }}>✓ available</span>;
      case "taken": return <span className="error">✗ taken — pick another</span>;
      case "current": return <span className="muted">this is your current username</span>;
      case "error": return <span className="muted">⚠ {avail.msg}</span>;
      default: return null;
    }
  };

  return (
    <div className="panel col" style={{ maxWidth: 480 }}>
      <strong>Edit profile</strong>

      <label className="muted">username</label>
      <input placeholder="username" value={username} onChange={(e) => setUsername(e.target.value)} />
      <div style={{ minHeight: 18 }}>{usernameStatus()}</div>

      <label className="muted">display name</label>
      <input placeholder="display name" value={name} onChange={(e) => setName(e.target.value)} />

      <label className="muted">bio</label>
      <input placeholder="short bio" value={bio} onChange={(e) => setBio(e.target.value)} />

      <label className="muted">avatar URL</label>
      <input placeholder="https://…" value={avatar} onChange={(e) => setAvatar(e.target.value)} />

      <div className="row">
        <button className="primary" disabled={updating || usernameBlocks} onClick={save}>{updating ? "…" : "Save"}</button>
        {msg && <span className="muted">{msg}</span>}
      </div>

      {avatar.trim() && (
        <div className="row">
          <img src={avatar} alt="avatar preview" style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover" }} />
          <span className="muted">avatar preview</span>
        </div>
      )}
    </div>
  );
}
