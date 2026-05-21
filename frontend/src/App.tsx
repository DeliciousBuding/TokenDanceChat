import { useChatStore } from "@/stores/chatStore";
import { JoinScreen } from "@/components/JoinScreen";
import { ChatLayout } from "@/components/ChatLayout";

function App() {
  const view = useChatStore((s) => s.view);

  return view === "join" ? <JoinScreen /> : <ChatLayout />;
}

export default App;
