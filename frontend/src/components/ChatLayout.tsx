import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { Menu, LogOut, Globe, ArrowLeft, AtSign, X, Pin } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { MessageTranscript } from "./MessageTranscript";
import { ChatInput } from "./ChatInput";
import { GroupCreateModal } from "./GroupCreateModal";
import { ForwardModal } from "./ForwardModal";
import { ThemeToggle } from "./ThemeToggle";
import { SearchBar } from "./SearchBar";
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
  const [forwardTarget, setForwardTarget] = useState<import("@/lib/api").ChatMessage | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const {
    reset,
    currentChat,
    setCurrentChat,
    setReplyTo,
    pendingFriendRequests,
    pendingGroupInvites,
    addSystemMessage,
    currentRoomID,
    clearConversationUnread,
    latestMention,
    setLatestMention,
    pinnedMessages,
  } = useChatStore();
  const { disconnect, sendMessage, sendDMMessage, sendGroupMessage, forwardMessage, markRead } =
    useWebSocket();

  // Mobile keyboard handling
  const mainRef = useRef<HTMLDivElement>(null);
  const [keyboardPadding, setKeyboardPadding] = useState(0);

  // Clear unread badge and send read receipt when switching conversations.
  useEffect(() => {
    const key =
      currentChat.type === "dm" ? `dm:${currentChat.username}` :
      currentChat.type === "group" ? `group:${currentChat.name}` :
      "public";
    clearConversationUnread(key);
    markRead();
  }, [currentChat, clearConversationUnread, markRead]);

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

  // Auto-dismiss upload error toast
  useEffect(() => {
    if (uploadError) {
      const timer = setTimeout(() => setUploadError(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [uploadError]);

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

  const handleUpload = useCallback(async (file: File) => {
    const url = await chatAPI.uploadImage(file);
    if (!url) {
      setUploadError("Upload failed");
      useChatStore.getState().setPendingImage(null);
      return;
    }
    const state = useChatStore.getState();
    const isImage = file.type.startsWith("image/");
    const fileMarkdown = isImage ? `![image](${url})` : `[${file.name}](${url})`;
    if (state.currentChat.type === "dm") {
      chatAPI.sendDMMessage(state.currentChat.username, fileMarkdown, state.replyTo || undefined);
    } else if (state.currentChat.type === "group") {
      chatAPI.sendGroupMessage(state.currentChat.name, fileMarkdown, state.replyTo || undefined);
    } else {
      chatAPI.sendMessage(fileMarkdown, state.replyTo || undefined);
    }
    state.setReplyTo(null);
    state.setPendingImage(null);
  }, []);

  const handleDelete = useCallback((messageId: string) => {
    chatAPI.deleteMessage(messageId);
  }, []);

  const handleForward = useCallback((message: import("@/lib/api").ChatMessage) => {
    setForwardTarget(message);
  }, []);

  const handleForwardSend = useCallback((messageID: string, toUsername: string) => {
    forwardMessage(messageID, toUsername);
    setForwardTarget(null);
  }, [forwardMessage]);

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
    <div ref={mainRef} className="flex h-screen-mobile overflow-hidden bg-background">
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
        <div className="flex items-center gap-3 border-b border-border bg-card px-4 py-2.5 md:hidden pt-safe">
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Open sidebar"
            className="touch-target rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
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
            className="touch-target rounded-lg p-2 text-muted-foreground/60 hover:bg-muted hover:text-foreground transition-colors"
          >
            <Globe className="h-3.5 w-3.5" />
          </button>
          <ThemeToggle />
          <button
            onClick={handleDisconnect}
            aria-label={t("chat.disconnect")}
            className="touch-target rounded-lg p-2 text-muted-foreground hover:bg-destructive/20 hover:text-destructive transition-colors"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>

        {/* Desktop header */}
        <div className="hidden md:flex items-center justify-between border-b border-border bg-card px-6 py-3 transition-colors duration-300">
          <div className="flex items-center gap-3">
            {/* Back to public chat button (when in DM or group) */}
            {currentChat.type !== "public" && (
              <button
                onClick={() => setCurrentChat({ type: "public" })}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
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
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted transition-all duration-200"
            >
              <Globe className="h-3 w-3" />
              {t("lang.switchTo")}
            </button>
            <ThemeToggle />
            <button
              onClick={handleDisconnect}
              aria-label={t("chat.disconnect")}
              className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive/80 transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              {t("chat.leave")}
            </button>
          </div>
        </div>

        {/* Friend request notifications */}
        {pendingFriendRequests.length > 0 && currentChat.type === "public" && (
          <div className="border-b border-border bg-card px-6 py-2 space-y-1">
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
                    className="rounded-md px-2 py-0.5 text-[10px] font-medium text-white bg-primary"
                  >
                    {t("friend.accept")}
                  </button>
                  <button
                    onClick={() => handleFriendReject(req.from)}
                    className="rounded-md px-2 py-0.5 text-[10px] font-medium text-muted-foreground bg-muted hover:bg-secondary"
                  >
                    {t("friend.reject")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Group invite notifications */}
        {pendingGroupInvites.length > 0 && (
          <div className="border-b border-[hsl(220,2.5%,25%)] bg-[hsl(220,40%,45%/0.06)] px-6 py-2 space-y-1">
            {pendingGroupInvites.map((inv) => (
              <div
                key={inv.group}
                className="flex items-center gap-3 text-xs animate-fade-in"
              >
                <span className="text-muted-foreground/70 flex-1">
                  {t("system.groupInvited", { group: inv.group, username: inv.from })}
                </span>
                <div className="flex gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => {
                      chatAPI.sendGroupInviteAccept(inv.group, inv.from);
                      useChatStore.getState().removeGroupInvite(inv.group);
                    }}
                    className="rounded-md px-2 py-0.5 text-[10px] font-medium text-white bg-primary"
                  >
                    {t("friend.accept")}
                  </button>
                  <button
                    onClick={() => {
                      chatAPI.sendGroupInviteDecline(inv.group);
                      useChatStore.getState().removeGroupInvite(inv.group);
                    }}
                    className="rounded-md px-2 py-0.5 text-[10px] font-medium text-muted-foreground bg-muted hover:bg-secondary"
                  >
                    {t("friend.decline")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Mention notification toast */}
        {latestMention && (
          <div className="border-b border-[hsl(20,80%,45%)] bg-[hsl(20,80%,45%/0.08)] px-6 py-2 flex items-center gap-3 text-xs animate-slide-up">
            <AtSign className="h-3.5 w-3.5 text-[hsl(20,80%,55%)] flex-shrink-0" />
            <span className="text-foreground/80 flex-1 truncate">
              <span className="font-medium">{latestMention.from}</span> {t("friend.mentionedYou")}{latestMention.group ? ` in ${latestMention.group}` : ""}:{" "}
              <span className="text-muted-foreground/60">{latestMention.content}</span>
            </span>
            <button
              onClick={() => {
                if (latestMention.group) {
                  setCurrentChat({ type: "group", name: latestMention.group });
                } else {
                  setCurrentChat({ type: "public" });
                }
                setLatestMention(null);
                // Jump to the message.
                if (latestMention.messageId) {
                  window.dispatchEvent(
                    new CustomEvent("tdchat:scroll-to-message", {
                      detail: { id: latestMention.messageId },
                    }),
                  );
                }
              }}
              className="rounded-md px-2 py-0.5 text-[10px] font-medium text-[hsl(20,80%,55%)] hover:bg-[hsl(20,80%,45%/0.15)] flex-shrink-0"
            >
              {t("friend.view")}
            </button>
            <button
              onClick={() => setLatestMention(null)}
              className="rounded p-0.5 text-muted-foreground/40 hover:text-muted-foreground flex-shrink-0"
              aria-label={t("friend.dismiss")}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Pinned messages banner */}
        {pinnedMessages.length > 0 && currentChat.type === "public" && (
          <div className="border-b border-[hsl(220,2.5%,25%)] bg-[hsl(220,40%,45%/0.04)] px-6 py-1.5 flex items-center gap-2 overflow-x-auto scrollbar-thin">
            <Pin className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
            {pinnedMessages.map((pm) => (
              <button
                key={pm.id}
                onClick={() => {
                  const el = document.getElementById(`msg-${pm.id}`);
                  if (el) {
                    el.scrollIntoView({ behavior: "smooth", block: "center" });
                    el.classList.add("highlight-flash");
                    setTimeout(() => el.classList.remove("highlight-flash"), 2000);
                  }
                }}
                className="flex-shrink-0 rounded-md px-2 py-0.5 text-[10px] bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors truncate max-w-[200px]"
              >
                {pm.username}: {(pm.content || "").slice(0, 40)}{(pm.content || "").length > 40 ? "..." : ""}
              </button>
            ))}
          </div>
        )}

        {/* Message transcript */}
        <div className="relative flex-1 overflow-hidden flex flex-col">
          <MessageTranscript onReply={handleReply} onDelete={handleDelete} onForward={handleForward} />

          {/* Chat input - fixed at bottom */}
          <ChatInput onSend={sendHandler} onUpload={handleUpload} disabled={false} />
        </div>
      </div>

      {/* Group create modal */}
      <GroupCreateModal
        open={groupModalOpen}
        onClose={() => setGroupModalOpen(false)}
        onCreate={handleCreateGroup}
      />

      {forwardTarget && (
        <ForwardModal
          message={forwardTarget}
          onClose={() => setForwardTarget(null)}
          onForward={handleForwardSend}
        />
      )}

      {/* Search dialog (Ctrl+K) */}
      <SearchBar currentRoomID={currentRoomID} />

      {/* Upload error toast */}
      {uploadError && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-destructive text-destructive-foreground text-sm font-medium shadow-lg animate-slide-up whitespace-nowrap">
          {uploadError}
        </div>
      )}
    </div>
  );
}
