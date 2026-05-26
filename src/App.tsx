import { ReplykeProvider, ChatProvider } from "@agora-sdk/react-js";
import Shell from "./Shell";

const PROJECT_ID = import.meta.env.VITE_PROJECT_ID;
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

// ReplykeProvider wires the @agora SDK (Redux store, token persistence) to our project. We parse
// our own Vite env and pass the server base URL in via `baseUrl` (the SDK no longer sniffs env).
// ChatProvider manages the socket.io connection (idle until signed in).
export default function App() {
  return (
    <ReplykeProvider projectId={PROJECT_ID} baseUrl={API_BASE_URL}>
      <ChatProvider>
        <Shell />
      </ChatProvider>
    </ReplykeProvider>
  );
}
