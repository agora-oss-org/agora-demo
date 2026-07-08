import { useState } from "react";
import { usePushRegistration, webPushTokenAdapter } from "@agora-sdk/react-js";
import { track } from "./analytics";

const STORAGE_KEY = "agora_push_registered";
const SUPPORTED =
  typeof navigator !== "undefined" && "serviceWorker" in navigator && typeof PushManager !== "undefined";

// Web push device registration via usePushRegistration + webPushTokenAdapter (→ POST/DELETE
// /:pid/push-notifications/devices). Registration is explicit/button-triggered per the hook's own
// contract (requesting OS/browser permission should never happen silently on mount). Neither the
// hook nor the server expose a read-back query for "is this browser registered", so status is
// tracked locally via localStorage, set/cleared on successful register()/unregister().
export default function Push() {
  const { register, unregister, registering, unregistering } = usePushRegistration(webPushTokenAdapter) as any;
  const [registered, setRegistered] = useState(() => localStorage.getItem(STORAGE_KEY) === "true");
  const [error, setError] = useState<string | null>(null);

  const permission = typeof Notification !== "undefined" ? Notification.permission : "denied";

  const handleRegister = async () => {
    setError(null);
    try {
      const ok = await register();
      if (ok) {
        localStorage.setItem(STORAGE_KEY, "true");
        setRegistered(true);
        track("push_register");
      } else {
        setError(
          permission === "denied"
            ? "Permission denied — enable notifications for this site in your browser settings."
            : "Registration failed — this browser/adapter couldn't produce a push subscription."
        );
      }
    } catch {
      setError("Registration failed — see console for details.");
    }
  };

  const handleUnregister = async () => {
    setError(null);
    try {
      await unregister();
      localStorage.removeItem(STORAGE_KEY);
      setRegistered(false);
      track("push_unregister");
    } catch {
      setError("Unregister failed — see console for details.");
    }
  };

  if (!SUPPORTED) {
    return (
      <div className="panel col">
        <strong>Push notifications</strong>
        <span className="muted">Push notifications aren't supported in this browser.</span>
      </div>
    );
  }

  return (
    <div className="panel col">
      <strong>Push notifications</strong>
      <div className="row">
        <span className={`pill ${registered ? "success" : "danger"}`}>
          {registered ? "Registered" : "Not registered"}
        </span>
        <span className="muted">browser permission: {permission}</span>
      </div>
      <div className="row">
        <button disabled={registered || registering} onClick={handleRegister}>
          {registering ? "Registering…" : "Register"}
        </button>
        <button disabled={!registered || unregistering} onClick={handleUnregister}>
          {unregistering ? "Unregistering…" : "Unregister"}
        </button>
      </div>
      {error && <span className="muted">{error}</span>}
    </div>
  );
}
