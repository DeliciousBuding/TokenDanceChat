import { useState, useCallback } from "react";
import { Menu, LogOut } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { MessageTranscript } from "./MessageTranscript";
import { ChatInput } from "./ChatInput";
import { useChatStore } from "@/stores/chatStore";
import { useWebSocket } from "@/hooks/useWebSocket";
import { cn } from "@/lib/utils";

export function ChatLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { reset } = useChatStore();
  const { disconnect, sendMessage } = useWebSocket();

  const handleDisconnect = useCallback(() => {
    disconnect();
    reset();
  }, [disconnect, reset]);

  return (
    <div className="flex h-screen overflow-hidden bg-[hsl(223,4%,13%)]">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden animate-fade-in"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - always visible on md+, slide overlay on mobile */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 md:relative md:flex",
          sidebarOpen ? "flex" : "hidden md:flex",
        )}
      >
        <Sidebar
          collapsed={false}
          onClose={() => setSidebarOpen(false)}
        />
      </div>

      {/* Main chat area */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        {/* Top bar (mobile) */}
        <div className="flex items-center gap-3 border-b border-[hsl(220,2.5%,23.5%)] bg-[hsl(231,4%,16%)] px-4 py-2.5 md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2 text-muted-foreground hover:bg-[hsl(220,2.5%,20%)] hover:text-foreground"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold text-foreground truncate">
              公共聊天
            </h1>
          </div>
          <button
            onClick={handleDisconnect}
            className="rounded-lg p-2 text-muted-foreground hover:bg-[hsl(0,62%,25%)] hover:text-destructive transition-colors"
            title="断开连接"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>

        {/* Desktop header */}
        <div className="hidden md:flex items-center justify-between border-b border-[hsl(220,2.5%,23.5%)] bg-[hsl(231,4%,16%)] px-6 py-3">
          <div>
            <h1 className="text-sm font-semibold text-foreground">
              公共聊天
            </h1>
            <p className="text-xs text-muted-foreground">
              在线聊天室
            </p>
          </div>
          <button
            onClick={handleDisconnect}
            className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-[hsl(0,62%,20%)] hover:text-destructive/80 transition-colors"
            title="断开连接"
          >
            <LogOut className="h-3.5 w-3.5" />
            离开
          </button>
        </div>

        {/* Message transcript */}
        <div className="relative flex-1 overflow-hidden flex flex-col">
          <MessageTranscript />

          {/* Chat input - fixed at bottom */}
          <ChatInput
            onSend={sendMessage}
            disabled={false}
          />
        </div>
      </div>
    </div>
  );
}
