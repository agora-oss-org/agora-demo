import { AgoraProvider, ChatProvider } from "@agora-sdk/react-js";
import { setSecureChatDebug } from "@agora-sdk/secure-chat-core";
import Shell from "./Shell";
import SecureChatGate from "./secure/SecureChatGate";
import { API_BASE_URL, PROJECT_ID, SECURE_CHAT_DEBUG as SECURE_CHAT_DEBUG_RAW } from "./config";

// Secure-chat trace/debug logging, gated on VITE_AGORA_SECURE_CHAT_DEBUG (off by default). The SDK's
// own AGORA_SECURE_CHAT_DEBUG / process.env path is Node-only and never fires in a Vite browser
// build, so we flip the global switch here at import time. "debug" = digestible status lines;
// anything else truthy ("true"/"1"/"trace") = everything incl. full raw payload dumps. Dev aid only.
const SECURE_CHAT_DEBUG = SECURE_CHAT_DEBUG_RAW.toLowerCase();
if (!["", "false", "0", "off", "no"].includes(SECURE_CHAT_DEBUG)) {
  const level = SECURE_CHAT_DEBUG === "debug" ? "debug" : "trace";
  setSecureChatDebug(true, level);
  // The SDK's own lines go to console.debug, which DevTools HIDES unless "Verbose" is enabled — so
  // emit one default-visible breadcrumb confirming the switch is armed (and reminding you to flip
  // Verbose on). Logs are event-driven: most fire during bootstrap (device register + handshake
  // drain) and on secure-chat actions, so a quiet console after a refresh is expected.
  // eslint-disable-next-line no-console
  console.info(
    `[secure-chat] debug logging ON (level=${level}). Lines use console.debug — enable "Verbose" in the DevTools console to see them.`,
  );
}

// AgoraProvider (the SDK's additive Agora*-aliased name for ReplykeProvider, divergence #7 — both
// names still work) wires the @agora SDK (Redux store, token persistence) to our project. The base
// URL + project id come from ./config (runtime window.__AGORA__ → baked VITE_* fallback) and pass in
// via `baseUrl` (the SDK no longer sniffs env). ChatProvider manages the socket.io connection (idle
// until signed in).
export default function App() {
  return (
    <AgoraProvider projectId={PROJECT_ID} baseUrl={API_BASE_URL}>
      <ChatProvider>
        <SecureChatGate>
          <Shell />
        </SecureChatGate>
      </ChatProvider>
    </AgoraProvider>
  );
}
