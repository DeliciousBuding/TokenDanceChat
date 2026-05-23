import { memo, useMemo, useState, useCallback, useEffect, lazy, Suspense } from "react";
import {
  Users,
  MessageCircle,
  X,
  UserPlus,
  Hash,
  User,
  Plus,
  Volume2,
  VolumeX,
  Pin,
  PinOff,
  BellOff,
  Archive,
  ChevronDown,
  ChevronRight,
  Clock,
  Info,
  Key,
  FolderOpen,
  FolderPlus,
  Settings,
  Activity,
  Search,
} from "lucide-react";
import { useChatStore } from "@/stores/chatStore";
import { useTranslation } from "@/i18n/context";
import { cn, avatarGradient, formatLastSeen, formatTime } from "@/lib/utils";
import { Avatar } from "@/components/Avatar";
import { assistants, modelCatalog } from "@/lib/assistantRegistry";
import { AssistantIcon } from "@/components/AssistantIcon";
import { isSoundEnabled, setSoundEnabled } from "@/lib/soundToggle";
import { chatAPI } from "@/lib/api";

const InviteCodeManager = lazy(() => import("@/components/InviteCodeManager").then((m) => ({ default: m.InviteCodeManager })));
const SettingsModal = lazy(() => import("@/components/SettingsModal").then((m) => ({ default: m.SettingsModal })));
const AdminPanel = lazy(() => import("@/components/AdminPanel").then((m) => ({ default: m.AdminPanel })));

interface SidebarProps {
  collapsed?: boolean;
  onClose?: () => void;
  onStartDM?: (username: string) => void;
  onAddFriend?: (username: string) => void;
  onCreateGroup?: () => void;
  onMentionAssistant?: (name: string) => void;
  /** Sets for which users have pending friend requests */
  pendingFriendUsers?: string[];
}

const UserListItem = memo(function UserListItem({
  user,
  isSelf,
  youLabel,
  sendMessageLabel,
  addFriendLabel,
  onStartDM,
  onAddFriend,
  isFriend,
  hasPendingRequest,
  onlineLabel,
  requestPendingLabel,
  displayName,
  avatarUrl,
  statusText,
}: {
  user: string;
  isSelf: boolean;
  youLabel: string;
  sendMessageLabel: string;
  addFriendLabel: string;
  onStartDM?: (username: string) => void;
  onAddFriend?: (username: string) => void;
  isFriend?: boolean;
  hasPendingRequest?: boolean;
  onlineLabel: string;
  requestPendingLabel: string;
  displayName?: string;
  avatarUrl?: string | null;
  statusText?: string;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const shownName = displayName || user;

  return (
    <button
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors w-full text-left",
        isSelf
          ? "bg-accent text-foreground"
          : "text-foreground/80 hover:bg-accent",
      )}
      onClick={() => {
        if (!isSelf) {
          setShowMenu(!showMenu);
        }
      }}
      aria-label={`${shownName}${isSelf ? ` (${youLabel})` : ""}`}
    >
      <div className="relative flex-shrink-0">
        <Avatar
          src={avatarUrl || null}
          name={shownName}
          size="sm"
        />
        <span className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5 rounded-full border-2 border-card bg-online animate-pulse-dot" role="status" aria-label={onlineLabel} />
      </div>
      <div className="flex-1 min-w-0">
        <span className="block truncate text-sm">{shownName}</span>
        {statusText && (
          <span className="block truncate text-[10px] text-muted-foreground/55">
            {statusText}
          </span>
        )}
      </div>
      {isFriend && !isSelf && (
        <span className="flex-shrink-0 text-[10px] text-muted-foreground/50">
          &#10003;
        </span>
      )}
      {isSelf && (
        <span className="flex-shrink-0 rounded-md bg-online/10 px-1.5 py-0.5 text-[10px] font-medium text-online">
          {youLabel}
        </span>
      )}

      {/* Context menu for non-self users */}
      {!isSelf && showMenu && (
        <div
          className="absolute right-3 z-30 mt-12 rounded-lg border border-border bg-card shadow-2xl py-1 animate-scale-in"
          onClick={(e) => e.stopPropagation()}
          style={{ minWidth: "140px" }}
        >
          {onStartDM && (
            <button
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground/80 hover:bg-accent transition-colors"
              onClick={() => {
                setShowMenu(false);
                onStartDM(user);
              }}
            >
              <MessageCircle className="h-3 w-3" />
              {sendMessageLabel}
            </button>
          )}
          {onAddFriend && !isFriend && !hasPendingRequest && (
            <button
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground/80 hover:bg-accent transition-colors"
              onClick={() => {
                setShowMenu(false);
                onAddFriend(user);
              }}
            >
              <UserPlus className="h-3 w-3" />
              {addFriendLabel}
            </button>
          )}
          {hasPendingRequest && (
            <span className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground/50">
              {requestPendingLabel}
            </span>
          )}
        </div>
      )}
    </button>
  );
});

