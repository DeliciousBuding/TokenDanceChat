import { useState, useCallback, useMemo, useRef, useEffect, lazy, Suspense } from "react";
import { Menu, LogOut, Globe, ArrowLeft, AtSign, X, Pin, Settings, Download, Info, Phone, Video, Search, MoreHorizontal } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { MessageTranscript } from "./MessageTranscript";
import { ChatInput } from "./ChatInput";
import { GroupCreateModal } from "./GroupCreateModal";
import { ForwardModal } from "./ForwardModal";
import { ThemeToggle } from "./ThemeToggle";
import { ErrorBoundary } from "./ErrorBoundary";
import { SearchBar } from "./SearchBar";
import { ConversationSearch } from "./ConversationSearch";
import { ScheduledMessagesPanel } from "./ScheduledMessagesPanel";
import { SettingsPanel } from "./SettingsPanel";
import { useChatStore } from "@/stores/chatStore";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useTranslation } from "@/i18n/context";
import { cn } from "@/lib/utils";
import { chatAPI } from "@/lib/api";
import type { ChatMessage } from "@/lib/api";
import type { Language } from "@/i18n/translations";

const ImageLightbox = lazy(() => import("@/components/ImageLightbox").then((m) => ({ default: m.ImageLightbox })));
const ThreadPanel = lazy(() => import("@/components/ThreadPanel").then((m) => ({ default: m.ThreadPanel })));
const GroupInfoPanel = lazy(() => import("@/components/GroupInfoPanel").then((m) => ({ default: m.GroupInfoPanel })));
const VideoCall = lazy(() => import("@/components/VideoCall").then((m) => ({ default: m.VideoCall })));

