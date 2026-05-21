import { memo, useMemo, useCallback } from "react";
import { Users, MessageCircle, X } from "lucide-react";
import { useChatStore } from "@/stores/chatStore";
import { useTranslation } from "@/i18n/context";
import { cn, avatarGradient, formatLastSeen } from "@/lib/utils";

interface SidebarProps {
  collapsed?: boolean;
  onClose?: () => void;
}

const UserListItem = memo(function UserListItem({
  user,
  online,
  lastSeen,
  isSelf,
  youLabel,
  onClick,
}: {
  user: string;
  online: boolean;
  lastSeen?: number;
  isSelf: boolean;
  youLabel: string;
  onClick: (username: string) => void;
}) {
  const gradient = useMemo(() => avatarGradient(user), [user]);
  const lastSeenText = useMemo(() => {
    if (online || !lastSeen) return null;
    return formatLastSeen(lastSeen);
  }, [online, lastSeen]);

  const handleClick = useCallback(() => {
    onClick(user);
  }, [user, onClick]);

  return (
    <button
      onClick={handleClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors",
        isSelf
          ? "bg-[hsl(220,2.5%,20%)] text-foreground"
          : "text-foreground/80 hover:bg-[hsl(220,2.5%,18%)]",
      )}
    >
      <div className="relative flex-shrink-0">
        <div
          className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold text-white"
          style={{ background: gradient }}
        >
          {user.charAt(0).toUpperCase()}
        </div>
        {/* Online/offline dot */}
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5 rounded-full border-2 border-[hsl(231,4%,16%)]",
            online
              ? "bg-online animate-pulse-dot"
              : "bg-muted-foreground/40",
          )}
        />
      </div>
      <div className="flex-1 min-w-0">
        <span className="block truncate text-sm">{user}</span>
        {!online && lastSeenText && (
          <span className="text-[10px] text-muted-foreground/50">
            {lastSeenText}
          </span>
        )}
      </div>
      {isSelf && (
        <span className="flex-shrink-0 rounded-md bg-online/10 px-1.5 py-0.5 text-[10px] font-medium text-online">
          {youLabel}
        </span>
      )}
    </button>
  );
});

export function Sidebar({ collapsed, onClose }: SidebarProps) {
  const { t } = useTranslation();
  const { userStatusList, username, setSelectedProfileUser } = useChatStore();

  // Split users into online and offline groups.
  const onlineUsers = useMemo(
    () => userStatusList.filter((u) => u.online),
    [userStatusList],
  );
  const offlineUsers = useMemo(
    () => userStatusList.filter((u) => !u.online),
    [userStatusList],
  );

  // Separate self from the online list.
  const otherOnline = useMemo(
    () => onlineUsers.filter((u) => u.username !== username),
    [onlineUsers, username],
  );
  const hasSelfOnline = useMemo(
    () => onlineUsers.some((u) => u.username === username),
    [onlineUsers, username],
  );

  const handleUserClick = useCallback(
    (clickedUser: string) => {
      setSelectedProfileUser(clickedUser);
    },
    [setSelectedProfileUser],
  );

  const hasAnyUsers = userStatusList.length > 0;

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
            {unreadCount > 0 && (
              <span className="ml-2 inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full text-[10px] font-bold text-white"
                style={{ backgroundColor: "oklch(71.2% 0.194 13.428)" }}>
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
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

      {/* Users section */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-3">
          <div className="flex items-center gap-2">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {t("sidebar.onlineUsers")}
            </span>
          </div>
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[hsl(220,2.5%,20%)] px-1.5 text-[10px] font-medium text-muted-foreground">
            {userStatusList.length}
          </span>
        </div>

        {/* User list */}
        <div className="flex-1 overflow-y-auto px-3 py-1">
          {!hasAnyUsers ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Users className="mb-2 h-6 w-6 opacity-30" />
              <p className="text-xs">{t("sidebar.emptyState")}</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {/* Current user at top (if online) */}
              {hasSelfOnline && (
                <>
                  <UserListItem
                    user={username}
                    online
                    isSelf
                    youLabel={t("sidebar.you")}
                    onClick={handleUserClick}
                  />
                </>
              )}

              {/* Online section */}
              {otherOnline.length > 0 && (
                <>
                  {hasSelfOnline && (
                    <div className="flex items-center gap-2 px-3 py-1.5">
                      <div className="text-[10px] text-muted-foreground/60 font-medium uppercase tracking-wider">
                        {t("sidebar.online")} &mdash; {onlineUsers.length}
                      </div>
                      <div className="h-px flex-1 bg-[hsl(220,2.5%,18%)]" />
                    </div>
                  )}
                  {!hasSelfOnline && onlineUsers.length > 0 && (
                    <div className="flex items-center gap-2 px-3 py-1.5">
                      <div className="text-[10px] text-muted-foreground/60 font-medium uppercase tracking-wider">
                        {t("sidebar.online")} &mdash; {onlineUsers.length}
                      </div>
                      <div className="h-px flex-1 bg-[hsl(220,2.5%,18%)]" />
                    </div>
                  )}
                  {otherOnline.map((user) => (
                    <UserListItem
                      key={user.username}
                      user={user.username}
                      online
                      isSelf={false}
                      youLabel={t("sidebar.you")}
                      onClick={handleUserClick}
                    />
                  ))}
                </>
              )}

              {/* Offline section */}
              {offlineUsers.length > 0 && (
                <>
                  <div className="flex items-center gap-2 px-3 py-1.5 mt-1">
                    <div className="text-[10px] text-muted-foreground/60 font-medium uppercase tracking-wider">
                      {t("sidebar.offline")} &mdash; {offlineUsers.length}
                    </div>
                    <div className="h-px flex-1 bg-[hsl(220,2.5%,18%)]" />
                  </div>
                  {offlineUsers.map((user) => (
                    <UserListItem
                      key={user.username}
                      user={user.username}
                      online={false}
                      lastSeen={user.last_seen}
                      isSelf={false}
                      youLabel={t("sidebar.you")}
                      onClick={handleUserClick}
                    />
                  ))}
                </>
              )}
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
