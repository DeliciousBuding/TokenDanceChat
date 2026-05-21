import { memo, useMemo, useState } from "react";
import {
  Users,
  MessageCircle,
  X,
  UserPlus,
  Hash,
  User,
  Plus,
} from "lucide-react";
import { useChatStore } from "@/stores/chatStore";
import { useTranslation } from "@/i18n/context";
import { cn } from "@/lib/utils";

interface SidebarProps {
  collapsed?: boolean;
  onClose?: () => void;
  onStartDM?: (username: string) => void;
  onAddFriend?: (username: string) => void;
  onCreateGroup?: () => void;
  /** Sets for which users have pending friend requests */
  pendingFriendUsers?: string[];
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

function avatarGradient(username: string): string {
  const baseHue = hashString(username) % 360;
  const hue1 = baseHue;
  const hue2 = (baseHue + 45) % 360;
  return `linear-gradient(135deg, oklch(65% 0.16 ${hue1}), oklch(58% 0.14 ${hue2}))`;
}

const UserListItem = memo(function UserListItem({
  user,
  isSelf,
  youLabel,
  onStartDM,
  onAddFriend,
  isFriend,
  hasPendingRequest,
}: {
  user: string;
  isSelf: boolean;
  youLabel: string;
  onStartDM?: (username: string) => void;
  onAddFriend?: (username: string) => void;
  isFriend?: boolean;
  hasPendingRequest?: boolean;
}) {
  const gradient = useMemo(() => avatarGradient(user), [user]);
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
        isSelf
          ? "bg-[hsl(220,2.5%,20%)] text-foreground"
          : "text-foreground/80 hover:bg-[hsl(220,2.5%,18%)]",
      )}
      onClick={() => {
        if (!isSelf) {
          setShowMenu(!showMenu);
        }
      }}
    >
      <div className="relative flex-shrink-0">
        <div
          className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold text-white"
          style={{ background: gradient }}
        >
          {user.charAt(0).toUpperCase()}
        </div>
        <span className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5 rounded-full border-2 border-[hsl(231,4%,16%)] bg-online animate-pulse-dot" />
      </div>
      <span className="flex-1 truncate text-sm">{user}</span>
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
          className="absolute right-3 z-30 mt-12 rounded-lg border border-[hsl(220,2.5%,23.5%)] bg-[hsl(231,4%,12%)] shadow-xl py-1 animate-scale-in"
          onClick={(e) => e.stopPropagation()}
          style={{ minWidth: "140px" }}
        >
          {onStartDM && (
            <button
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground/80 hover:bg-[hsl(220,2.5%,18%)] transition-colors"
              onClick={() => {
                setShowMenu(false);
                onStartDM(user);
              }}
            >
              <MessageCircle className="h-3 w-3" />
              Send Message
            </button>
          )}
          {onAddFriend && !isFriend && !hasPendingRequest && (
            <button
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground/80 hover:bg-[hsl(220,2.5%,18%)] transition-colors"
              onClick={() => {
                setShowMenu(false);
                onAddFriend(user);
              }}
            >
              <UserPlus className="h-3 w-3" />
              Add Friend
            </button>
          )}
          {hasPendingRequest && (
            <span className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground/50">
              Request pending
            </span>
          )}
        </div>
      )}
    </div>
  );
});

