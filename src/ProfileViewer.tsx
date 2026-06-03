import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ProfileViewerContext } from "./ProfileViewerContext";
import UserProfile from "./UserProfile";

// App-wide "view a user's public profile" overlay. Provided once (in Shell, above all tabs +
// detail views) so any AuthorTag, anywhere, can call openProfile(userId). Renders as a portal
// overlay on top of the app — closing it returns you exactly where you were (no page swap, so the
// feed/thread scroll position is preserved). onEditOwnProfile lets the "Edit profile →" shortcut
// jump to the Me tab (Shell owns that state).
export function ProfileViewerProvider({
  currentUserId, onEditOwnProfile, children,
}: {
  currentUserId?: string;
  onEditOwnProfile: () => void;
  children: ReactNode;
}) {
  const [userId, setUserId] = useState<string | null>(null);
  const openProfile = useCallback((id: string) => { if (id) setUserId(id); }, []);
  const close = useCallback(() => setUserId(null), []);

  // Escape closes the overlay.
  useEffect(() => {
    if (!userId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [userId, close]);

  return (
    <ProfileViewerContext.Provider value={{ openProfile }}>
      {children}
      {userId && createPortal(
        // Backdrop click closes; clicks inside the panel don't bubble to it.
        <div
          onClick={close}
          style={{
            position: "fixed", inset: 0, zIndex: 2000, background: "rgba(0,0,0,0.6)",
            display: "grid", placeItems: "start center", overflowY: "auto", padding: "24px 12px",
          }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ width: "min(680px, 100%)" }}>
            {/* key=userId remounts cleanly when navigating author→author within the overlay */}
            <UserProfile
              key={userId}
              userId={userId}
              currentUserId={currentUserId}
              onClose={close}
              onEditProfile={() => { close(); onEditOwnProfile(); }}
            />
          </div>
        </div>,
        document.body
      )}
    </ProfileViewerContext.Provider>
  );
}
