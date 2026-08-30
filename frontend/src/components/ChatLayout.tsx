import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AtSign,
  Download,
  Globe,
  LogOut,
  Menu,
  Monitor,
  Moon,
  MoreHorizontal,
  Pin,
  Search,
  Settings,
  Sun,
  X,
} from "lucide-react";
import { ChatInput } from "./ChatInput";
import { ConversationSearch } from "./ConversationSearch";
import { ErrorBoundary } from "./ErrorBoundary";
import { LightChatSidebar, type ChatSpace } from "./LightChatSidebar";
import { MessageTranscript } from "./MessageTranscript";
import { SearchBar } from "./SearchBar";
import { SettingsPanel } from "./SettingsPanel";
import { ThemeToggle, applyTheme, cycleOrder, getStoredTheme, STORAGE_KEY as THEME_STORAGE_KEY } from "./ThemeToggle";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useServerConfig } from "@/hooks/useServerConfig";
import { useTranslation } from "@/i18n/context";
import type { Language } from "@/i18n/translations";
import { chatAPI, getSessionToken } from "@/lib/api";
import type { ChatMessage } from "@/lib/api";
import { assistants, modelDisplayName, tokenBot } from "@/lib/assistantRegistry";
import { cn } from "@/lib/utils";
import { useChatStore, type LegacyChatInput } from "@/stores/chatStore";

const ImageLightbox = lazy(() => import("@/components/ImageLightbox").then((m) => ({ default: m.ImageLightbox })));
const ThreadPanel = lazy(() => import("@/components/ThreadPanel").then((m) => ({ default: m.ThreadPanel })));

const defaultAssistant = tokenBot;

