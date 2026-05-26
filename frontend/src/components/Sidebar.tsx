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

// ── UserListItem ──
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
        "h-11 rounded-lg flex items-center gap-2 px-2.5 cursor-pointer transition-colors w-full text-left",
        isSelf
          ? "bg-active text-[var(--text-primary)] font-medium"
          : "text-[var(--text-secondary)] hover:bg-hover",
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
        <span className="absolute -bottom-0.5 -right-0.5 flex h-2 w-2 rounded-full border-2 border-dialog-fill-0 bg-success" role="status" aria-label={onlineLabel} />
      </div>
      <div className="flex-1 min-w-0">
        <span className="block truncate text-[14px]">{shownName}</span>
        {statusText && (
          <span className="block truncate text-[11px] text-[var(--text-secondary)]">
            {statusText}
          </span>
        )}
      </div>
      {isFriend && !isSelf && (
        <span className="flex-shrink-0 text-[11px] text-[var(--text-secondary)]">
          &#10003;
        </span>
      )}
      {isSelf && (
        <span className="flex-shrink-0 rounded-md bg-success/10 px-1.5 py-0.5 text-[10px] font-medium text-success">
          {youLabel}
        </span>
      )}

      {/* Context menu for non-self users */}
      {!isSelf && showMenu && (
        <div
          className="absolute right-3 z-30 mt-12 rounded-lg bg-dialog-fill-0 border border-base shadow-lg py-1 animate-scale-in"
          onClick={(e) => e.stopPropagation()}
          style={{ minWidth: "140px" }}
        >
          {onStartDM && (
            <button
              className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-[var(--text-primary)] hover:bg-hover transition-colors"
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
              className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-[var(--text-primary)] hover:bg-hover transition-colors"
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
            <span className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-[var(--text-secondary)]">
              {requestPendingLabel}
            </span>
          )}
        </div>
      )}
    </button>
  );
});

// ── Three-dot trigger button (appears on conversation rows hover) ──
function ThreeDotTrigger({ onClick }: { onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      className="opacity-0 group-hover:opacity-100 flex h-11 w-11 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg hover:bg-3 transition-all"
      onClick={onClick}
      aria-label="More actions"
    >
      <span className="w-1 h-1 rounded-full bg-[var(--text-secondary)]" />
      <span className="w-1 h-1 rounded-full bg-[var(--text-secondary)]" />
      <span className="w-1 h-1 rounded-full bg-[var(--text-secondary)]" />
    </button>
  );
}

