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
} from "lucide-react";
import { useChatStore } from "@/stores/chatStore";
import { useTranslation } from "@/i18n/context";
import { cn, avatarGradient, formatLastSeen } from "@/lib/utils";
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
      if (m.from && m.from !== username && !partners.has(m.from)) {
        partners.add(m.from);
      }
      if (m.to && m.to !== username && m.username === username && !partners.has(m.to)) {
        partners.add(m.to);
      }
    }
    return [...partners];
  }, [messages, username]);

  // Convert groups record to array
  const groupList = useMemo(() => Object.values(groups), [groups]);

  // Friend users who are online
  const onlineFriends = friends.filter((f) => onlineUsers.includes(f));

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

  return (
    <aside
      aria-label={t("chat.roomName")}
      className={cn(
        "flex h-full flex-col border-r border-border bg-card transition-all duration-300 ease-out",
        collapsed ? "hidden" : "flex",
        "md:flex md:w-[280px] md:min-w-[280px]",
        "w-full animate-fade-in",
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-5 py-4">
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
            aria-label="Close sidebar"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground md:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Navigation: public chat */}
      <div className="px-3 pt-3 pb-1">
        <button
          onClick={() => setCurrentChat({ type: "public" })}
          onContextMenu={(e) => handleContextMenu(e, "public")}
          className={cn(
            "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-all border-l-2 border-l-transparent hover:border-l-primary",
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
          <span className="px-2 text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">
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
                className="group flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-all border-l-2 border-l-transparent hover:border-l-primary"
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
                  className="flex-shrink-0 rounded p-0.5 text-muted-foreground/40 opacity-0 group-hover:opacity-100 hover:text-muted-foreground hover:bg-accent transition-all"
                  aria-label={t("sidebar.unpinConversation")}
                  title={t("sidebar.unpinConversation")}
                >
                  <PinOff className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Assistants */}
      <div className="px-3 pt-2 pb-1">
        <span className="px-2 text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">
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
            className="mt-1 flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-foreground/80 transition-all border-l-2 border-l-transparent hover:border-l-primary hover:bg-accent hover:text-foreground"
          >
            <AssistantIcon assistant={assistant} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{assistant.name}</span>
              <span className="block truncate text-[10px] text-muted-foreground/55">
                {assistant.label} · {assistant.model.name}
              </span>
            </span>
            <span className="h-2 w-2 rounded-full bg-online animate-pulse-dot" aria-label={assistant.status} />
          </button>
        ))}
      </div>

      {/* Model catalog */}
      <div className="px-3 pt-2 pb-1">
        <span className="px-2 text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">
          {t("sidebar.models")}
        </span>
        <div className="mt-1 grid grid-cols-2 gap-1.5">
          {modelCatalog.slice(0, 6).map((model) => (
            <div
              key={model.id}
              className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-background/45 px-2 py-1.5"
              title={`${model.name} · ${model.protocol}`}
            >
              <AssistantIcon model={model} size="sm" />
              <span className="min-w-0">
                <span className="block truncate text-[11px] text-foreground/80">{model.providerName}</span>
                <span className="block truncate text-[9px] text-muted-foreground/50">{model.context}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Direct Messages */}
      {dmPartners.length > 0 && (
        <div className="px-3 pt-2 pb-1">
          <span className="px-2 text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">
            {t("sidebar.directMessages")}
          </span>
          {dmPartners.map((partner) => (
            <button
              key={partner}
              onClick={() =>
                setCurrentChat({ type: "dm", username: partner })
              }
              onContextMenu={(e) => handleContextMenu(e, `dm:${partner}`)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-all border-l-2 border-l-transparent hover:border-l-primary",
                currentChat.type === "dm" &&
                  currentChat.username === partner
                  ? "bg-accent text-foreground border-l-primary"
                  : "text-foreground/70 hover:bg-accent hover:text-foreground",
              )}
            >
              <User className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="truncate">{partner}</span>
              {(() => {
                const count = unreadByConversation[`dm:${partner}`];
                if (count) {
                  return (
                    <span key={`dm-${partner}-${count}`} className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground animate-pulse-badge">
                      {count > 99 ? "99+" : count}
                    </span>
                  );
                }
                return onlineUsers.includes(partner) && (
                  <span className="ml-auto h-2 w-2 rounded-full bg-online" />
                );
              })()}
            </button>
          ))}
        </div>
      )}

      {/* Direct Messages: empty state */}
      {dmPartners.length === 0 && (
        <div className="px-5 py-2">
          <span className="text-[10px] text-muted-foreground/35 italic">
            {t("sidebar.noDMs")}
          </span>
        </div>
      )}

      {/* Groups section */}
      <div className="mt-2 px-3 pt-2">
        <div className="flex items-center justify-between px-2">
          <span className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">
            {t("sidebar.groups")}
          </span>
          {onCreateGroup && (
            <button
              onClick={onCreateGroup}
              aria-label={t("sidebar.createGroup")}
              className="rounded p-0.5 text-muted-foreground/60 hover:text-muted-foreground hover:bg-accent transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {groupList.map((g) => (
          <button
            key={g.name}
            onClick={() => setCurrentChat({ type: "group", name: g.name })}
            onContextMenu={(e) => handleContextMenu(e, `group:${g.name}`)}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-all border-l-2 border-l-transparent hover:border-l-primary",
              currentChat.type === "group" && currentChat.name === g.name
                ? "bg-accent text-foreground border-l-primary"
                : "text-foreground/70 hover:bg-accent hover:text-foreground",
            )}
          >
            <Hash className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="truncate">{g.name}</span>
            {(() => {
              const count = unreadByConversation[`group:${g.name}`];
              if (count) {
                return (
                  <span key={`group-${g.name}-${count}`} className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground animate-pulse-badge">
                    {count > 99 ? "99+" : count}
                  </span>
                );
              }
              return (
                <span className="ml-auto text-[10px] text-muted-foreground/50">
                  {g.members.length}
                </span>
              );
            })()}
          </button>
        ))}
        {/* Groups: empty state */}
        {groupList.length === 0 && (
          <div className="flex items-center gap-2 px-2 py-1.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground/20 flex-shrink-0">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
            </svg>
            <span className="text-[10px] text-muted-foreground/35 italic">
              {t("sidebar.noGroups")}
            </span>
          </div>
        )}
      </div>

      {/* Friends section */}
      <div className="mt-2 px-3 pt-2">
        <div className="flex items-center justify-between px-2">
          <span className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">
            {t("sidebar.friends")}
          </span>
          <span className="text-[10px] text-muted-foreground/40">
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
                className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-foreground/80 transition-all border-l-2 border-l-transparent hover:border-l-primary hover:bg-accent"
              >
                <div
                  className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
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
                    className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white opacity-50"
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
              <div className="flex items-center gap-2 px-2 py-1.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground/20 flex-shrink-0">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                </svg>
                <span className="text-[10px] text-muted-foreground/35 italic">
                  {t("sidebar.noFriends")}
                </span>
              </div>
            )}
      </div>

      {/* Online users section */}
      <div className="flex-1 overflow-hidden flex flex-col mt-2">
        <div className="flex items-center justify-between px-5 py-2">
          <div className="flex items-center gap-2">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {t("sidebar.onlineUsers")}
            </span>
          </div>
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[10px] font-medium text-muted-foreground">
            {onlineUsers.length}
          </span>
        </div>

        {/* User list */}
        <div className="flex-1 overflow-y-auto px-3 py-1">
          {onlineUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Users className="mb-2 h-6 w-6 opacity-30" />
              <p className="text-xs">{t("sidebar.emptyState")}</p>
            </div>
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
              {/* Other users */}
              {otherUsers.map((user) => (
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
            className="flex w-full items-center gap-1 px-2 py-1 text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider hover:text-muted-foreground transition-colors"
          >
            {archivedExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            {t("sidebar.archivedSection")}
            <span className="ml-auto text-[10px] text-muted-foreground/40">
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
                    className="group flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-all border-l-2 border-l-transparent hover:border-l-primary"
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
            <span className="text-xs font-medium text-foreground/70 block truncate">
              {userProfiles[username]?.display_name || username}
            </span>
            {userProfiles[username]?.status && (
              <span className="text-[10px] text-muted-foreground/50 block truncate">
                {userProfiles[username].status}
              </span>
            )}
          </div>
          <span className="flex h-2 w-2 rounded-full bg-online animate-pulse-dot" />
        </div>
        {/* Sound toggle */}
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground/50">{t("settings.sound")}</span>
          <button
            onClick={toggleSound}
            className="flex items-center gap-1 rounded-md p-1 text-muted-foreground/50 hover:text-muted-foreground hover:bg-accent transition-colors"
            aria-label={soundOn ? t("settings.soundOn") : t("settings.soundOff")}
            title={soundOn ? t("settings.soundOn") : t("settings.soundOff")}
          >
            {soundOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
          </button>
        </div>
        {/* Invite code manager */}
        <div className="mt-1 flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground/50">{t("invite.inviteCodes")}</span>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setSettingsOpen(true)}
              className="flex items-center gap-1 rounded-md p-1 text-muted-foreground/50 hover:text-muted-foreground hover:bg-accent transition-colors"
              aria-label={t("settings.openSettings")}
              title={t("settings.openSettings")}
            >
              <Settings className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setInviteOpen(true)}
              className="flex items-center gap-1 rounded-md p-1 text-muted-foreground/50 hover:text-muted-foreground hover:bg-accent transition-colors"
              aria-label={t("invite.inviteCodes")}
              title={t("invite.inviteCodes")}
            >
              <Key className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setAdminOpen(true)}
              className="flex items-center gap-1 rounded-md p-1 text-muted-foreground/50 hover:text-muted-foreground hover:bg-accent transition-colors"
              aria-label="Admin Dashboard"
              title="Admin Dashboard"
            >
              <Activity className="h-3.5 w-3.5" />
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