export function ChatLayout() {
  const { t, lang, setLang } = useTranslation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeSpace, setActiveSpace] = useState<ChatSpace>("public");
  const [assistantId, setAssistantId] = useState(defaultAssistant.id);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [threadParent, setThreadParent] = useState<ChatMessage | null>(null);
  const [threadMessages, setThreadMessages] = useState<ChatMessage[]>([]);
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [exportToast, setExportToast] = useState<string | null>(null);
  const [conversationSearchOpen, setConversationSearchOpen] = useState(false);
  const [searchHighlight, setSearchHighlight] = useState("");
  const [reconnectAttempt, setReconnectAttempt] = useState<number | null>(null);
  const [reconnectFailed, setReconnectFailed] = useState(false);
  const [convFade, setConvFade] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);
  const transcriptContainerRef = useRef<HTMLDivElement | null>(null);
  const [keyboardPadding, setKeyboardPadding] = useState(0);

  const {
    reset,
    setCurrentChat,
    setReplyTo,
    clearConversationUnread,
    latestMention,
    setLatestMention,
    pinnedMessages,
    connected,
    setConnected,
    lightboxImage,
    username,
    setShowAuthModal,
    privateBotMessages,
    setPrivateBotHistory,
  } = useChatStore();
  const currentChat = useChatStore((s) => s.currentChat as LegacyChatInput);
  const unauthenticated = !username;
  const { disconnect, sendMessage, markRead } = useWebSocket();

  const activeAssistant = useMemo(
    () => assistants.find((assistant) => assistant.id === assistantId) ?? defaultAssistant,
    [assistantId],
  );
  const assistantMode = activeSpace !== "public";

  // Load the private bot thread history whenever the user enters the
  // assistant space (kept separate from the public room list). Guests have no
  // session, so the history endpoint would 401 — skip it and let the private
  // thread populate from live WS traffic instead.
  useEffect(() => {
    if (!assistantMode) return;
    if (!getSessionToken()) return;
    let cancelled = false;
    chatAPI.fetchMessagesBetween(activeAssistant.name).then((msgs) => {
      if (!cancelled) setPrivateBotHistory(msgs);
    });
    return () => { cancelled = true; };
  }, [assistantMode, activeAssistant.name, setPrivateBotHistory]);

  // Real model name comes from the backend (CHAT_LLM_MODEL) via /api/config;
  // fall back to the static registry display name when unavailable.
  const serverConfig = useServerConfig();

  useEffect(() => {
    if (currentChat.type !== "public") {
      setCurrentChat({ type: "public" });
    }
  }, [currentChat.type, setCurrentChat]);

  useEffect(() => {
    setConvFade(true);
    const timer = setTimeout(() => setConvFade(false), 160);
    return () => clearTimeout(timer);
  }, [activeSpace, assistantId]);

  useEffect(() => {
    clearConversationUnread("public");
    markRead();
  }, [activeSpace, clearConversationUnread, markRead]);

  useEffect(() => {
    const handleResize = () => {
      if (!window.visualViewport || !mainRef.current) return;
      const diff = window.innerHeight - window.visualViewport.height;
      setKeyboardPadding(window.innerWidth < 768 && diff > 100 ? diff : 0);
    };
    window.visualViewport?.addEventListener("resize", handleResize);
    window.visualViewport?.addEventListener("scroll", handleResize);
    return () => {
      window.visualViewport?.removeEventListener("resize", handleResize);
      window.visualViewport?.removeEventListener("scroll", handleResize);
    };
  }, []);

  useEffect(() => {
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
    setMobileActionsOpen(false);
    setConversationSearchOpen(false);
    setSearchHighlight("");
  }, [activeSpace, assistantId]);

  useEffect(() => {
    if (!exportToast) return;
    const timer = setTimeout(() => setExportToast(null), 3000);
    return () => clearTimeout(timer);
  }, [exportToast]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key === "k") {
        event.preventDefault();
        document.querySelector<HTMLButtonElement>('[aria-label="toggle search"]')?.click();
        setTimeout(() => {
          document.querySelector<HTMLInputElement>('[aria-label*="search"] input')?.focus();
        }, 100);
      }
      if (mod && event.key === "f") {
        const tag = (event.target as HTMLElement).tagName;
        if (tag !== "INPUT" && tag !== "TEXTAREA") {
          event.preventDefault();
          setConversationSearchOpen((prev) => !prev);
        }
      }
      if (event.key === "Escape") {
        if (useChatStore.getState().replyTo) {
          event.preventDefault();
          setReplyTo(null);
        }
        setSettingsOpen(false);
        setThreadParent(null);
        setThreadMessages([]);
        window.dispatchEvent(new CustomEvent("tdchat:exit-select-mode"));
        window.dispatchEvent(new CustomEvent("tdchat:close-emoji-picker"));
        setSidebarOpen(false);
        setMobileActionsOpen(false);
        setShowMoreMenu(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setReplyTo]);

  useEffect(() => {
    if (!showMoreMenu) return;
    const handler = (event: MouseEvent) => {
      if (!(event.target as HTMLElement).closest("[data-more-menu]")) {
        setShowMoreMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showMoreMenu]);

  useEffect(() => {
    const unsubReconnecting = chatAPI.on("reconnecting", (msg) => {
      setReconnectAttempt((msg as unknown as { attempt: number }).attempt);
      setReconnectFailed(false);
    });
    const unsubReconnected = chatAPI.on("reconnected", () => {
      setReconnectAttempt(null);
      setReconnectFailed(false);
      setConnected(true);
    });
    const unsubReconnectFailed = chatAPI.on("reconnect_failed", () => {
      setReconnectAttempt(null);
      setReconnectFailed(true);
    });
    return () => {
      unsubReconnecting();
      unsubReconnected();
      unsubReconnectFailed();
    };
  }, [setConnected]);

  useEffect(() => {
    const unsub = chatAPI.on("thread_messages", (msg: { type: string; parent_message_id?: string; messages?: ChatMessage[] }) => {
      if (msg.messages) {
        setThreadMessages(msg.messages);
      }
    });
    return () => unsub();
  }, []);

  const toggleLang = useCallback(() => {
    const next: Language = lang === "zh-CN" ? "en-US" : "zh-CN";
    setLang(next);
  }, [lang, setLang]);

  const handleDisconnect = useCallback(() => {
    disconnect();
    reset();
  }, [disconnect, reset]);

  const handleSpaceSelect = useCallback(
    (space: ChatSpace) => {
      setActiveSpace(space);
      setCurrentChat({ type: "public" });
      if (space !== "public") {
        setAssistantId(space);
      }
      setSidebarOpen(false);
    },
    [setCurrentChat],
  );

  const sendHandler = useCallback(
    (content: string) => {
      // In the assistant space, send as a private 1:1 to the bot (to: botName)
      // so it never hits the public room. In the public room, broadcast.
      if (assistantMode) {
        sendMessage(content, activeAssistant.name);
      } else {
        sendMessage(content);
      }
    },
    [assistantMode, activeAssistant.name, sendMessage],
  );

  const handleExport = useCallback(
    async (format: "json" | "text") => {
      try {
        const blob = await chatAPI.exportChat("public", format);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const ext = format === "json" ? "json" : "txt";
        const now = new Date().toISOString().slice(0, 10);
        a.download = `chat_export_public_${now}.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setExportToast(t("export.exportSuccess"));
      } catch {
        setExportToast(t("export.exportError"));
      }
    },
    [t],
  );

  const handleDelete = useCallback((messageId: string) => {
    chatAPI.deleteMessage(messageId);
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

  const handleSendThreadReply = useCallback(
    (content: string) => {
      if (!threadParent) return;
      chatAPI.sendThreadReply(threadParent.id, content);
    },
    [threadParent],
  );

  const handleReply = useCallback((message: ChatMessage) => {
    setReplyTo(message);
  }, [setReplyTo]);

  const headerTitle = assistantMode ? activeAssistant.name : t("chat.roomName");
  const modelLabel = modelDisplayName(serverConfig?.model || activeAssistant.model.id);
  const headerSubtitle = assistantMode
    ? `${t("chat.dmLabel")} · ${modelLabel}`
    : t("chat.subtitle");

  const reconnectLabel = reconnectFailed
    ? t("system.reconnectFailed")
    : t("system.reconnecting", { attempt: String((reconnectAttempt ?? 0) + 1) });

  const renderReconnectDot = () => {
    if (connected) return null;
    return (
      <span className="relative flex h-2 w-2 flex-shrink-0" title={reconnectLabel}>
        <span
          className={cn(
            "absolute inline-flex h-full w-full rounded-full",
            reconnectFailed ? "bg-danger" : "bg-warning",
            reconnectAttempt !== null && !reconnectFailed && "animate-ping opacity-40",
          )}
        />
        <span className={cn("relative inline-flex h-2 w-2 rounded-full", reconnectFailed ? "bg-danger" : "bg-warning")} />
      </span>
    );
  };

  const actionMenu = (
    <>
      <button
        onClick={() => {
          toggleLang();
          setMobileActionsOpen(false);
          setShowMoreMenu(false);
        }}
        className="td-chat-list-row flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
      >
        <Globe className="h-4 w-4" />
        {t("lang.switchTo")}
      </button>
      {(() => {
        const theme = getStoredTheme();
        const ThemeIcon = theme === "dark" ? Moon : theme === "system" ? Monitor : Sun;
        const labels: Record<string, string> = {
          light: t("settings.themeLight"),
          dark: t("settings.themeDark"),
          system: t("settings.themeSystem"),
        };
        return (
          <button
            onClick={() => {
              const idx = cycleOrder.indexOf(theme);
              const next = cycleOrder[(idx + 1) % cycleOrder.length];
              applyTheme(next);
              localStorage.setItem(THEME_STORAGE_KEY, next);
              window.dispatchEvent(new CustomEvent("tdchat:theme-changed", { detail: { theme: next } }));
              setMobileActionsOpen(false);
              setShowMoreMenu(false);
            }}
            className="td-chat-list-row flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
          >
            <ThemeIcon className="h-4 w-4" />
            {labels[theme]}
          </button>
        );
      })()}
      <button
        onClick={() => {
          handleExport("json");
          setMobileActionsOpen(false);
          setShowMoreMenu(false);
        }}
        className="td-chat-list-row flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
      >
        <Download className="h-4 w-4" />
        {t("export.exportJson")}
      </button>
      <button
        onClick={() => {
          handleExport("text");
          setMobileActionsOpen(false);
          setShowMoreMenu(false);
        }}
        className="td-chat-list-row flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
      >
        <Download className="h-4 w-4" />
        {t("export.exportText")}
      </button>
      <button
        onClick={() => {
          setSettingsOpen(true);
          setMobileActionsOpen(false);
          setShowMoreMenu(false);
        }}
        className="td-chat-list-row flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
      >
        <Settings className="h-4 w-4" />
        {t("settings.openSettings")}
      </button>
    </>
  );

  return (
    <div ref={mainRef} className="td-chat-shell flex h-screen-mobile overflow-hidden">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden animate-fade-in"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 transition-transform duration-300 ease-in-out lg:relative lg:flex lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <ErrorBoundary fallback={<div className="p-4 text-sm text-muted-foreground/50">Navigation unavailable</div>}>
          <LightChatSidebar
            activeSpace={activeSpace}
            activeAssistantId={assistantId}
            onSelectSpace={handleSpaceSelect}
            onClose={() => setSidebarOpen(false)}
            onOpenSettings={() => setSettingsOpen(true)}
            onDisconnect={handleDisconnect}
          />
        </ErrorBoundary>
      </div>

      <div className="td-chat-main flex min-w-0 flex-1 flex-col overflow-hidden" style={{ paddingBottom: keyboardPadding }}>
        <div
          className="td-chat-header flex items-center gap-2 glass-header border-b border-[var(--border-base)] px-3 pb-2 lg:hidden"
          style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label={t("a11y.openSidebar")}
            className="td-chat-header-action touch-target rounded-[var(--radius-control)] p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1 px-1">
            <h1 className="td-chat-header-title flex items-center gap-1.5 truncate text-[15px] font-semibold leading-5 text-foreground" data-visual="mobile-chat-title">
              {renderReconnectDot()}
              {headerTitle}
            </h1>
            {unauthenticated ? (
              <button
                onClick={() => setShowAuthModal(true)}
                className="mt-0.5 inline-flex min-h-11 items-center rounded-[var(--radius-control)] bg-[var(--accent)]/10 px-3 text-[10px] font-medium text-[var(--accent)] hover:bg-[var(--accent)]/20"
              >
                {t("join.buttonJoin")}
              </button>
            ) : (
              <p className="truncate text-[11px] text-muted-foreground">{headerSubtitle}</p>
            )}
          </div>
          <ThemeToggle />
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setMobileActionsOpen((open) => !open)}
              aria-label={t("a11y.moreActions")}
              className="td-chat-header-action touch-target rounded-[var(--radius-control)] p-2 text-muted-foreground/70 hover:bg-muted hover:text-foreground"
            >
              <MoreHorizontal className="h-5 w-5" />
            </button>
            {mobileActionsOpen && (
              <div className="td-chat-menu absolute right-0 top-full z-50 mt-1 w-52 rounded-[var(--radius-panel)] py-1 animate-scale-in origin-top-right">
                {actionMenu}
                <button
                  onClick={handleDisconnect}
                  className="td-chat-list-row flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-destructive/80 hover:text-destructive"
                >
                  <LogOut className="h-4 w-4" />
                  {t("chat.disconnect")}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="td-chat-header hidden items-center justify-between gap-4 glass-header border-b border-[var(--border-base)] px-6 py-3.5 lg:flex">
          <div className="min-w-0 flex-1">
            <h1 className="td-chat-header-title flex items-center gap-2 truncate text-base font-semibold text-foreground" title={headerTitle} data-visual="desktop-chat-title">
              {renderReconnectDot()}
              {headerTitle}
            </h1>
            {unauthenticated ? (
              <p className="td-chat-header-subtitle flex items-center gap-2 truncate text-xs text-muted-foreground">
                <span className="opacity-70">{t("chat.guestWarning")}</span>
                <button
                  onClick={() => setShowAuthModal(true)}
                  className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] bg-[var(--accent)]/10 px-3 text-[11px] font-medium text-[var(--accent)] hover:bg-[var(--accent)]/20"
                >
                  {t("join.buttonJoin")}
                </button>
              </p>
            ) : (
              <p className="td-chat-header-subtitle truncate text-xs text-muted-foreground">{headerSubtitle}</p>
            )}
          </div>
          <div className="flex min-w-0 items-center justify-end gap-2">
            <button
              onClick={() => setConversationSearchOpen((prev) => !prev)}
              aria-label={t("search.inConversation")}
              className="td-chat-header-action flex min-h-11 items-center gap-2 whitespace-nowrap rounded-[var(--radius-control)] px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Search className="h-4 w-4" />
              {t("search.pressCtrlF")}
            </button>
            <div className="relative" data-more-menu>
              <button
                onClick={() => setShowMoreMenu(!showMoreMenu)}
                aria-label={t("more.label")}
                className="td-chat-header-action flex min-h-11 items-center gap-2 whitespace-nowrap rounded-[var(--radius-control)] px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <MoreHorizontal className="h-4 w-4" />
                {t("more.label")}
              </button>
              {showMoreMenu && (
                <div className="td-chat-menu absolute right-0 top-full z-50 mt-1 min-w-[180px] rounded-[var(--radius-panel)] py-1">
                  {actionMenu}
                </div>
              )}
            </div>
            <button
              onClick={handleDisconnect}
              aria-label={t("chat.disconnect")}
              className="td-chat-header-action flex min-h-11 items-center gap-2 whitespace-nowrap rounded-[var(--radius-control)] px-3 py-2 text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive/80"
            >
              <LogOut className="h-4 w-4" />
              {t("chat.leave")}
            </button>
          </div>
        </div>

        {latestMention && (
          <div className="td-chat-statusbar flex items-center gap-3 border-b border-mention/50 bg-mention/10 px-6 py-2 text-xs animate-slide-up">
            <AtSign className="h-3.5 w-3.5 flex-shrink-0 text-mention" />
            <span className="min-w-0 flex-1 truncate text-foreground/80">
              <span className="font-medium">{latestMention.from}</span> {t("mention.mentionedYou")}:{" "}
              <span className="text-muted-foreground/70">{latestMention.content}</span>
            </span>
            <button
              onClick={() => {
                setLatestMention(null);
                if (latestMention.messageId) {
                  window.dispatchEvent(new CustomEvent("tdchat:scroll-to-message", { detail: { id: latestMention.messageId } }));
                }
              }}
              className="rounded-[var(--radius-control)] px-2 py-1 text-[10px] font-medium text-mention hover:bg-mention/15"
            >
              {t("mention.view")}
            </button>
            <button
              onClick={() => setLatestMention(null)}
              className="rounded-[var(--radius-control)] p-1 text-muted-foreground/50 hover:text-muted-foreground"
              aria-label={t("mention.dismiss")}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {pinnedMessages.length > 0 && (
          <div className="td-chat-statusbar flex items-center gap-2 overflow-x-auto border-b px-6 py-1.5 scrollbar-thin">
            <Pin className="h-3 w-3 flex-shrink-0 text-muted-foreground/50" />
            {pinnedMessages.map((message) => (
              <button
                key={message.id}
                onClick={() => {
                  const el = document.getElementById(`msg-${message.id}`);
                  if (!el) return;
                  el.scrollIntoView({ behavior: "smooth", block: "center" });
                  el.classList.add("highlight-flash");
                  setTimeout(() => el.classList.remove("highlight-flash"), 2000);
                }}
                className="td-chat-pill max-w-[200px] flex-shrink-0 truncate rounded-[var(--radius-control)] px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground"
              >
                {message.username}: {(message.content || "").slice(0, 40)}
                {(message.content || "").length > 40 ? "..." : ""}
              </button>
            ))}
          </div>
        )}

        <ConversationSearch
          open={conversationSearchOpen}
          onClose={() => {
            setConversationSearchOpen(false);
            setSearchHighlight("");
          }}
          onHighlightChange={setSearchHighlight}
        />

        <div className="td-chat-transcript relative flex flex-1 flex-col overflow-hidden">
          <div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden transition-opacity duration-150", convFade ? "opacity-45" : "opacity-100")}>
            <ErrorBoundary fallback={<div className="flex h-full items-center justify-center text-sm text-muted-foreground/50">Chat transcript unavailable</div>}>
              <MessageTranscript
                onReply={handleReply}
                onDelete={handleDelete}
                onOpenThread={handleOpenThread}
                highlight={searchHighlight}
                scrollContainerRef={transcriptContainerRef}
                messages={assistantMode ? privateBotMessages : undefined}
                conversationKey={assistantMode ? `dm-${activeAssistant.name}` : "public"}
                disableInfiniteScroll={assistantMode}
              />
            </ErrorBoundary>
          </div>

          <ErrorBoundary fallback={<div className="p-4 text-sm text-muted-foreground/50">Chat input unavailable</div>}>
            <ChatInput
              onSend={sendHandler}
              assistantContext={assistantMode ? { assistant: activeAssistant, modelLabel } : null}
            />
          </ErrorBoundary>
        </div>
      </div>

      <Suspense fallback={null}>
        {threadParent && (
          <ThreadPanel
            parentMessage={threadParent}
            threadMessages={threadMessages}
            onClose={handleCloseThread}
            onSendReply={handleSendThreadReply}
          />
        )}
      </Suspense>

      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
      <SearchBar />

      {exportToast && (
        <div className="fixed bottom-6 left-1/2 z-50 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-full bg-primary px-4 py-2 text-center text-sm font-medium text-primary-foreground shadow-[var(--e-3)] animate-slide-up whitespace-normal">
          {exportToast}
        </div>
      )}

      {lightboxImage && (
        <Suspense fallback={null}>
          <ImageLightbox imageUrl={lightboxImage} onClose={() => useChatStore.getState().setLightboxImage(null)} />
        </Suspense>
      )}
    </div>
  );
}