// ── Main Sidebar component ──
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

  // Users with DM history
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

  // Preview map
  const previewMap = useMemo(() => {
    const map = new Map<string, { content: string; timestamp: number; sender: string }>();
    for (const [key, val] of Object.entries(lastPreviews)) {
      map.set(key, val);
    }
    return map;
  }, [lastPreviews]);

  // Friend users who are online
  const onlineFriends = friends.filter((f) => onlineUsers.includes(f));

  // Sort other users for display
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

  // Resolve a conversation key to a display name
  const resolveConversationName = useCallback(
    (key: string): string => {
      if (key === "public") return t("sidebar.publicChat");
      if (key.startsWith("dm:")) return key.slice(3);
      if (key.startsWith("group:")) return key.slice(6);
      return key;
    },
    [t],
  );

  // Navigate to a conversation by key
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

  // Handle right-click context menu
  const handleContextMenu = useCallback(
    (e: React.MouseEvent, key: string) => {
      e.preventDefault();
      setContextMenu({ key, x: e.clientX, y: e.clientY });
    },
    [],
  );

  // Handle three-dot button click (opens same context menu)
  const handleThreeDotClick = useCallback(
    (e: React.MouseEvent, key: string) => {
      e.stopPropagation();
      e.preventDefault();
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setContextMenu({ key, x: rect.left, y: rect.bottom + 4 });
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

  // AI Assistants collapsible section
  const [aiAssistantsExpanded, setAiAssistantsExpanded] = useState(true);

  // Conversation search/filter
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

  // ── Shared helpers for rendering conversation rows ──

  const isConvActive = useCallback(
    (_key: string, name: string, isPublic?: boolean, isDM?: boolean, isGroup?: boolean) => {
      if (isPublic && currentChat.type === "public") return true;
      if (isDM && currentChat.type === "dm" && currentChat.username === name) return true;
      if (isGroup && currentChat.type === "group" && currentChat.name === name) return true;
      return false;
    },
    [currentChat],
  );

  const convItemClasses = useCallback(
    (active: boolean) =>
      cn(
        "h-11 rounded-lg flex items-center gap-2 px-2.5 cursor-pointer transition-colors",
        active
          ? "bg-active text-[var(--text-primary)] font-medium"
          : "text-[var(--text-secondary)] hover:bg-hover",
      ),
    [],
  );

  const renderConvIcon = (isDM: boolean, isGroup: boolean, isPublic: boolean, archived?: boolean) => {
    const cls = "h-3.5 w-3.5 flex-shrink-0";
    if (archived) return <Archive className={cls} />;
    if (isPublic) return <Hash className={cls} />;
    if (isDM) return <User className={cls} />;
    if (isGroup) return <Hash className={cls} />;
    return null;
  };

  return (
    <aside
      aria-label={t("chat.roomName")}
      className={cn(
        "flex h-full flex-col bg-[var(--bg-1)] border-r border-[var(--border-glass)] transition-all duration-300 ease-out",
        collapsed ? "hidden" : "flex",
        "lg:flex lg:w-[312px] lg:min-w-[312px]",
        "w-full animate-fade-in",
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-3 bg-2 flex-shrink-0 px-4 py-3">
        <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl shadow-sm">
          <img
            src="/token-dance-icon-rounded.svg"
            alt="TokenDance"
            className="h-9 w-9"
            draggable={false}
          />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-[14px] font-semibold text-[var(--text-primary)] truncate">
            {t("sidebar.publicChat")}
          </h2>
          <p className="text-[12px] text-[var(--text-secondary)] truncate">
            {t("sidebar.publicChatSub")}
          </p>
        </div>
        {/* Mobile close button */}
        {onClose && (
          <button
            onClick={onClose}
            aria-label={t("a11y.closeSidebar")}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-3 hover:text-[var(--text-primary)] lg:hidden transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Search filter */}
      <div className="px-3 pt-2 pb-0.5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-secondary)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("sidebar.searchConversations")}
            aria-label={t("sidebar.searchConversations")}
            className="h-11 w-full rounded-full bg-3 border-0 pl-9 pr-10 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
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
          className={convItemClasses(isConvActive("public", "", true))}
        >
          <Hash className="h-4 w-4 flex-shrink-0" />
          <span className="truncate">{t("sidebar.publicChat")}</span>
          {unreadByConversation["public"] ? (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-white shrink-0 ml-auto">
              {unreadByConversation["public"] > 99 ? "99+" : unreadByConversation["public"]}
            </span>
          ) : null}
        </button>
      </div>

      {/* Pinned conversations */}
      {pinnedConversations.length > 0 && (
        <div className="px-3 pt-2 pb-1">
          <span className="block text-[13px] text-[var(--text-secondary)] font-bold px-3 py-2">
            {t("sidebar.pinned")}
          </span>
          {pinnedConversations.map((key) => {
            const name = resolveConversationName(key);
            const isDM = key.startsWith("dm:");
            const isGroup = key.startsWith("group:");
            const isPublic = key === "public";
            const active = isConvActive(key, name, isPublic, isDM, isGroup);
            return (
              <div
                key={key}
                className="group flex items-center gap-1 pr-7 group-hover:pr-[18px] transition-all"
                onContextMenu={(e) => handleContextMenu(e, key)}
              >
                <button
                  onClick={() => navigateToConversation(key)}
                  className={cn(convItemClasses(active), "flex-1 min-w-0")}
                >
                  <Pin className="h-3.5 w-3.5 flex-shrink-0" />
                  {isPublic && <Hash className="h-3.5 w-3.5 flex-shrink-0" />}
                  {isDM && <User className="h-3.5 w-3.5 flex-shrink-0" />}
                  {isGroup && <Hash className="h-3.5 w-3.5 flex-shrink-0" />}
                  <span className="truncate">{name}</span>
                </button>
                <ThreeDotTrigger onClick={(e) => handleThreeDotClick(e, key)} />
              </div>
            );
          })}
        </div>
      )}

      {/* Scrollable middle area */}
      <div className="overflow-y-auto flex-1 min-h-0">

      {/* Search results (when filtering) */}
      {isFiltering ? (
        <div className="px-3 pt-1.5 pb-0.5">
          <span className="block text-[13px] text-[var(--text-secondary)] font-bold px-3 py-2">
            {t("sidebar.searchResults")}
          </span>
          {filteredItems && filteredItems.length > 0 ? (
            filteredItems.map((item) => {
              const active =
                (item.type === "dm" && currentChat.type === "dm" && currentChat.username === item.name) ||
                (item.type === "group" && currentChat.type === "group" && currentChat.name === item.name);
              return (
                <div key={item.key} className="group flex items-center gap-1" onContextMenu={(e) => handleContextMenu(e, item.key)}>
                  <button
                    onClick={() => {
                      if (item.type === "dm" || item.type === "friend") {
                        setCurrentChat({ type: "dm", username: item.name });
                      } else if (item.type === "group") {
                        setCurrentChat({ type: "group", name: item.name });
                      }
                    }}
                    className={cn(convItemClasses(active), "flex-1 min-w-0")}
                  >
                    {item.type === "group" ? (
                      <Hash className="h-3.5 w-3.5 flex-shrink-0" />
                    ) : (
                      <User className="h-3.5 w-3.5 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0 text-left">
                      <span className="block truncate text-[14px]">{item.name}</span>
                      {item.type !== "friend" && (() => {
                        const preview = previewMap.get(item.key);
                        if (!preview) return null;
                        return (
                          <div className="flex items-center w-full">
                            <span className="text-[12px] text-[var(--text-secondary)] truncate max-w-[180px]">
                              {preview.content}
                            </span>
                            <span className="text-[10px] text-[var(--text-secondary)] ml-auto shrink-0">
                              {formatTime(preview.timestamp, t)}
                            </span>
                          </div>
                        );
                      })()}
                    </div>
                    {(() => {
                      const count = unreadByConversation[item.key];
                      if (count) {
                        return (
                          <span data-testid="unread-badge" className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-white shrink-0">
                            {count > 99 ? "99+" : count}
                          </span>
                        );
                      }
                      if (item.type === "friend") {
                        return <span className="h-2 w-2 rounded-full bg-success shrink-0" />;
                      }
                      if (item.type === "dm" && onlineUsers.includes(item.name)) {
                        return <span className="h-2 w-2 rounded-full bg-success shrink-0" />;
                      }
                      if (item.type === "group") {
                        const g = groups[item.name];
                        if (g) {
                          return (
                            <span className="text-[11px] text-[var(--text-secondary)] shrink-0">
                              {g.members.length}
                            </span>
                          );
                        }
                      }
                      return null;
                    })()}
                  </button>
                  {(item.type === "dm" || item.type === "group") && (
                    <ThreeDotTrigger onClick={(e) => handleThreeDotClick(e, item.key)} />
                  )}
                </div>
              );
            })
          ) : (
            <div className="px-5 py-3">
              <span className="text-[12px] text-[var(--text-secondary)] italic">
                {t("sidebar.searchEmpty")}
              </span>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Direct Messages */}
          {dmPartners.length > 0 && (
            <div className="px-3 pt-1.5 pb-0.5">
              <span className="block text-[13px] text-[var(--text-secondary)] font-bold px-3 py-2">
                {t("sidebar.directMessages")}
              </span>
              {dmPartners.map((partner) => {
                const key = `dm:${partner}`;
                const preview = previewMap.get(key);
                const active = currentChat.type === "dm" && currentChat.username === partner;
                const count = unreadByConversation[key];
                return (
                  <div key={partner} className="group flex items-center gap-1" onContextMenu={(e) => handleContextMenu(e, key)}>
                    <button
                      onClick={() => setCurrentChat({ type: "dm", username: partner })}
                      className={cn(convItemClasses(active), "flex-1 min-w-0")}
                    >
                      <User className="h-3.5 w-3.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="block truncate text-[14px]">{partner}</span>
                        {preview && (
                          <div className="flex items-center w-full">
                            <span className="text-[12px] text-[var(--text-secondary)] truncate max-w-[180px]">
                              {preview.content}
                            </span>
                            <span className="text-[10px] text-[var(--text-secondary)] ml-auto shrink-0">
                              {formatTime(preview.timestamp, t)}
                            </span>
                          </div>
                        )}
                      </div>
                      {count ? (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-white shrink-0">
                          {count > 99 ? "99+" : count}
                        </span>
                      ) : onlineUsers.includes(partner) ? (
                        <span className="h-2 w-2 rounded-full bg-success shrink-0" />
                      ) : null}
                    </button>
                    <ThreeDotTrigger onClick={(e) => handleThreeDotClick(e, key)} />
                  </div>
                );
              })}
            </div>
          )}

          {/* Direct Messages: empty state */}
          {dmPartners.length === 0 && (
            <div className="px-6 py-2 opacity-0" aria-hidden="true">&nbsp;</div>
          )}

          {/* Groups section */}
          <div className="mt-1 px-3 pt-1">
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-[13px] text-[var(--text-secondary)] font-bold">
                {t("sidebar.groups")}
              </span>
              {onCreateGroup && (
                <button
                  onClick={onCreateGroup}
                  aria-label={t("sidebar.createGroup")}
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-3 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                </button>
              )}
            </div>
            {groupList.map((g) => {
              const key = `group:${g.name}`;
              const preview = previewMap.get(key);
              const active = currentChat.type === "group" && currentChat.name === g.name;
              const count = unreadByConversation[key];
              return (
                <div key={g.name} className="group flex items-center gap-1" onContextMenu={(e) => handleContextMenu(e, key)}>
                  <button
                    onClick={() => setCurrentChat({ type: "group", name: g.name })}
                    className={cn(convItemClasses(active), "flex-1 min-w-0")}
                  >
                    <Hash className="h-4 w-4 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="block truncate text-[14px]">{g.name}</span>
                      {preview && (
                        <div className="flex items-center w-full">
                          <span className="text-[12px] text-[var(--text-secondary)] truncate max-w-[180px]">
                            {preview.content}
                          </span>
                          <span className="text-[10px] text-[var(--text-secondary)] ml-auto shrink-0">
                            {formatTime(preview.timestamp, t)}
                          </span>
                        </div>
                      )}
                    </div>
                    {count ? (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-white shrink-0">
                        {count > 99 ? "99+" : count}
                      </span>
                    ) : (
                      <span className="text-[11px] text-[var(--text-secondary)] shrink-0">
                        {g.members.length}
                      </span>
                    )}
                  </button>
                  <ThreeDotTrigger onClick={(e) => handleThreeDotClick(e, key)} />
                </div>
              );
            })}
            {/* Groups: empty state */}
            {groupList.length === 0 && (
              <div className="px-6 py-1 opacity-0" aria-hidden="true">&nbsp;</div>
            )}
          </div>

          {/* Friends section */}
          <div className="mt-1 px-3 pt-1">
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-[13px] text-[var(--text-secondary)] font-bold">
                {t("sidebar.friends")}
              </span>
              <span className="text-[13px] text-[var(--text-secondary)]">
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
                    className={cn(
                      convItemClasses(
                        currentChat.type === "dm" && currentChat.username === friend,
                      ),
                      "w-full",
                    )}
                  >
                    <div
                      className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                      style={{ background: avatarGradient(friend) }}
                    >
                      {friend.charAt(0).toUpperCase()}
                    </div>
                    <span className="truncate text-[14px]">{friend}</span>
                    <span className="ml-auto h-2 w-2 rounded-full bg-success shrink-0" />
                  </button>
                ))
              : friends.length > 0
                ? friends.map((friend) => {
                    const friendStatus = userStatusList.find((u) => u.username === friend);
                    const lsText = friendStatus && !friendStatus.online ? formatLastSeen(friendStatus.last_seen, t) : "";
                    return (
                    <div
                      key={friend}
                      className="flex items-center gap-2 rounded-lg px-2.5 py-1.5"
                    >
                      <div
                        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white opacity-50"
                        style={{ background: avatarGradient(friend) }}
                      >
                        {friend.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="truncate block text-[14px] text-[var(--text-secondary)]">{friend}</span>
                        {lsText && (
                          <span className="text-[11px] text-[var(--text-secondary)] block truncate">
                            {lsText}
                          </span>
                        )}
                      </div>
                      <span className="ml-auto h-2 w-2 flex-shrink-0 rounded-full bg-[var(--text-secondary)]/30" />
                    </div>
                  )})
                : (
                  <div className="px-3 py-2">
                    <span className="text-[12px] text-[var(--text-secondary)] italic">
                      {t("sidebar.noFriends")}
                    </span>
                    <span className="block text-[10px] text-[var(--text-secondary)] mt-0.5">
                      {t("sidebar.noFriendsHint")}
                    </span>
                  </div>
                )}
          </div>
        </>
      )}

      {/* Online users section */}
      <div className="mt-1 flex min-h-[180px] max-h-[40%] flex-col overflow-hidden">
        <div data-visual="sidebar-online-users" className="flex items-center justify-between px-5 py-2">
          <div className="flex items-center gap-2">
            <Users className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
            <span className="text-[13px] font-bold text-[var(--text-secondary)]">
              {t("sidebar.onlineUsers")}
            </span>
          </div>
          <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-3 px-1.5 text-[13px] font-medium text-[var(--text-secondary)]">
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
                    <div className="h-7 w-7 rounded-full bg-[var(--bg-2)] animate-shimmer" />
                    <div className="h-3 w-28 rounded bg-[var(--bg-2)] animate-shimmer" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8" />
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
                      <div className="h-px flex-1 bg-border-base" />
                    </div>
                  )}
                </>
              )}
              {/* Friends online sub-section header */}
              {sortedOnlineGroups.friends.length > 0 && (sortedOnlineGroups.dmPartners.length > 0 || sortedOnlineGroups.others.length > 0) && (
                <div className="flex items-center gap-2 px-3 py-1.5">
                  <span className="text-[11px] font-bold text-[var(--text-secondary)]">
                    {t("sidebar.friendsOnline")}
                  </span>
                  <div className="h-px flex-1 bg-border-base" />
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

      {/* AI Assistants — collapsible section */}
      <div className="px-3 pt-1.5 pb-0.5">
        <button
          onClick={() => setAiAssistantsExpanded(!aiAssistantsExpanded)}
          aria-expanded={aiAssistantsExpanded}
          className="flex h-11 w-full items-center gap-1 px-3 py-2 text-[13px] text-[var(--text-secondary)] font-bold hover:text-[var(--text-primary)] transition-colors"
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
              <span className="block text-[13px] text-[var(--text-secondary)] font-bold px-3 py-2">
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
                  className="mt-1 h-11 rounded-lg flex w-full cursor-pointer items-center gap-2 px-2.5 text-left transition-colors text-[var(--text-secondary)] hover:bg-hover hover:text-[var(--text-primary)]"
                >
                  <AssistantIcon assistant={assistant} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px]">{assistant.name}</span>
                    <span className="block truncate text-[12px] text-[var(--text-secondary)]">
                      {assistant.label} · {assistant.model.name}
                    </span>
                  </span>
                  <span className="h-2 w-2 rounded-full bg-success shrink-0" aria-label={assistant.status} />
                </button>
              ))}
            </div>

            {/* Model catalog */}
            <div className="pt-0.5 pb-0.5">
              <span className="block text-[13px] text-[var(--text-secondary)] font-bold px-3 py-2">
                {t("sidebar.models")}
              </span>
              <div className="mt-1 grid grid-cols-2 gap-1.5 px-1">
                {modelCatalog.slice(0, 4).map((model) => (
                  <div
                    key={model.id}
                    data-testid="sidebar-model-card"
                    data-visual="sidebar-model-card"
                    className="flex min-h-9 min-w-0 items-center gap-1.5 rounded-xl border border-base bg-2 px-2 py-1.5"
                    title={`${model.name} · ${model.protocol}`}
                  >
                    <AssistantIcon model={model} size="sm" />
                    <span className="min-w-0">
                      <span className="block truncate text-[12px] text-[var(--text-primary)]">{model.providerName}</span>
                      <span className="block truncate text-[10px] text-[var(--text-secondary)]">{model.context}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      </div>

      {/* Archived conversations */}
      {archivedConversations.length > 0 && (
        <div className="border-t border-base px-3 pt-2 pb-1">
          <button
            onClick={() => setArchivedExpanded(!archivedExpanded)}
            aria-expanded={archivedExpanded}
            className="flex h-11 w-full items-center gap-1 px-3 py-2 text-[13px] font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            {archivedExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            {t("sidebar.archivedSection")}
            <span className="ml-auto text-[13px] text-[var(--text-secondary)]">
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
                    className="group flex items-center gap-1"
                    onContextMenu={(e) => handleContextMenu(e, key)}
                  >
                    <button
                      onClick={() => navigateToConversation(key)}
                      className={cn(
                        "h-11 rounded-lg flex flex-1 items-center gap-2 px-2.5 cursor-pointer transition-colors min-w-0 text-left",
                        "text-[var(--text-secondary)]/60 hover:text-[var(--text-secondary)] hover:bg-hover",
                      )}
                    >
                      <Archive className="h-3.5 w-3.5 flex-shrink-0" />
                      {renderConvIcon(isDM, isGroup, isPublic, true)}
                      <span className="truncate text-[14px]">{name}</span>
                      {isMuted && (
                        <BellOff className="h-3 w-3 flex-shrink-0 ml-auto" />
                      )}
                    </button>
                    <ThreeDotTrigger onClick={(e) => handleThreeDotClick(e, key)} />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Footer — macOS icon bar */}
      <div className="border-t border-[var(--border-glass)] px-4 py-3">
        {/* User identity row */}
        <div className="flex items-center gap-2.5 mb-3">
          <Avatar
            src={userProfiles[username]?.avatar_url || null}
            name={userProfiles[username]?.display_name || username}
            size="sm"
          />
          <div className="flex-1 min-w-0">
            <span className="text-[13px] font-medium text-[var(--text-primary)] block truncate">
              {userProfiles[username]?.display_name || username || "?"}
            </span>
          </div>
          <span className="flex h-1.5 w-1.5 rounded-full bg-success/70 shrink-0" />
        </div>
        {/* Tool icons — low opacity, light up on hover */}
        <div className="flex items-center justify-center gap-1.5">
          <button onClick={toggleSound} className="flex h-11 w-11 items-center justify-center rounded-xl text-[var(--text-secondary)]/55 hover:text-[var(--text-primary)] hover:bg-[var(--bg-2)]/60 transition-all" aria-label={soundOn ? t("settings.soundOn") : t("settings.soundOff")} title={soundOn ? t("settings.soundOn") : t("settings.soundOff")}>
            {soundOn ? <Volume2 className="h-[18px] w-[18px]" /> : <VolumeX className="h-[18px] w-[18px]" />}
          </button>
          <button onClick={() => setSettingsOpen(true)} className="flex h-11 w-11 items-center justify-center rounded-xl text-[var(--text-secondary)]/55 hover:text-[var(--text-primary)] hover:bg-[var(--bg-2)]/60 transition-all" aria-label={t("settings.openSettings")} title={t("settings.openSettings")}>
            <Settings className="h-[18px] w-[18px]" />
          </button>
          <button onClick={() => setInviteOpen(true)} className="flex h-11 w-11 items-center justify-center rounded-xl text-[var(--text-secondary)]/55 hover:text-[var(--text-primary)] hover:bg-[var(--bg-2)]/60 transition-all" aria-label={t("invite.inviteCodes")} title={t("invite.inviteCodes")}>
            <Key className="h-[18px] w-[18px]" />
          </button>
          <button onClick={() => setAdminOpen(true)} className="flex h-11 w-11 items-center justify-center rounded-xl text-[var(--text-secondary)]/55 hover:text-[var(--text-primary)] hover:bg-[var(--bg-2)]/60 transition-all" aria-label={t("sidebar.adminDashboard")} title={t("sidebar.adminDashboard")}>
            <Activity className="h-[18px] w-[18px]" />
          </button>
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
          className="fixed z-50 rounded-lg bg-dialog-fill-0 border border-base shadow-lg py-1 animate-scale-in"
          style={{ left: contextMenu.x, top: contextMenu.y, minWidth: "160px" }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-[var(--text-primary)] hover:bg-hover transition-colors"
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
              className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-[var(--text-primary)] hover:bg-hover transition-colors"
              onClick={() => handleUnmuteConversation(contextMenu.key)}
            >
              <Volume2 className="h-3 w-3" />
              {t("sidebar.unmuteConversation")}
            </button>
          )}
          <div className="border-t border-base my-1" />
          <button
            className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-[var(--text-primary)] hover:bg-hover transition-colors"
            onClick={() => handleMuteDuration(contextMenu.key, 1)}
          >
            <Clock className="h-3 w-3" />
            {t("settings.muteFor1h")}
          </button>
          <button
            className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-[var(--text-primary)] hover:bg-hover transition-colors"
            onClick={() => handleMuteDuration(contextMenu.key, 8)}
          >
            <Clock className="h-3 w-3" />
            {t("settings.muteFor8h")}
          </button>
          <button
            className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-[var(--text-primary)] hover:bg-hover transition-colors"
            onClick={() => handleMuteDuration(contextMenu.key, 24)}
          >
            <Clock className="h-3 w-3" />
            {t("settings.muteFor24h")}
          </button>
          <button
            className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-[var(--text-primary)] hover:bg-hover transition-colors"
            onClick={() => handleMuteDuration(contextMenu.key, 876000)}
          >
            <BellOff className="h-3 w-3" />
            {t("settings.muteForever")}
          </button>
          <button
            className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-[var(--text-primary)] hover:bg-hover transition-colors"
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
          <div className="border-t border-base my-1" />
          {(() => {
            const convKey = contextMenu.key;
            const folderId = getConvFolderId(convKey);
            if (folderId && !folderSubmenu) {
              return (
                <button
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-[var(--text-primary)] hover:bg-hover transition-colors"
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
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-[var(--text-primary)] hover:bg-hover transition-colors"
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
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-[var(--text-secondary)] hover:bg-hover transition-colors"
                  onClick={(e) => { e.stopPropagation(); setFolderSubmenu(false); }}
                >
                  <ChevronDown className="h-3 w-3 rotate-90" />
                  {t("folders.addToFolder")}
                </button>
                {folders.length === 0 ? (
                  <span className="block px-3 py-1 text-[13px] text-[var(--text-secondary)] italic">
                    {t("folders.noFolders")}
                  </span>
                ) : (
                  folders.map((f) => (
                    <button
                      key={f.id}
                      className="flex w-full items-center gap-2 pl-8 pr-3 py-1.5 text-[13px] text-[var(--text-primary)] hover:bg-hover transition-colors"
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
              <div className="border-t border-base my-1" />
              <button
                className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-[var(--text-primary)] hover:bg-hover transition-colors"
                onClick={() => {
                  const grpName = contextMenu.key.slice(6);
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
