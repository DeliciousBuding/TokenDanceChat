import { useState, useCallback, useEffect, useRef } from "react";
import { Menu, LogOut, Globe } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { MessageTranscript } from "./MessageTranscript";
import { ChatInput } from "./ChatInput";
import { UserProfileCard } from "./UserProfileCard";
import { useChatStore } from "@/stores/chatStore";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useTranslation } from "@/i18n/context";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/lib/api";
import type { Language } from "@/i18n/translations";

export function ChatLayout() {
  const { t, lang, setLang } = useTranslation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { reset, deleteMessage, selectedProfileUser, setSelectedProfileUser } = useChatStore();
  const { disconnect, sendMessage } = useWebSocket();

  // Reply state
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);

  // Mobile keyboard handling
  const mainRef = useRef<HTMLDivElement>(null);
  const [keyboardPadding, setKeyboardPadding] = useState(0);

  useEffect(() => {
    const handleResize = () => {
      if (!window.visualViewport || !mainRef.current) return;
      const viewportHeight = window.visualViewport.height;
      const windowHeight = window.innerHeight;
      const diff = windowHeight - viewportHeight;
      if (window.innerWidth < 768 && diff > 100) {
        setKeyboardPadding(diff);
      } else {
        setKeyboardPadding(0);
      }
    };

    window.visualViewport?.addEventListener("resize", handleResize);
    window.visualViewport?.addEventListener("scroll", handleResize);
    return () => {
      window.visualViewport?.removeEventListener("resize", handleResize);
      window.visualViewport?.removeEventListener("scroll", handleResize);
    };
  }, []);

  const handleDisconnect = useCallback(() => {
    disconnect();
    reset();
  }, [disconnect, reset]);

  const toggleLang = useCallback(() => {
    const next: Language = lang === "zh-CN" ? "en-US" : "zh-CN";
    setLang(next);
  }, [lang, setLang]);

  const handleReplyToMessage = useCallback((message: ChatMessage) => {
    setReplyTo(message);
  }, []);

  const handleCancelReply = useCallback(() => {
    setReplyTo(null);
  }, []);

  const handleDeleteMessage = useCallback(
    (messageId: string) => {
      deleteMessage(messageId);
    },
    [deleteMessage],
  );

  const handleForwardMessage = useCallback(
    (content: string) => {
      sendMessage(content);
    },
    [sendMessage],
  );

  const handleSendWithReply = useCallback(
    (content: string) => {
      if (replyTo) {
        const replyPrefix = `> @${replyTo.username}: ${replyTo.content.slice(0, 80)}${replyTo.content.length > 80 ? "..." : ""}\n`;
        sendMessage(replyPrefix + content);
        setReplyTo(null);
      } else {
        sendMessage(content);
      }
    },
    [sendMessage, replyTo],
  );

  return (
    <div ref={mainRef} className="flex h-screen-mobile overflow-hidden bg-[hsl(223,4%,13%)]">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden animate-fade-in"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar - slide-in on mobile */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 transition-transform duration-300 ease-in-out md:relative md:flex md:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        )}
      >
        <Sidebar collapsed={false} onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Main chat area */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden" style={{ paddingBottom: keyboardPadding }}>
        {/* Mobile top bar */}
        <div className="flex items-center gap-3 border-b border-[hsl(220,2.5%,23.5%)] bg-[hsl(231,4%,16%)] px-4 py-2.5 md:hidden pt-safe">
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Open sidebar"
            className="touch-target rounded-lg p-2 text-muted-foreground hover:bg-[hsl(220,2.5%,20%)] hover:text-foreground"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold text-foreground truncate">{t("chat.roomName")}</h1>
          </div>
          <button
            onClick={toggleLang}
            aria-label={t("lang.label")}
            className="touch-target rounded-lg p-2 text-muted-foreground/60 hover:bg-[hsl(220,2.5%,20%)] hover:text-foreground transition-colors"
          >
            <Globe className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleDisconnect}
            aria-label={t("chat.disconnect")}
            className="touch-target rounded-lg p-2 text-muted-foreground hover:bg-[hsl(0,62%,25%)] hover:text-destructive transition-colors"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>

        {/* Desktop header */}
        <div className="hidden md:flex items-center justify-between border-b border-[hsl(220,2.5%,23.5%)] bg-[hsl(231,4%,16%)] px-6 py-3 transition-colors duration-300">
          <div>
            <h1 className="text-sm font-semibold text-foreground">{t("chat.roomName")}</h1>
            <p className="text-xs text-muted-foreground">{t("chat.subtitle")}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleLang}
              aria-label={t("lang.label")}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground hover:bg-[hsl(220,2.5%,18%)] transition-all duration-200"
            >
              <Globe className="h-3 w-3" />
              {t("lang.switchTo")}
            </button>
            <button
              onClick={handleDisconnect}
              aria-label={t("chat.disconnect")}
              className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-[hsl(0,62%,20%)] hover:text-destructive/80 transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              {t("chat.leave")}
            </button>
          </div>
        </div>

        {/* Message area */}
        <div className="relative flex-1 overflow-hidden flex flex-col">
          <MessageTranscript
            onReplyToMessage={handleReplyToMessage}
            onDeleteMessage={handleDeleteMessage}
            onForwardMessage={handleForwardMessage}
          />

          <div className="pb-safe">
            <ChatInput
              onSend={handleSendWithReply}
              disabled={false}
              replyTo={replyTo}
              onCancelReply={handleCancelReply}
            />
          </div>
        </div>
      </div>

      {/* User profile card overlay */}
      {selectedProfileUser && (
        <UserProfileCard
          username={selectedProfileUser}
          onClose={() => setSelectedProfileUser(null)}
        />
      )}
    </div>
  );
}
