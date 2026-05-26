import { useState } from "react";
import { useUser } from "@agora/react-js";

// Edit the current user's profile via useUser().updateUser → PATCH /users/:id (self-only on the
// server). Exercises the user-update SDK surface. The header shows @username, falling back to name,
// then the id slice — so setting a username/name here is what turns "@e8968a4e" into something human.
export default function Profile() {
  const { user, updateUser, updating } = useUser() as any;
  const [username, setUsername] = useState(user?.username ?? "");
  const [name, setName] = useState(user?.name ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [avatar, setAvatar] = useState(user?.avatar ?? "");
  const [msg, setMsg] = useState<string | null>(null);

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
      setMsg("✓ saved");
    } catch (e: any) {
      setMsg(e?.response?.data?.error || e?.message || "Update failed");
    }
  };

  return (
    <div className="panel col" style={{ maxWidth: 480 }}>
      <strong>Edit profile</strong>
      <div className="muted">
        id <code>{user?.id?.slice(0, 8)}</code> — the header shows <code>@username</code>, then{" "}
        <code>name</code>, then the id. Set one to replace the id fallback.
      </div>

      <label className="muted">username</label>
      <input placeholder="username" value={username} onChange={(e) => setUsername(e.target.value)} />

      <label className="muted">display name</label>
      <input placeholder="display name" value={name} onChange={(e) => setName(e.target.value)} />

      <label className="muted">bio</label>
      <input placeholder="short bio" value={bio} onChange={(e) => setBio(e.target.value)} />

      <label className="muted">avatar URL</label>
      <input placeholder="https://…" value={avatar} onChange={(e) => setAvatar(e.target.value)} />

      <div className="row">
        <button className="primary" disabled={updating} onClick={save}>{updating ? "…" : "Save"}</button>
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