export function Sidebar({
  collapsed,
  onClose,
  onStartDM,
  onAddFriend,
  onCreateGroup,
  onMentionAssistant,
  pendingFriendUsers = [],
}: SidebarProps) {
  const { t } = useTranslation();
  const {
    onlineUsers,
    username,
    friends,
    groups,
    messages,
    currentChat,
    setCurrentChat,
    unreadByConversation,
    userStatusList,
    pinnedConversations,
    mutedConversations,
    archivedConversations,
    userProfiles,
    setGroupInfoPanel,
    folders,
    blockedUsers,
    lastPreviews,
  } = useChatStore();

  // Sound toggle state
  const [soundOn, setSoundOn] = useState(() => isSoundEnabled());
  const toggleSound = useCallback(() => {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
  }, [soundOn]);

  // Invite code manager state
  const [inviteOpen, setInviteOpen] = useState(false);

  // Unified settings modal
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);

  // Right-click context menu state for conversation pinning
  const [contextMenu, setContextMenu] = useState<{
    key: string;
    x: number;
    y: number;
  } | null>(null);

  const [folderSubmenu, setFolderSubmenu] = useState(false);

  // Separate current user from others for visual grouping
  const otherUsers = onlineUsers.filter((u) => u !== username);
  const hasSelf = onlineUsers.includes(username);

  // Users with DM history (derived from recent messages)
  const dmPartners = useMemo(() => {
    const partners = new Set<string>();
    const recent = messages.slice(-200);
    for (const m of recent) {
      if (m.from && m.from !== username && !partners.has(m.from) && !blockedUsers.includes(m.from)) {
        partners.add(m.from);
      }
      if (m.to && m.to !== username && m.username === username && !partners.has(m.to) && !blockedUsers.includes(m.to)) {
        partners.add(m.to);
      }
    }
    return [...partners];
  }, [messages, username, blockedUsers]);

  // Convert groups record to array
  const groupList = useMemo(() => Object.values(groups), [groups]);

  // O(1) lookup: previews are maintained in the store (lastPreviews map)
  // Convert to Map for compatibility with existing .get() callers
  const previewMap = useMemo(() => {
    const map = new Map<string, { content: string; timestamp: number; sender: string }>();
    for (const [key, val] of Object.entries(lastPreviews)) {
      map.set(key, val);
    }
    return map;
  }, [lastPreviews]);

  // Friend users who are online
  const onlineFriends = friends.filter((f) => onlineUsers.includes(f));

  // Sort other users for display: friends first, then DM partners, then others
  const sortedOnlineGroups = useMemo(() => {
    const friendsSet = new Set(friends);
    const dmSet = new Set(dmPartners);
    const friendUsers: string[] = [];
    const dmUsers: string[] = [];
    const restUsers: string[] = [];
    for (const u of otherUsers) {
      if (friendsSet.has(u)) {
        friendUsers.push(u);
      } else if (dmSet.has(u)) {
        dmUsers.push(u);
      } else {
        restUsers.push(u);
      }
    }
    return { friends: friendUsers, dmPartners: dmUsers, others: restUsers };
  }, [otherUsers, friends, dmPartners]);

  // Resolve a conversation key to a display name.
  const resolveConversationName = useCallback(
    (key: string): string => {
      if (key === "public") return t("sidebar.publicChat");
      if (key.startsWith("dm:")) return key.slice(3);
      if (key.startsWith("group:")) return key.slice(6);
      return key;
    },
    [t],
  );

  // Navigate to a conversation by key.
  const navigateToConversation = useCallback(
    (key: string) => {
      if (key === "public") {
        setCurrentChat({ type: "public" });
      } else if (key.startsWith("dm:")) {
        setCurrentChat({ type: "dm", username: key.slice(3) });
      } else if (key.startsWith("group:")) {
        setCurrentChat({ type: "group", name: key.slice(6) });
      }
    },
    [setCurrentChat],
  );

  // Handle right-click context menu for conversation pinning.
  const handleContextMenu = useCallback(
    (e: React.MouseEvent, key: string) => {
      e.preventDefault();
      setContextMenu({ key, x: e.clientX, y: e.clientY });
    },
    [],
  );

  const handlePinToggle = useCallback(
    (key: string) => {
      if (pinnedConversations.includes(key)) {
        chatAPI.sendUnpinConversation(key);
      } else {
        chatAPI.sendPinConversation(key);
      }
      setContextMenu(null);
    },
    [pinnedConversations],
  );

  const handleMuteDuration = useCallback(
    (key: string, hours: number) => {
      const mutedUntil = hours === 0 ? 0 : Date.now() + hours * 60 * 60 * 1000;
      chatAPI.sendSetNotificationPrefs(key, mutedUntil, true);
      setContextMenu(null);
    },
    [],
  );

  const handleUnmuteConversation = useCallback((key: string) => {
    chatAPI.sendSetNotificationPrefs(key, 0, true);
    setContextMenu(null);
  }, []);

  const [archivedExpanded, setArchivedExpanded] = useState(false);

  const handleArchiveToggle = useCallback(
    (key: string) => {
      if (archivedConversations.includes(key)) {
        chatAPI.sendUnarchiveConversation(key);
      } else {
        chatAPI.sendArchiveConversation(key);
      }
      setContextMenu(null);
    },
    [archivedConversations],
  );

  // Folder helpers
  const getConvFolderId = useCallback(
    (key: string): string | null => {
      for (const f of folders) {
        if (f.items.includes(key)) return f.id;
      }
      return null;
    },
    [folders],
  );

  const handleAddToFolder = useCallback(
    (folderId: string) => {
      if (contextMenu?.key) {
        chatAPI.sendFolderAddConversation(folderId, contextMenu.key);
      }
      setContextMenu(null);
      setFolderSubmenu(false);
    },
    [contextMenu],
  );

  const handleRemoveFromFolder = useCallback(
    (key: string) => {
      const fid = getConvFolderId(key);
      if (fid) {
        chatAPI.sendFolderRemoveConversation(fid, key);
      }
      setContextMenu(null);
    },
    [getConvFolderId],
  );

  // Fetch folders on mount
  const connected = useChatStore((s) => s.connected);
  useEffect(() => {
    if (connected) {
      chatAPI.sendFolderList();
    }
  }, [connected]);
  useEffect(() => {
    if (!contextMenu) { setFolderSubmenu(false); return; }
    const handler = () => { setContextMenu(null); setFolderSubmenu(false); };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [contextMenu]);

  // ---- P1 improvements ----

  // Fix 1: AI Assistants collapsible section
  const [aiAssistantsExpanded, setAiAssistantsExpanded] = useState(false);

  // Fix 2: Conversation search/filter
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // Debounce search input (150ms)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 150);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const isFiltering = debouncedQuery.trim().length > 0;

  // Filtered conversation results for search
  const filteredItems = useMemo(() => {
    if (!isFiltering) return null;
    const q = debouncedQuery.toLowerCase();
    const results: { type: "dm" | "group" | "friend"; name: string; key: string }[] = [];

    const addedKeys = new Set<string>();
    for (const partner of dmPartners) {
      if (partner.toLowerCase().includes(q)) {
        const key = `dm:${partner}`;
        addedKeys.add(key);
        results.push({ type: "dm", name: partner, key });
      }
    }
    for (const g of groupList) {
      if (g.name.toLowerCase().includes(q)) {
        results.push({ type: "group", name: g.name, key: `group:${g.name}` });
      }
    }
    for (const friend of friends) {
      if (friend.toLowerCase().includes(q)) {
        const key = `dm:${friend}`;
        if (!addedKeys.has(key)) {
          results.push({ type: "friend", name: friend, key });
        }
      }
    }
    return results;
  }, [isFiltering, debouncedQuery, dmPartners, groupList, friends]);

  // Inline bilingual labels for new UI (no translation file changes needed)
  // (removed — migrated to i18n t() calls)

  return (
    <aside
      aria-label={t("chat.roomName")}
      className={cn(
        "flex h-full flex-col border-r border-border bg-card transition-all duration-300 ease-out",
        collapsed ? "hidden" : "flex",
        "lg:flex lg:w-[312px] lg:min-w-[312px]",
        "w-full animate-fade-in",
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent">
          <MessageCircle
            className="h-5 w-5 text-primary"
          />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-foreground truncate">
            {t("sidebar.publicChat")}
          </h2>
          <p className="text-xs text-muted-foreground truncate">
            {t("sidebar.publicChatSub")}
          </p>
        </div>
        {/* Mobile close button */}
        {onClose && (
          <button
            onClick={onClose}
            aria-label={t("a11y.closeSidebar")}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Search filter (P1 #5) */}
      <div className="px-3 pt-2 pb-0.5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("sidebar.searchConversations")}
            aria-label={t("sidebar.searchConversations")}
            className="w-full rounded-lg border border-border bg-background/50 pl-9 pr-8 py-2 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded text-muted-foreground/50 hover:text-muted-foreground transition-colors"
              aria-label={t("a11y.clearSearch")}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Navigation: public chat */}
      <div className="px-3 pt-2 pb-0.5">
        <button
          onClick={() => setCurrentChat({ type: "public" })}
          onContextMenu={(e) => handleContextMenu(e, "public")}
          className={cn(
            "flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm transition-all border-l-2 border-l-transparent hover:border-l-primary",
            currentChat.type === "public"
              ? "bg-accent text-foreground border-l-primary"
              : "text-foreground/70 hover:bg-accent hover:text-foreground",
          )}
        >
          <Hash className="h-4 w-4 text-muted-foreground" />
          <span>{t("sidebar.publicChat")}</span>
        </button>
      </div>

      {/* Pinned conversations */}
      {pinnedConversations.length > 0 && (
        <div className="px-3 pt-2 pb-1">
          <span className="px-2 text-xs font-medium text-muted-foreground/60 uppercase tracking-wider">
            {t("sidebar.pinned")}
          </span>
          {pinnedConversations.map((key) => {
            const name = resolveConversationName(key);
            const isDM = key.startsWith("dm:");
            const isGroup = key.startsWith("group:");
            const isPublic = key === "public";
            return (
              <div
                key={key}
                className="group flex min-h-10 w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-all border-l-2 border-l-transparent hover:border-l-primary"
              >
                <button
                  onClick={() => navigateToConversation(key)}
                  className={cn(
                    "flex flex-1 items-center gap-2 min-w-0 text-left transition-colors",
                    (currentChat.type === "public" && isPublic) ||
                      (currentChat.type === "dm" && isDM && currentChat.username === name) ||
                      (currentChat.type === "group" && isGroup && currentChat.name === name)
                      ? "text-foreground"
                      : "text-foreground/70 hover:text-foreground",
                  )}
                >
                  <Pin className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                  {isPublic && <Hash className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />}
                  {isDM && <User className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />}
                  {isGroup && <Hash className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />}
                  <span className="truncate">{name}</span>
                </button>
                <button
                  onClick={() => chatAPI.sendUnpinConversation(key)}
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground/40 opacity-0 group-hover:opacity-100 hover:text-muted-foreground hover:bg-accent transition-all"
                  aria-label={t("sidebar.unpinConversation")}
                  title={t("sidebar.unpinConversation")}
                >
                  <PinOff className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Scrollable middle area: DMs, Groups, Friends, AI Assistants */}
      <div className="overflow-y-auto flex-1 min-h-0">

      {/* Search results (when filtering) — replaces DMs / Groups / Friends */}
      {isFiltering ? (
        <div className="px-3 pt-1.5 pb-0.5">
          <span className="px-2 text-xs font-medium text-muted-foreground/60 uppercase tracking-wider">
            {t("sidebar.searchResults")}
          </span>
          {filteredItems && filteredItems.length > 0 ? (
            filteredItems.map((item) => (
              <button
                key={item.key}
                onClick={() => {
                  if (item.type === "dm" || item.type === "friend") {
                    setCurrentChat({ type: "dm", username: item.name });
                  } else if (item.type === "group") {
                    setCurrentChat({ type: "group", name: item.name });
                  }
                }}
                onContextMenu={(e) => handleContextMenu(e, item.key)}
                className={cn(
                  "flex min-h-10 w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-all border-l-2 border-l-transparent hover:border-l-primary",
                  (currentChat.type === "dm" && currentChat.username === item.name) ||
                  (currentChat.type === "group" && currentChat.name === item.name)
                    ? "bg-accent text-foreground border-l-primary"
                    : "text-foreground/70 hover:bg-accent hover:text-foreground",
                )}
              >
                {item.type === "group" ? (
                  <Hash className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                ) : (
                  <User className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0 text-left">
                  <span className="block truncate">{item.name}</span>
                  {/* Show preview for DMs and groups */}
                  {item.type !== "friend" && (() => {
                    const preview = previewMap.get(item.key);
                    if (!preview) return null;
                    return (
                      <div className="flex items-center w-full">
                        <span className="text-xs text-muted-foreground truncate max-w-[180px]">
                          {preview.content}
                        </span>
                        <span className="text-[10px] text-muted-foreground/60 ml-auto shrink-0">
                          {formatTime(preview.timestamp)}
                        </span>
                      </div>
                    );
                  })()}
                </div>
                {(() => {
                  const count = unreadByConversation[item.key];
                  if (count) {
                    return (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground animate-pulse-badge shrink-0">
                        {count > 99 ? "99+" : count}
                      </span>
                    );
                  }
                  if (item.type === "friend") {
                    return <span className="h-2 w-2 rounded-full bg-online shrink-0" />;
                  }
                  if (item.type === "dm" && onlineUsers.includes(item.name)) {
                    return <span className="h-2 w-2 rounded-full bg-online shrink-0" />;
                  }
                  if (item.type === "group") {
                    const g = groups[item.name];
                    if (g) {
                      return (
                        <span className="text-[10px] text-muted-foreground/50 shrink-0">
                          {g.members.length}
                        </span>
                      );
                    }
                  }
                  return null;
                })()}
              </button>
            ))
          ) : (
            <div className="px-5 py-3">
              <span className="text-[11px] text-muted-foreground/35 italic">
                {t("sidebar.searchEmpty")}
              </span>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Direct Messages — moved above Assistants (P1 #4) */}
          {dmPartners.length > 0 && (
            <div className="px-3 pt-1.5 pb-0.5">
              <span className="px-2 text-xs font-medium text-muted-foreground/60 uppercase tracking-wider">
                {t("sidebar.directMessages")}
              </span>
              {dmPartners.map((partner) => {
                const preview = previewMap.get(`dm:${partner}`);
                return (
                <button
                  key={partner}
                  onClick={() =>
                    setCurrentChat({ type: "dm", username: partner })
                  }
                  onContextMenu={(e) => handleContextMenu(e, `dm:${partner}`)}
                  className={cn(
                    "flex min-h-10 w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-all border-l-2 border-l-transparent hover:border-l-primary",
                    currentChat.type === "dm" &&
                      currentChat.username === partner
                      ? "bg-accent text-foreground border-l-primary"
                      : "text-foreground/70 hover:bg-accent hover:text-foreground",
                  )}
                >
                  <User className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="block truncate">{partner}</span>
                    {preview && (
                      <div className="flex items-center w-full">
                        <span className="text-xs text-muted-foreground truncate max-w-[180px]">
                          {preview.content}
                        </span>
                        <span className="text-[10px] text-muted-foreground/60 ml-auto shrink-0">
                          {formatTime(preview.timestamp)}
                        </span>
                      </div>
                    )}
                  </div>
                  {(() => {
                    const count = unreadByConversation[`dm:${partner}`];
                    if (count) {
                      return (
                        <span key={`dm-${partner}-${count}`} className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground animate-pulse-badge shrink-0">
                          {count > 99 ? "99+" : count}
                        </span>
                      );
                    }
                    return onlineUsers.includes(partner) && (
                      <span className="h-2 w-2 rounded-full bg-online shrink-0" />
                    );
                  })()}
                </button>
              )})}
            </div>
          )}

          {/* Direct Messages: empty state */}
          {dmPartners.length === 0 && (
            <div className="px-5 py-0.5">
              <span className="text-[11px] text-muted-foreground/35 italic">
                {t("sidebar.noDMs")}
              </span>
            </div>
          )}

          {/* Groups section — moved above Assistants (P1 #4) */}
          <div className="mt-1 px-3 pt-1">
            <div className="flex items-center justify-between px-2">
              <span className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider">
                {t("sidebar.groups")}
              </span>
              {onCreateGroup && (
                <button
                  onClick={onCreateGroup}
                  aria-label={t("sidebar.createGroup")}
                  className="flex h-[44px] w-[44px] items-center justify-center rounded-lg text-muted-foreground/60 hover:text-muted-foreground hover:bg-accent transition-colors"
                >
                  <Plus className="h-4 w-4" />
                </button>
              )}
            </div>
            {groupList.map((g) => {
                const preview = previewMap.get(`group:${g.name}`);
                return (
              <button
                key={g.name}
                onClick={() => setCurrentChat({ type: "group", name: g.name })}
                onContextMenu={(e) => handleContextMenu(e, `group:${g.name}`)}
                className={cn(
                  "flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-all border-l-2 border-l-transparent hover:border-l-primary",
                  currentChat.type === "group" && currentChat.name === g.name
                    ? "bg-accent text-foreground border-l-primary"
                    : "text-foreground/70 hover:bg-accent hover:text-foreground",
                )}
              >
                <Hash className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="block truncate">{g.name}</span>
                  {preview && (
                    <div className="flex items-center w-full">
                      <span className="text-xs text-muted-foreground truncate max-w-[180px]">
                        {preview.content}
                      </span>
                      <span className="text-[10px] text-muted-foreground/60 ml-auto shrink-0">
                        {formatTime(preview.timestamp)}
                      </span>
                    </div>
                  )}
                </div>
                {(() => {
                  const count = unreadByConversation[`group:${g.name}`];
                  if (count) {
                    return (
                      <span key={`group-${g.name}-${count}`} className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground animate-pulse-badge shrink-0">
                        {count > 99 ? "99+" : count}
                      </span>
                    );
                  }
                  return (
                    <span className="text-[10px] text-muted-foreground/50 shrink-0">
                      {g.members.length}
                    </span>
                  );
                })()}
              </button>
            )})}
            {/* Groups: empty state */}
            {groupList.length === 0 && (
              <div className="px-2 py-0.5">
                <span className="text-[10px] text-muted-foreground/35 italic">
                  {t("sidebar.noGroups")}
                </span>
              </div>
            )}
          </div>

          {/* Friends section — moved above Assistants (P1 #4) */}
          <div className="mt-1 px-3 pt-1">
            <div className="flex items-center justify-between px-2">
              <span className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider">
                {t("sidebar.friends")}
              </span>
              <span className="text-xs text-muted-foreground/40">
                {friends.length}
              </span>
            </div>
            {onlineFriends.length > 0
              ? onlineFriends.map((friend) => (
                  <button
                    key={friend}
                    onClick={() =>
                      setCurrentChat({ type: "dm", username: friend })
                    }
                    className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground/80 transition-all border-l-2 border-l-transparent hover:border-l-primary hover:bg-accent"
                  >
                    <div
                      className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                      style={{ background: avatarGradient(friend) }}
                    >
                      {friend.charAt(0).toUpperCase()}
                    </div>
                    <span className="truncate">{friend}</span>
                    <span className="ml-auto h-2 w-2 rounded-full bg-online" />
                  </button>
                ))
              : friends.length > 0
                ? friends.map((friend) => {
                    const friendStatus = userStatusList.find((u) => u.username === friend);
                    const lsText = friendStatus && !friendStatus.online ? formatLastSeen(friendStatus.last_seen) : "";
                    return (
                    <div
                      key={friend}
                      className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-foreground/50"
                    >
                      <div
                        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white opacity-50"
                        style={{ background: avatarGradient(friend) }}
                      >
                        {friend.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="truncate block">{friend}</span>
                        {lsText && (
                          <span className="text-[10px] text-muted-foreground/40 block truncate">
                            {lsText}
                          </span>
                        )}
                      </div>
                      <span className="ml-auto h-2 w-2 flex-shrink-0 rounded-full bg-muted-foreground/30" />
                    </div>
                  )})
                : (
                  <div className="px-2 py-0.5">
                    <span className="text-[10px] text-muted-foreground/35 italic">
                      {t("sidebar.noFriends")}
                    </span>
                  </div>
                )}
          </div>
        </>
      )}

      {/* AI Assistants — collapsible section wrapping Assistants + Model Catalog (P1 #4) */}
      <div className="px-3 pt-1.5 pb-0.5">
        <button
          onClick={() => setAiAssistantsExpanded(!aiAssistantsExpanded)}
          aria-expanded={aiAssistantsExpanded}
          className="flex min-h-9 w-full items-center gap-1 px-2 py-1.5 text-xs font-medium text-muted-foreground/60 uppercase tracking-wider hover:text-muted-foreground transition-colors"
        >
          {aiAssistantsExpanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          {t("sidebar.aiAssistants")}
        </button>
        {aiAssistantsExpanded && (
          <>
            {/* Assistants */}
            <div className="pt-0.5 pb-0.5">
              <span className="px-2 text-xs font-medium text-muted-foreground/60 uppercase tracking-wider">
                {t("sidebar.assistants")}
              </span>
              {assistants.map((assistant) => (
                <button
                  key={assistant.id}
                  onClick={() => {
                    setCurrentChat({ type: "public" });
                    onMentionAssistant?.(assistant.name);
                    onClose?.();
                  }}
                  className="mt-1 flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-foreground/80 transition-all border-l-2 border-l-transparent hover:border-l-primary hover:bg-accent hover:text-foreground"
                >
                  <AssistantIcon assistant={assistant} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{assistant.name}</span>
                    <span className="block truncate text-xs text-muted-foreground/55">
                      {assistant.label} · {assistant.model.name}
                    </span>
                  </span>
                  <span className="h-2 w-2 rounded-full bg-online animate-pulse-dot" aria-label={assistant.status} />
                </button>
              ))}
            </div>

            {/* Model catalog */}
            <div className="pt-0.5 pb-0.5">
              <span className="px-2 text-xs font-medium text-muted-foreground/60 uppercase tracking-wider">
                {t("sidebar.models")}
              </span>
              <div className="mt-1 grid grid-cols-2 gap-1">
                {modelCatalog.slice(0, 4).map((model) => (
                  <div
                    key={model.id}
                    data-testid="sidebar-model-card"
                    data-visual="sidebar-model-card"
                    className="flex min-h-9 min-w-0 items-center gap-1.5 rounded-lg border border-border bg-background/45 px-2 py-1.5"
                    title={`${model.name} · ${model.protocol}`}
                  >
                    <AssistantIcon model={model} size="sm" />
                    <span className="min-w-0">
                      <span className="block truncate text-xs text-foreground/80">{model.providerName}</span>
                      <span className="block truncate text-[10px] text-muted-foreground/50">{model.context}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      </div>

      {/* Online users section */}
      <div className="max-h-[40%] overflow-hidden flex flex-col mt-1 min-h-0">
        <div data-visual="sidebar-online-users" className="flex items-center justify-between px-5 py-1.5">
          <div className="flex items-center gap-2">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {t("sidebar.onlineUsers")}
            </span>
          </div>
          <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-medium text-muted-foreground">
            {onlineUsers.length}
          </span>
        </div>

        {/* User list */}
        <div className="flex-1 overflow-y-auto px-3 py-1">
          {onlineUsers.length === 0 ? (
            !connected ? (
              <div className="flex flex-col items-center py-6 px-3 gap-1">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3 w-full px-3 py-2">
                    <div className="h-7 w-7 rounded-full bg-muted-foreground/10 animate-pulse" />
                    <div className="h-3 w-28 rounded bg-muted-foreground/10 animate-pulse" />
                  </div>
                ))}
                <p className="text-[11px] text-muted-foreground/40 mt-1">
                  {t("sidebar.connecting")}
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Users className="mb-2 h-6 w-6 opacity-30" />
                <p className="text-xs">{t("sidebar.emptyState")}</p>
              </div>
            )
          ) : (
            <div className="space-y-0.5 relative">
              {/* Current user at top */}
              {hasSelf && (
                <>
                  <UserListItem
                    user={username}
                    isSelf
                    youLabel={t("sidebar.you")}
                    sendMessageLabel={t("sidebar.sendMessage")}
                    addFriendLabel={t("sidebar.addFriend")}
                    onlineLabel={t("sidebar.online")}
                    requestPendingLabel={t("sidebar.requestPending")}
                    displayName={userProfiles[username]?.display_name || username}
                    avatarUrl={userProfiles[username]?.avatar_url || null}
                    statusText={userProfiles[username]?.status || ""}
                  />
                  {/* Divider between you and others */}
                  {otherUsers.length > 0 && (
                    <div className="flex items-center gap-2 px-3 py-1.5">
                      <div className="h-px flex-1 bg-accent" />
                    </div>
                  )}
                </>
              )}
              {/* Friends online sub-section header (only when friends AND non-friends coexist) */}
              {sortedOnlineGroups.friends.length > 0 && (sortedOnlineGroups.dmPartners.length > 0 || sortedOnlineGroups.others.length > 0) && (
                <div className="flex items-center gap-2 px-3 py-1.5">
                  <span className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider">
                    {t("sidebar.friendsOnline")}
                  </span>
                  <div className="h-px flex-1 bg-accent" />
                </div>
              )}
              {sortedOnlineGroups.friends.map((user) => (
                <UserListItem
                  key={user}
                  user={user}
                  isSelf={false}
                  youLabel={t("sidebar.you")}
                  sendMessageLabel={t("sidebar.sendMessage")}
                  addFriendLabel={t("sidebar.addFriend")}
                  onlineLabel={t("sidebar.online")}
                  requestPendingLabel={t("sidebar.requestPending")}
                  onStartDM={onStartDM}
                  onAddFriend={onAddFriend}
                  isFriend={friends.includes(user)}
                  hasPendingRequest={pendingFriendUsers.includes(user)}
                  displayName={userProfiles[user]?.display_name || user}
                  avatarUrl={userProfiles[user]?.avatar_url || null}
                  statusText={userProfiles[user]?.status || ""}
                />
              ))}
              {sortedOnlineGroups.dmPartners.map((user) => (
                <UserListItem
                  key={user}
                  user={user}
                  isSelf={false}
                  youLabel={t("sidebar.you")}
                  sendMessageLabel={t("sidebar.sendMessage")}
                  addFriendLabel={t("sidebar.addFriend")}
                  onlineLabel={t("sidebar.online")}
                  requestPendingLabel={t("sidebar.requestPending")}
                  onStartDM={onStartDM}
                  onAddFriend={onAddFriend}
                  isFriend={friends.includes(user)}
                  hasPendingRequest={pendingFriendUsers.includes(user)}
                  displayName={userProfiles[user]?.display_name || user}
                  avatarUrl={userProfiles[user]?.avatar_url || null}
                  statusText={userProfiles[user]?.status || ""}
                />
              ))}
              {sortedOnlineGroups.others.map((user) => (
                <UserListItem
                  key={user}
                  user={user}
                  isSelf={false}
                  youLabel={t("sidebar.you")}
                  sendMessageLabel={t("sidebar.sendMessage")}
                  addFriendLabel={t("sidebar.addFriend")}
                  onlineLabel={t("sidebar.online")}
                  requestPendingLabel={t("sidebar.requestPending")}
                  onStartDM={onStartDM}
                  onAddFriend={onAddFriend}
                  isFriend={friends.includes(user)}
                  hasPendingRequest={pendingFriendUsers.includes(user)}
                  displayName={userProfiles[user]?.display_name || user}
                  avatarUrl={userProfiles[user]?.avatar_url || null}
                  statusText={userProfiles[user]?.status || ""}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Archived conversations */}
      {archivedConversations.length > 0 && (
        <div className="border-t border-border px-3 pt-2 pb-1">
          <button
            onClick={() => setArchivedExpanded(!archivedExpanded)}
            aria-expanded={archivedExpanded}
            className="flex min-h-9 w-full items-center gap-1 px-2 py-1.5 text-xs font-medium text-muted-foreground/60 uppercase tracking-wider hover:text-muted-foreground transition-colors"
          >
            {archivedExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            {t("sidebar.archivedSection")}
            <span className="ml-auto text-xs text-muted-foreground/40">
              {archivedConversations.length}
            </span>
          </button>
          {archivedExpanded && (
            <div className="space-y-0.5 mt-1">
              {archivedConversations.map((key) => {
                const name = resolveConversationName(key);
                const isDM = key.startsWith("dm:");
                const isGroup = key.startsWith("group:");
                const isPublic = key === "public";
                const isMuted = mutedConversations.includes(key);
                return (
                  <div
                    key={key}
                    className="group flex min-h-10 w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-all border-l-2 border-l-transparent hover:border-l-primary"
                    onContextMenu={(e) => handleContextMenu(e, key)}
                  >
                    <button
                      onClick={() => navigateToConversation(key)}
                      className="flex flex-1 items-center gap-2 min-w-0 text-left text-foreground/50 hover:text-foreground transition-colors"
                    >
                      <Archive className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/50" />
                      {isPublic && <Hash className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/50" />}
                      {isDM && <User className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/50" />}
                      {isGroup && <Hash className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/50" />}
                      <span className="truncate">{name}</span>
                    </button>
                    {isMuted && (
                      <BellOff className="h-3 w-3 flex-shrink-0 text-muted-foreground/40" />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-border px-5 py-3">
        <div className="flex items-center gap-2">
          <Avatar
            src={userProfiles[username]?.avatar_url || null}
            name={userProfiles[username]?.display_name || username}
            size="sm"
          />
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium text-foreground/80 block truncate">
              {userProfiles[username]?.display_name || username}
            </span>
            {userProfiles[username]?.status && (
              <span className="text-xs text-muted-foreground/50 block truncate">
                {userProfiles[username].status}
              </span>
            )}
          </div>
          <span className="flex h-2 w-2 rounded-full bg-online animate-pulse-dot" />
        </div>
        {/* Sound toggle */}
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-muted-foreground/60">{t("settings.sound")}</span>
          <button
            onClick={toggleSound}
            className="flex h-[44px] w-[44px] items-center justify-center rounded-lg text-muted-foreground/60 hover:text-muted-foreground hover:bg-accent transition-colors"
            aria-label={soundOn ? t("settings.soundOn") : t("settings.soundOff")}
            title={soundOn ? t("settings.soundOn") : t("settings.soundOff")}
          >
            {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>
        </div>
        {/* Invite code manager */}
        <div className="mt-1 flex items-center justify-between">
          <span className="text-xs text-muted-foreground/60">{t("invite.inviteCodes")}</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSettingsOpen(true)}
              className="flex h-[44px] w-[44px] items-center justify-center rounded-lg text-muted-foreground/60 hover:text-muted-foreground hover:bg-accent transition-colors"
              aria-label={t("settings.openSettings")}
              title={t("settings.openSettings")}
            >
              <Settings className="h-4 w-4" />
            </button>
            <button
              onClick={() => setInviteOpen(true)}
              className="flex h-[44px] w-[44px] items-center justify-center rounded-lg text-muted-foreground/60 hover:text-muted-foreground hover:bg-accent transition-colors"
              aria-label={t("invite.inviteCodes")}
              title={t("invite.inviteCodes")}
            >
              <Key className="h-4 w-4" />
            </button>
            <button
              onClick={() => setAdminOpen(true)}
              className="flex h-[44px] w-[44px] items-center justify-center rounded-lg text-muted-foreground/60 hover:text-muted-foreground hover:bg-accent transition-colors"
              aria-label={t("sidebar.adminDashboard")}
              title={t("sidebar.adminDashboard")}
            >
              <Activity className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Invite code manager modal */}
      <Suspense fallback={null}>
        {inviteOpen && <InviteCodeManager open={inviteOpen} onClose={() => setInviteOpen(false)} />}
      </Suspense>

      {/* Unified settings modal */}
      <Suspense fallback={null}>
        {settingsOpen && <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />}
      </Suspense>

      {/* Admin dashboard */}
      <Suspense fallback={null}>
        {adminOpen && <AdminPanel open={adminOpen} onClose={() => setAdminOpen(false)} />}
      </Suspense>

      {/* Right-click context menu for conversation pinning */}
      {contextMenu && (
        <div
          className="fixed z-50 rounded-lg border border-border bg-card shadow-2xl py-1 animate-scale-in"
          style={{ left: contextMenu.x, top: contextMenu.y, minWidth: "160px" }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground/80 hover:bg-accent transition-colors"
            onClick={() => handlePinToggle(contextMenu.key)}
          >
            {pinnedConversations.includes(contextMenu.key) ? (
              <>
                <PinOff className="h-3 w-3" />
                {t("sidebar.unpinConversation")}
              </>
            ) : (
              <>
                <Pin className="h-3 w-3" />
                {t("sidebar.pinConversation")}
              </>
            )}
          </button>
          {mutedConversations.includes(contextMenu.key) && (
            <button
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground/80 hover:bg-accent transition-colors"
              onClick={() => handleUnmuteConversation(contextMenu.key)}
            >
              <Volume2 className="h-3 w-3" />
              {t("sidebar.unmuteConversation")}
            </button>
          )}
          <div className="border-t border-border my-1" />
          <button
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground/80 hover:bg-accent transition-colors"
            onClick={() => handleMuteDuration(contextMenu.key, 1)}
          >
            <Clock className="h-3 w-3" />
            {t("settings.muteFor1h")}
          </button>
          <button
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground/80 hover:bg-accent transition-colors"
            onClick={() => handleMuteDuration(contextMenu.key, 8)}
          >
            <Clock className="h-3 w-3" />
            {t("settings.muteFor8h")}
          </button>
          <button
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground/80 hover:bg-accent transition-colors"
            onClick={() => handleMuteDuration(contextMenu.key, 24)}
          >
            <Clock className="h-3 w-3" />
            {t("settings.muteFor24h")}
          </button>
          <button
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground/80 hover:bg-accent transition-colors"
            onClick={() => handleMuteDuration(contextMenu.key, 876000)}
          >
            <BellOff className="h-3 w-3" />
            {t("settings.muteForever")}
          </button>
          <button
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground/80 hover:bg-accent transition-colors"
            onClick={() => handleArchiveToggle(contextMenu.key)}
          >
            {archivedConversations.includes(contextMenu.key) ? (
              <>
                <Archive className="h-3 w-3" />
                {t("sidebar.unarchiveConversation")}
              </>
            ) : (
              <>
                <Archive className="h-3 w-3" />
                {t("sidebar.archiveConversation")}
              </>
            )}
          </button>
          {/* Folder management */}
          <div className="border-t border-border my-1" />
          {(() => {
            const convKey = contextMenu.key;
            const folderId = getConvFolderId(convKey);
            if (folderId && !folderSubmenu) {
              return (
                <button
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground/80 hover:bg-accent transition-colors"
                  onClick={() => handleRemoveFromFolder(convKey)}
                >
                  <FolderOpen className="h-3 w-3" />
                  {t("folders.removeFromFolder")}
                </button>
              );
            }
            if (!folderSubmenu) {
              return (
                <button
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground/80 hover:bg-accent transition-colors"
                  onClick={(e) => { e.stopPropagation(); setFolderSubmenu(true); }}
                >
                  <FolderPlus className="h-3 w-3" />
                  {t("folders.addToFolder")}
                  <ChevronRight className="ml-auto h-3 w-3" />
                </button>
              );
            }
            // Folder submenu
            return (
              <>
                <button
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent transition-colors"
                  onClick={(e) => { e.stopPropagation(); setFolderSubmenu(false); }}
                >
                  <ChevronDown className="h-3 w-3 rotate-90" />
                  {t("folders.addToFolder")}
                </button>
                {folders.length === 0 ? (
                  <span className="block px-3 py-1 text-xs text-muted-foreground/50 italic">
                    {t("folders.noFolders")}
                  </span>
                ) : (
                  folders.map((f) => (
                    <button
                      key={f.id}
                      className="flex w-full items-center gap-2 pl-8 pr-3 py-1.5 text-xs text-foreground/80 hover:bg-accent transition-colors"
                      onClick={(e) => { e.stopPropagation(); handleAddToFolder(f.id); }}
                    >
                      <FolderOpen className="h-3 w-3" />
                      {f.name}
                    </button>
                  ))
                )}
              </>
            );
          })()}

          {/* Group info — only show for group conversations */}
          {contextMenu.key.startsWith("group:") && (
            <>
              <div className="border-t border-border my-1" />
              <button
                className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground/80 hover:bg-accent transition-colors"
                onClick={() => {
                  const grpName = contextMenu.key.slice(6); // Remove "group:" prefix.
                  setGroupInfoPanel(grpName);
                  setContextMenu(null);
                }}
              >
                <Info className="h-3 w-3" />
                {t("group.groupInfo")}
              </button>
            </>
          )}
        </div>
      )}
    </aside>
  );
}
