import { ReplykeProvider, ChatProvider } from "@agora-sdk/react-js";
import { setSecureChatDebug } from "@agora-sdk/secure-chat-core";
import Shell from "./Shell";
import SecureChatGate from "./secure/SecureChatGate";

const PROJECT_ID = import.meta.env.VITE_PROJECT_ID;
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

// Secure-chat trace/debug logging, gated on VITE_AGORA_SECURE_CHAT_DEBUG (off by default). The SDK's
// own AGORA_SECURE_CHAT_DEBUG / process.env path is Node-only and never fires in a Vite browser
// build, so we flip the global switch here at import time. "debug" = digestible status lines;
// anything else truthy ("true"/"1"/"trace") = everything incl. full raw payload dumps. Dev aid only.
const SECURE_CHAT_DEBUG = (import.meta.env.VITE_AGORA_SECURE_CHAT_DEBUG ?? "").toLowerCase();
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

// ReplykeProvider wires the @agora SDK (Redux store, token persistence) to our project. We parse
// our own Vite env and pass the server base URL in via `baseUrl` (the SDK no longer sniffs env).
// ChatProvider manages the socket.io connection (idle until signed in).
export default function App() {
  return (
    <ReplykeProvider projectId={PROJECT_ID} baseUrl={API_BASE_URL}>
      <ChatProvider>
        <SecureChatGate>
          <Shell />
        </SecureChatGate>
      </ChatProvider>
    </ReplykeProvider>
  );
}