export function Sidebar({
  collapsed,
  onClose,
  onStartDM,
  onAddFriend,
  onCreateGroup,
  pendingFriendUsers = [],
}: SidebarProps) {
  const { t } = useTranslation();
  const {
    onlineUsers,
    username,
    friends,
    groups,
    dmMessages,
    currentChat,
    setCurrentChat,
  } = useChatStore();

  // Separate current user from others for visual grouping
  const otherUsers = onlineUsers.filter((u) => u !== username);
  const hasSelf = onlineUsers.includes(username);

  // Users with DM history
  const dmPartners = useMemo(() => {
    return Object.keys(dmMessages).filter((k) => dmMessages[k].length > 0);
  }, [dmMessages]);

  // Friend users who are online
  const onlineFriends = friends.filter((f) => onlineUsers.includes(f));

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-[hsl(220,2.5%,23.5%)] bg-[hsl(231,4%,16%)]",
        collapsed ? "hidden" : "flex",
        "md:flex md:w-[280px] md:min-w-[280px]",
        "w-full animate-fade-in",
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-[hsl(220,2.5%,23.5%)] px-5 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[hsl(231,4%,22%)]">
          <MessageCircle
            className="h-5 w-5"
            style={{ color: "oklch(71.2% 0.194 13.428)" }}
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
            className="rounded-md p-1.5 text-muted-foreground hover:bg-[hsl(220,2.5%,20%)] hover:text-foreground md:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Navigation: public chat */}
      <div className="px-3 pt-3 pb-1">
        <button
          onClick={() => setCurrentChat({ type: "public" })}
          className={cn(
            "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
            currentChat.type === "public"
              ? "bg-[hsl(220,2.5%,20%)] text-foreground"
              : "text-foreground/70 hover:bg-[hsl(220,2.5%,18%)] hover:text-foreground",
          )}
        >
          <Hash className="h-4 w-4 text-muted-foreground" />
          <span>{t("sidebar.publicChat")}</span>
        </button>
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
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors",
                currentChat.type === "dm" &&
                  currentChat.username === partner
                  ? "bg-[hsl(220,2.5%,20%)] text-foreground"
                  : "text-foreground/70 hover:bg-[hsl(220,2.5%,18%)] hover:text-foreground",
              )}
            >
              <User className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="truncate">{partner}</span>
              {onlineUsers.includes(partner) && (
                <span className="ml-auto h-2 w-2 rounded-full bg-online" />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Direct Messages: empty state */}
      {dmPartners.length === 0 && (
        <div className="px-5 py-1">
          <span className="text-[10px] text-muted-foreground/40">
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
              className="rounded p-0.5 text-muted-foreground/60 hover:text-muted-foreground hover:bg-[hsl(220,2.5%,18%)] transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {groups.map((g) => (
          <button
            key={g.name}
            onClick={() => setCurrentChat({ type: "group", name: g.name })}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors",
              currentChat.type === "group" && currentChat.name === g.name
                ? "bg-[hsl(220,2.5%,20%)] text-foreground"
                : "text-foreground/70 hover:bg-[hsl(220,2.5%,18%)] hover:text-foreground",
            )}
          >
            <Hash className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="truncate">{g.name}</span>
            <span className="ml-auto text-[10px] text-muted-foreground/50">
              {g.members.length}
            </span>
          </button>
        ))}
        {/* Groups: empty state */}
        {Object.keys(groups).length === 0 && groups.length === 0 && (
          <div className="px-2 py-1">
            <span className="text-[10px] text-muted-foreground/40">
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
                className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-foreground/80 hover:bg-[hsl(220,2.5%,18%)] transition-colors"
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
            ? friends.map((friend) => (
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
                  <span className="truncate">{friend}</span>
                  <span className="ml-auto h-2 w-2 rounded-full bg-muted-foreground/30" />
                </div>
              ))
            : (
              <div className="px-2 py-1">
                <span className="text-[10px] text-muted-foreground/40">
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
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[hsl(220,2.5%,20%)] px-1.5 text-[10px] font-medium text-muted-foreground">
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
                  />
                  {/* Divider between you and others */}
                  {otherUsers.length > 0 && (
                    <div className="flex items-center gap-2 px-3 py-1.5">
                      <div className="h-px flex-1 bg-[hsl(220,2.5%,18%)]" />
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
                  onStartDM={onStartDM}
                  onAddFriend={onAddFriend}
                  isFriend={friends.includes(user)}
                  hasPendingRequest={pendingFriendUsers.includes(user)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-[hsl(220,2.5%,23.5%)] px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 rounded-full bg-online animate-pulse-dot" />
          <span className="text-xs text-muted-foreground">
            {t("sidebar.connectedAs")}{" "}
            <span className="font-medium text-foreground/70">{username}</span>
          </span>
        </div>
      </div>
    </aside>
  );
}
