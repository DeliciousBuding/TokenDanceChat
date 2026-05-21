import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { Menu, LogOut, Globe, ArrowLeft } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { MessageTranscript } from "./MessageTranscript";
import { ChatInput } from "./ChatInput";
import { GroupCreateModal } from "./GroupCreateModal";
import { useChatStore } from "@/stores/chatStore";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useTranslation } from "@/i18n/context";
import { cn } from "@/lib/utils";
import { chatAPI } from "@/lib/api";
import type { ChatMessage } from "@/lib/api";
import type { Language } from "@/i18n/translations";

export function ChatLayout() {
  const { t, lang, setLang } = useTranslation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const {
    reset,
    currentChat,
    setCurrentChat,
    setReplyTo,
    pendingFriendRequests,
    addSystemMessage,
  } = useChatStore();
  const { disconnect, sendMessage, sendDMMessage, sendGroupMessage, uploadImage } =
    useWebSocket();

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

  const handleReply = useCallback(
    (message: ChatMessage) => {
      setReplyTo(message);
    },
    [setReplyTo],
  );

  const handleDelete = useCallback((messageId: string) => {
    chatAPI.deleteMessage(messageId);
  }, []);

  const handleStartDM = useCallback(
    (targetUsername: string) => {
      setCurrentChat({ type: "dm", username: targetUsername });
      setSidebarOpen(false);
    },
    [setCurrentChat],
  );

  const handleAddFriend = useCallback((targetUsername: string) => {
    chatAPI.sendFriendRequest(targetUsername);
    setSidebarOpen(false);
  }, []);

  const handleMentionAssistant = useCallback((name: string) => {
    setCurrentChat({ type: "public" });
    window.dispatchEvent(
      new CustomEvent("tdchat:insert-mention", { detail: { name } }),
    );
    setSidebarOpen(false);
  }, [setCurrentChat]);

  const handleCreateGroup = useCallback(
    (name: string, members: string[]) => {
      chatAPI.sendGroupCreate(name, members);
      // Invite selected members (backend group_create with members stubs - we use separate invites)
      members.forEach((m) => {
        chatAPI.sendGroupInvite(name, m);
      });
      setCurrentChat({ type: "group", name });
    },
    [setCurrentChat],
  );

  // Handle friend request accept/reject
  const handleFriendAccept = useCallback(
    (from: string) => {
      chatAPI.sendFriendAccept(from);
      addSystemMessage(
        JSON.stringify({
          key: "system.friendAccepted",
          params: { username: from },
        }),
        Date.now(),
      );
    },
    [addSystemMessage],
  );

  const handleFriendReject = useCallback((from: string) => {
    chatAPI.sendFriendReject(from);
  }, []);

  // Compute the send handler based on current chat context.
  const sendHandler = useMemo(() => {
    if (currentChat.type === "dm") {
      return (content: string) => sendDMMessage(currentChat.username, content);
    }
    if (currentChat.type === "group") {
      return (content: string) =>
        sendGroupMessage(currentChat.name, content);
    }
    return sendMessage;
  }, [currentChat, sendDMMessage, sendGroupMessage, sendMessage]);

  // Compute header title
  const headerTitle = useMemo(() => {
    if (currentChat.type === "dm") {
      return t("chat.dmWith", { username: currentChat.username });
    }
    if (currentChat.type === "group") {
      return t("chat.groupChat", { name: currentChat.name });
    }
    return t("chat.roomName");
  }, [currentChat, t]);

  // Compute header subtitle
  const headerSubtitle = useMemo(() => {
    if (currentChat.type === "dm") {
      return t("chat.dmIndicator");
    }
    if (currentChat.type === "group") {
      return t("chat.groupIndicator");
    }
    return t("chat.subtitle");
  }, [currentChat, t]);

  const pendingUsers = useMemo(
    () => pendingFriendRequests.map((r) => r.from),
    [pendingFriendRequests],
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
        <Sidebar
          collapsed={false}
          onClose={() => setSidebarOpen(false)}
          onStartDM={handleStartDM}
          onAddFriend={handleAddFriend}
          onCreateGroup={() => setGroupModalOpen(true)}
          onMentionAssistant={handleMentionAssistant}
          pendingFriendUsers={pendingUsers}
        />
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
            <h1 className="text-sm font-semibold text-foreground truncate">
              {headerTitle}
            </h1>
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
          <div className="flex items-center gap-3">
            {/* Back to public chat button (when in DM or group) */}
            {currentChat.type !== "public" && (
              <button
                onClick={() => setCurrentChat({ type: "public" })}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-[hsl(220,2.5%,18%)] hover:text-foreground transition-colors"
                aria-label={t("chat.publicChat")}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </button>
            )}
            <div>
              <h1 className="text-sm font-semibold text-foreground">
                {headerTitle}
              </h1>
              <p className="text-xs text-muted-foreground">{headerSubtitle}</p>
            </div>
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

        {/* Friend request notifications */}
        {pendingFriendRequests.length > 0 && currentChat.type === "public" && (
          <div className="border-b border-[hsl(220,2.5%,23.5%)] bg-[hsl(231,4%,16%)] px-6 py-2 space-y-1">
            {pendingFriendRequests.map((req) => (
              <div
                key={req.from}
                className="flex items-center gap-3 text-xs animate-fade-in"
              >
                <span className="text-muted-foreground/70 flex-1">
                  {t("system.friendRequest", { username: req.from })}
                </span>
                <div className="flex gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => handleFriendAccept(req.from)}
                    className="rounded-md px-2 py-0.5 text-[10px] font-medium text-white"
                    style={{
                      backgroundColor: "oklch(71.2% 0.194 13.428)",
                    }}
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => handleFriendReject(req.from)}
                    className="rounded-md px-2 py-0.5 text-[10px] font-medium text-muted-foreground bg-[hsl(220,2.5%,20%)] hover:bg-[hsl(220,2.5%,25%)]"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Message transcript */}
        <div className="relative flex-1 overflow-hidden flex flex-col">
          <MessageTranscript onReply={handleReply} onDelete={handleDelete} />

          {/* Chat input - fixed at bottom */}
          <ChatInput onSend={sendHandler} onUpload={uploadImage} disabled={false} />
        </div>
      </div>

      {/* Group create modal */}
      <GroupCreateModal
        open={groupModalOpen}
        onClose={() => setGroupModalOpen(false)}
        onCreate={handleCreateGroup}
      />
    </div>
  );
}
