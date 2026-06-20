import { useMemo } from "react";
import { useAuth } from "@agora-sdk/react-js";
import {
  SecureChatProvider,
  createWebSecureChatCrypto,
  createIndexedDBStore,
} from "@agora-sdk/secure-chat-react-js";
import SecureBootstrap from "./SecureBootstrap";

const PROJECT_ID = import.meta.env.VITE_PROJECT_ID;
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

// Sits inside ReplykeProvider: SecureChatProvider would otherwise resolve baseUrl/socketUrl from
// @agora-sdk/core's runtime singletons (set by ReplykeProvider), but we pass them explicitly (same env
// App.tsx parses) so the /secure REST + socket always have a URL even if the singletons aren't set yet.
// crypto + store are built ONCE (stable identity) so the MLS state and IndexedDB handle survive
// re-renders. The access token is re-passed every render and read lazily per request, so token refresh
// just works. SecureBootstrap is mounted here (always-on) so Welcomes/messages arrive app-wide.
export default function SecureChatGate({ children }: { children: React.ReactNode }) {
  const { accessToken } = useAuth() as any;
  const crypto = useMemo(() => createWebSecureChatCrypto(), []);
  const store = useMemo(() => createIndexedDBStore(), []);

  // Don't mount the secure stack until signed in (no token = nothing to register/drain).
  if (!accessToken) return <>{children}</>;

  // Strip /v7 from baseUrl to get origin for secure-socket connection (SecureChatProvider appends /secure-socket/).
  const socketOrigin = new URL(API_BASE_URL).origin;

  return (
    <SecureChatProvider
      crypto={crypto}
      store={store}
      projectId={PROJECT_ID}
      accessToken={accessToken}
      baseUrl={API_BASE_URL}
      socketUrl={socketOrigin}
      padding="ladder"
    >
      <SecureBootstrap />
      {children}
    </SecureChatProvider>
  );
}
