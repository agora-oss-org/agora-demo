import { createContext, useContext } from "react";

// Tiny leaf module so the unlock screen, the store panel, and Shell can read the encrypted-store
// lock state + drive unlock/lock/changePassword without importing SecureChatGate (which would create
// a cycle: gate → children/Shell → here). The gate supplies the real implementation; the defaults are
// safe no-ops (locked, unlock rejects) for anything rendered outside the provider.
export type SecureStoreApi = {
  /** True once `unlock()` has succeeded this session. The secure provider is mounted only when true. */
  unlocked: boolean;
  /** Derive/unwrap the at-rest key from the password. Throws on wrong password (generic error). */
  unlock: (password: string) => Promise<void>;
  /** Drop the in-memory key and full-reload — a disk-lock plus a real purge of cached plaintext. */
  lock: () => void;
  /** Re-wrap the same data key under a new password (no re-encryption, no data loss). */
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
};

// A successful unlock flips the gate's `unlocked` state, which mounts SecureChatProvider above the
// Shell and so REMOUNTS the Shell (resetting its `tab` to the default). To land back on the Secure
// Chat tab the user just unlocked from — rather than bouncing to Feed — the gate sets this one-shot
// sessionStorage flag right before unlocking, and the Shell consumes it when it remounts.
export const RETURN_TO_SECURE_TAB_KEY = "agora.returnToSecureTab";

export const SecureStoreContext = createContext<SecureStoreApi>({
  unlocked: false,
  unlock: async () => {
    throw new Error("secure store unavailable");
  },
  lock: () => {},
  changePassword: async () => {
    throw new Error("secure store unavailable");
  },
});

export const useSecureStore = () => useContext(SecureStoreContext);