export function ChatLayout() {
  const { t, lang, setLang } = useTranslation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [forwardTarget, setForwardTarget] = useState<import("@/lib/api").ChatMessage | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [threadParent, setThreadParent] = useState<ChatMessage | null>(null);
  const [threadMessages, setThreadMessages] = useState<ChatMessage[]>([]);
  const [exportOpen, setExportOpen] = useState(false);
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const [exportToast, setExportToast] = useState<string | null>(null);
  const [conversationSearchOpen, setConversationSearchOpen] = useState(false);
  const [searchHighlight, setSearchHighlight] = useState("");
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
    connected,
    lightboxImage,
    username,
    groups,
    groupInfoPanel,
    setGroupInfoPanel,
    incomingCall,
    activeCall,
    setActiveCall,
    setIncomingCall,
  } = useChatStore();
  const { disconnect, sendMessage, sendDMMessage, sendGroupMessage, forwardMessage, markRead } =
    useWebSocket();

  // Mobile keyboard handling
  const mainRef = useRef<HTMLDivElement>(null);
  const [keyboardPadding, setKeyboardPadding] = useState(0);

  // Conversation crossfade on switch
  const conversationKey = useMemo(() =>
    currentChat.type === "dm" ? `dm:${currentChat.username}` :
    currentChat.type === "group" ? `group:${currentChat.name}` :
    "public",
  [currentChat]);
  const [convFade, setConvFade] = useState(false);
  const groupCallParticipants = useMemo(() => {
    if (currentChat.type !== "group") return [];
    return (groups[currentChat.name]?.members ?? []).filter((member) => member !== username);
  }, [currentChat, groups, username]);

  useEffect(() => {
    setConvFade(true);
    const t = setTimeout(() => setConvFade(false), 200);
    return () => clearTimeout(t);
  }, [conversationKey]);

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

  // Close mobile sidebar when conversation changes
  useEffect(() => {
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
    setMobileActionsOpen(false);
    setConversationSearchOpen(false);
    setSearchHighlight("");
  }, [currentChat]);

  // Auto-dismiss upload error toast
  useEffect(() => {
    if (uploadError) {
      const timer = setTimeout(() => setUploadError(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [uploadError]);

  // Auto-dismiss export toast
  useEffect(() => {
    if (exportToast) {
      const timer = setTimeout(() => setExportToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [exportToast]);

  const handleDisconnect = useCallback(() => {
    disconnect();
    reset();
  }, [disconnect, reset]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === "k") {
        e.preventDefault();
        const toggleBtn = document.querySelector<HTMLButtonElement>('[aria-label="toggle search"]');
        if (toggleBtn) toggleBtn.click();
        setTimeout(() => {
          const searchField = document.querySelector<HTMLInputElement>('[aria-label*="search"] input');
          searchField?.focus();
        }, 100);
      }
      if (mod && e.key === "f") {
        const tag = (e.target as HTMLElement).tagName;
        if (tag !== "INPUT" && tag !== "TEXTAREA") {
          e.preventDefault();
          setConversationSearchOpen((prev) => {
            if (!prev) return true;
            // Already open — focus the input field.
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent("tdchat:focus-conversation-search"));
            }, 50);
            return prev;
          });
        }
      }
      if (e.key === "Escape") {
        // Cancel reply if active
        if (useChatStore.getState().replyTo) {
          e.preventDefault();
          setReplyTo(null);
        }
        // Close thread panel if open
        setThreadParent((prev) => { if (prev) { e.preventDefault(); } return null; });
        setThreadMessages([]);
        // Exit multi-select mode (via event — no-op if not active)
        window.dispatchEvent(new CustomEvent("tdchat:exit-select-mode"));
        // Close all open emoji pickers
        window.dispatchEvent(new CustomEvent("tdchat:close-emoji-picker"));
        // Close mobile sidebar
        setSidebarOpen(false);
        // Close export dropdown
        setExportOpen(false);
        setMobileActionsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const toggleLang = useCallback(() => {
    const next: Language = lang === "zh-CN" ? "en-US" : "zh-CN";
    setLang(next);
  }, [lang, setLang]);

  // Thread messages WebSocket listener
  useEffect(() => {
    const unsub = chatAPI.on("thread_messages", (msg: { type: string; parent_message_id?: string; messages?: ChatMessage[] }) => {
      if (msg.messages) {
        setThreadMessages(msg.messages as ChatMessage[]);
      }
    });
    return () => { unsub(); };
  }, []);

  const handleOpenThread = useCallback((message: ChatMessage) => {
    setThreadParent(message);
    setThreadMessages([]);
    chatAPI.requestThreadMessages(message.id);
  }, []);

  const handleCloseThread = useCallback(() => {
    setThreadParent(null);
    setThreadMessages([]);
  }, []);

  const handleSendThreadReply = useCallback((content: string) => {
    if (!threadParent) return;
    chatAPI.sendThreadReply(threadParent.id, content);
  }, [threadParent]);

  const handleReply = useCallback(
    (message: ChatMessage) => {
      setReplyTo(message);
    },
    [setReplyTo],
  );

  const handleUpload = useCallback(async (file: File) => {
    const url = await chatAPI.uploadImage(file);
    if (!url) {
      setUploadError(t("input.uploadFailed"));
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

  const handleExport = useCallback(async (format: 'json' | 'text') => {
    setExportOpen(false);
    try {
      const conversationKey =
        currentChat.type === "dm" ? `dm:${currentChat.username}` :
        currentChat.type === "group" ? `group:${currentChat.name}` :
        "public";
      const blob = await chatAPI.exportChat(
        conversationKey,
        format,
        currentChat.type === "dm" ? username : undefined,
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const ext = format === "json" ? "json" : "txt";
      const now = new Date().toISOString().slice(0, 10);
      const name = conversationKey.replace(/^dm:|^group:/, "").replace(/[^a-zA-Z0-9一-鿿_-]/g, "_");
      a.download = `chat_export_${name}_${now}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExportToast(t("export.exportSuccess"));
    } catch {
      setExportToast(t("export.exportError"));
    }
  }, [currentChat, t, username]);

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

  const handleStartCall = useCallback(
    (callType: "video" | "voice") => {
      if (currentChat.type === "dm") {
        setActiveCall({
          callId: "",
          peer: currentChat.username,
          callType,
          startTime: Date.now(),
        });
        return;
      }
      if (currentChat.type === "group" && groupCallParticipants.length > 0) {
        setActiveCall({
          callId: "",
          peer: currentChat.name,
          callType,
          startTime: Date.now(),
          isGroupCall: true,
          groupName: currentChat.name,
          participants: groupCallParticipants,
        });
      }
    },
    [currentChat, groupCallParticipants, setActiveCall],
  );

  const handleCloseCall = useCallback(() => {
    setIncomingCall(null);
    setActiveCall(null);
  }, [setIncomingCall, setActiveCall]);

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
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden animate-fade-in"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar - slide-in on mobile/tablet */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 transition-transform duration-300 ease-in-out lg:relative lg:flex lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <ErrorBoundary fallback={<div className="p-4 text-sm text-muted-foreground/50">Sidebar unavailable</div>}>
          <Sidebar
            collapsed={false}
            onClose={() => setSidebarOpen(false)}
            onStartDM={handleStartDM}
            onAddFriend={handleAddFriend}
            onCreateGroup={() => setGroupModalOpen(true)}
            onMentionAssistant={handleMentionAssistant}
            pendingFriendUsers={pendingUsers}
          />
        </ErrorBoundary>
      </div>

      {/* Main chat area */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden" style={{ paddingBottom: keyboardPadding }}>
        {/* Mobile top bar */}
        <div className="flex items-center gap-2 border-b border-border bg-card px-3 py-2 lg:hidden pt-safe">
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Open sidebar"
            className="touch-target rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1 px-1">
            <h1
              className="truncate text-[15px] font-semibold leading-5 text-foreground"
              data-visual="mobile-chat-title"
            >
              {headerTitle}
            </h1>
          </div>
          {/* Call buttons (mobile, DM only) */}
          {currentChat.type === "dm" && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => handleStartCall("voice")}
                className="touch-target rounded-lg p-2 text-muted-foreground/60 hover:bg-muted hover:text-foreground transition-colors"
                aria-label={t("call.voiceCall")}
              >
                <Phone className="h-4 w-4" />
              </button>
              <button
                onClick={() => handleStartCall("video")}
                className="touch-target rounded-lg p-2 text-muted-foreground/60 hover:bg-muted hover:text-foreground transition-colors"
                aria-label={t("call.videoCall")}
              >
                <Video className="h-4 w-4" />
              </button>
            </div>
          )}
          {/* Group info button (mobile) */}
          {currentChat.type === "group" && (
            <>
              {groupCallParticipants.length > 0 && (
                <button
                  onClick={() => handleStartCall("video")}
                  className="touch-target rounded-lg p-2 text-muted-foreground/60 hover:bg-muted hover:text-foreground transition-colors"
                  aria-label={t("call.groupCall")}
                >
                  <Video className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={() => setGroupInfoPanel(currentChat.name)}
                className="touch-target rounded-lg p-2 text-muted-foreground/60 hover:bg-muted hover:text-foreground transition-colors"
                aria-label={t("group.groupInfo")}
              >
                <Info className="h-4 w-4" />
              </button>
            </>
          )}
          <ThemeToggle />
          {/* Secondary actions (mobile) */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setMobileActionsOpen((open) => !open)}
              aria-label="More chat actions"
              className="touch-target rounded-lg p-2 text-muted-foreground/60 hover:bg-muted hover:text-foreground transition-colors"
            >
              <MoreHorizontal className="h-5 w-5" />
            </button>
            {mobileActionsOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 w-52 rounded-xl border border-border bg-card py-1 shadow-xl animate-scale-in origin-top-right">
                <button
                  onClick={() => {
                    toggleLang();
                    setMobileActionsOpen(false);
                  }}
                  className="flex min-h-11 w-full items-center gap-3 px-3 text-left text-sm text-foreground/80 hover:bg-muted transition-colors"
                >
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  {t("lang.switchTo")}
                </button>
                <button
                  onClick={() => {
                    handleExport("json");
                    setMobileActionsOpen(false);
                  }}
                  className="flex min-h-11 w-full items-center gap-3 px-3 text-left text-sm text-foreground/80 hover:bg-muted transition-colors"
                >
                  <Download className="h-4 w-4 text-muted-foreground" />
                  {t("export.exportJson")}
                </button>
                <button
                  onClick={() => {
                    handleExport("text");
                    setMobileActionsOpen(false);
                  }}
                  className="flex min-h-11 w-full items-center gap-3 px-3 text-left text-sm text-foreground/80 hover:bg-muted transition-colors"
                >
                  <Download className="h-4 w-4 text-muted-foreground" />
                  {t("export.exportText")}
                </button>
                <button
                  onClick={() => {
                    setSettingsOpen(true);
                    setMobileActionsOpen(false);
                  }}
                  className="flex min-h-11 w-full items-center gap-3 px-3 text-left text-sm text-foreground/80 hover:bg-muted transition-colors"
                >
                  <Settings className="h-4 w-4 text-muted-foreground" />
                  {t("settings.notificationPrefs")}
                </button>
                <button
                  onClick={handleDisconnect}
                  className="flex min-h-11 w-full items-center gap-3 px-3 text-left text-sm text-destructive/80 hover:bg-destructive/10 transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  {t("chat.disconnect")}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Desktop header */}
        <div className="hidden lg:flex items-center justify-between gap-4 border-b border-border bg-card px-6 py-3.5 transition-colors duration-300">
          <div className="flex min-w-[13rem] max-w-[42%] flex-shrink-0 items-center gap-3">
            {/* Back to public chat button (when in DM or group) */}
            {currentChat.type !== "public" && (
              <button
                onClick={() => setCurrentChat({ type: "public" })}
                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                aria-label={t("chat.publicChat")}
              >
                <ArrowLeft className="h-[18px] w-[18px]" />
              </button>
            )}
            {/* Group info button (when in group chat) */}
            {currentChat.type === "group" && (
              <button
                onClick={() => setGroupInfoPanel(currentChat.name)}
                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                aria-label={t("group.groupInfo")}
              >
                <Info className="h-[18px] w-[18px]" />
              </button>
            )}
            <div className="min-w-0 flex-1">
              <h1
                data-visual="desktop-chat-title"
                className="truncate text-base font-semibold text-foreground"
                title={headerTitle}
              >
                {headerTitle}
              </h1>
              <p className="truncate text-xs text-muted-foreground">{headerSubtitle}</p>
            </div>
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2 overflow-x-auto scrollbar-thin">
            {/* Call buttons (desktop, DM only) */}
            {currentChat.type === "dm" && (
              <div className="flex items-center gap-1 mr-1">
                <button
                  onClick={() => handleStartCall("voice")}
                  className="flex min-h-11 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200"
                  aria-label={t("call.voiceCall")}
                >
                  <Phone className="h-4 w-4" />
                  {t("call.voiceCall")}
                </button>
                <button
                  onClick={() => handleStartCall("video")}
                  className="flex min-h-11 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200"
                  aria-label={t("call.videoCall")}
                >
                  <Video className="h-4 w-4" />
                  {t("call.videoCall")}
                </button>
              </div>
            )}
            {currentChat.type === "group" && groupCallParticipants.length > 0 && (
              <button
                onClick={() => handleStartCall("video")}
                className="flex min-h-11 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200"
                aria-label={t("call.groupCall")}
              >
                <Video className="h-4 w-4" />
                {t("call.groupCall")}
              </button>
            )}
            <button
              onClick={toggleLang}
              aria-label={t("lang.label")}
              className="flex min-h-11 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200"
            >
              <Globe className="h-4 w-4" />
              {t("lang.switchTo")}
            </button>
            <ThemeToggle />
            {/* Search button (desktop) */}
            <button
              onClick={() => setConversationSearchOpen((prev) => !prev)}
              aria-label={t("search.inConversation")}
              className="flex min-h-11 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200"
            >
              <Search className="h-4 w-4" />
              {t("search.pressCtrlF")}
            </button>
            {/* Export button (desktop) */}
            <div className="relative">
              <button
                onClick={() => setExportOpen(!exportOpen)}
                aria-label={t("export.exportChat")}
                className="flex min-h-11 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200"
              >
                <Download className="h-4 w-4" />
                {t("export.exportChat")}
              </button>
              {exportOpen && (
                <div className="absolute right-0 top-full mt-1 z-50 w-40 rounded-xl border border-border bg-card shadow-xl py-1 animate-scale-in origin-top-right">
                  <button
                    onClick={() => handleExport("json")}
                    className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-muted transition-colors"
                  >
                    {t("export.exportJson")}
                  </button>
                  <button
                    onClick={() => handleExport("text")}
                    className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-muted transition-colors"
                  >
                    {t("export.exportText")}
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={() => setSettingsOpen(true)}
              aria-label={t("settings.notificationPrefs")}
              className="flex min-h-11 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200"
            >
              <Settings className="h-4 w-4" />
              {t("settings.notificationPrefs")}
            </button>
            <ScheduledMessagesPanel roomId={currentRoomID} />
            <button
              onClick={handleDisconnect}
              aria-label={t("chat.disconnect")}
              className="flex min-h-11 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive/80 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              {t("chat.leave")}
            </button>
          </div>
        </div>

        {/* Connection lost / reconnecting banner */}
        {!connected && (
          <div className="border-b border-warning/50 bg-warning/10 px-6 py-2 flex items-center gap-3 text-xs animate-pulse">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-warning" />
              <span className="text-warning-foreground font-medium">{t("system.connectionLost")}</span>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="ml-auto rounded-md px-2 py-0.5 text-[10px] text-warning hover:text-warning-foreground hover:bg-warning/20 transition-colors"
            >
              {t("error.reload")}
            </button>
          </div>
        )}

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
          <div className="border-b border-border bg-accent/30 px-6 py-2 space-y-1">
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
          <div className="border-b border-mention/50 bg-mention/10 px-6 py-2 flex items-center gap-3 text-xs animate-slide-up">
            <AtSign className="h-3.5 w-3.5 text-mention flex-shrink-0" />
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
              className="rounded-md px-2 py-0.5 text-[10px] font-medium text-mention hover:bg-mention/15 flex-shrink-0"
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
          <div className="border-b border-border bg-accent/20 px-6 py-1.5 flex items-center gap-2 overflow-x-auto scrollbar-thin">
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

        {/* In-conversation search (Ctrl+F) */}
        <ConversationSearch
          open={conversationSearchOpen}
          onClose={() => {
            setConversationSearchOpen(false);
            setSearchHighlight("");
          }}
          onHighlightChange={setSearchHighlight}
        />

        {/* Message transcript */}
        <div className="relative flex-1 overflow-hidden flex flex-col">
          <div className={cn("flex-1 min-h-0 transition-opacity duration-150", convFade ? "opacity-40" : "opacity-100")}>
            <ErrorBoundary fallback={<div className="flex items-center justify-center h-full text-sm text-muted-foreground/50">Chat transcript unavailable</div>}>
              <MessageTranscript onReply={handleReply} onDelete={handleDelete} onForward={handleForward} onOpenThread={handleOpenThread} highlight={searchHighlight} />
            </ErrorBoundary>
          </div>

          {/* Chat input - fixed at bottom */}
          <ErrorBoundary fallback={<div className="p-4 text-sm text-muted-foreground/50">Chat input unavailable</div>}>
            <ChatInput onSend={sendHandler} onUpload={handleUpload} disabled={false} />
          </ErrorBoundary>
        </div>
      </div>

      {/* Thread panel */}
      <Suspense fallback={null}>
        {threadParent && <ThreadPanel
        parentMessage={threadParent}
        threadMessages={threadMessages}
        onClose={handleCloseThread}
        onSendReply={handleSendThreadReply}
      />}
      </Suspense>

      {/* Group info panel */}
      <Suspense fallback={null}>
        {groupInfoPanel && <GroupInfoPanel
        groupName={groupInfoPanel}
        onClose={() => setGroupInfoPanel(null)}
      />}
      </Suspense>

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

      {/* Settings panel */}
      {settingsOpen && (
        <SettingsPanel onClose={() => setSettingsOpen(false)} />
      )}

      {/* Search dialog (Ctrl+K) */}
      <SearchBar currentRoomID={currentRoomID} />

      {/* Upload error toast */}
      {uploadError && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-destructive text-destructive-foreground text-sm font-medium shadow-lg animate-slide-up whitespace-nowrap">
          {uploadError}
        </div>
      )}

      {/* Export toast */}
      {exportToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-medium shadow-lg animate-slide-up whitespace-nowrap">
          {exportToast}
        </div>
      )}

      {/* Image lightbox */}
      {lightboxImage && (
        <Suspense fallback={null}>
          <ImageLightbox
            imageUrl={lightboxImage}
            onClose={() => useChatStore.getState().setLightboxImage(null)}
          />
        </Suspense>
      )}

      {/* Video/voice call overlay */}
      {(incomingCall || activeCall) && (
        <Suspense fallback={null}>
          <VideoCall onClose={handleCloseCall} />
        </Suspense>
      )}
    </div>
  );
}
