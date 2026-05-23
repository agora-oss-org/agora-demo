import { ReplykeProvider, ChatProvider } from "@agora/react-js";
import Shell from "./Shell";

const PROJECT_ID = import.meta.env.VITE_PROJECT_ID;

// ReplykeProvider wires the @agora SDK (Redux store, token persistence) to our project.
// ChatProvider manages the socket.io connection (idle until signed in). All API traffic goes to
// VITE_API_BASE_URL via the SDK's getApiBaseUrl().
export default function App() {
  return (
    <ReplykeProvider projectId={PROJECT_ID}>
      <ChatProvider>
        <Shell />
      </ChatProvider>
    </ReplykeProvider>
  );
}
