import { Users, MessageCircle } from "lucide-react";
import { useChatStore } from "@/stores/chatStore";
import { cn } from "@/lib/utils";

interface SidebarProps {
  collapsed?: boolean;
  onClose?: () => void;
}

export function Sidebar({ collapsed, onClose }: SidebarProps) {
  const { onlineUsers, username } = useChatStore();

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
            公共聊天
          </h2>
          <p className="text-xs text-muted-foreground truncate">
            Public Chat Room
          </p>
        </div>
        {/* Mobile close button */}
        {onClose && (
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-[hsl(220,2.5%,20%)] hover:text-foreground md:hidden"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Online users section */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-3">
          <div className="flex items-center gap-2">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              在线用户
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
              <p className="text-xs">暂无在线用户</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {onlineUsers.map((user) => (
                <div
                  key={user}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                    user === username
                      ? "bg-[hsl(220,2.5%,20%)] text-foreground"
                      : "text-foreground/80 hover:bg-[hsl(220,2.5%,18%)]",
                  )}
                >
                  <div className="relative flex-shrink-0">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[hsl(231,4%,24%)] text-xs font-medium text-foreground/70">
                      {user.charAt(0).toUpperCase()}
                    </div>
                    <span className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5 rounded-full border-2 border-[hsl(231,4%,16%)] bg-online ring-1 ring-online-ring/30" />
                  </div>
                  <span className="flex-1 truncate text-sm">
                    {user}
                    {user === username && (
                      <span className="ml-1.5 text-[10px] text-muted-foreground">
                        (你)
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-[hsl(220,2.5%,23.5%)] px-5 py-3">
        <div className="flex items-center gap-2">
          <span
            className="flex h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: "oklch(71.2% 0.194 13.428)" }}
          />
          <span className="text-xs text-muted-foreground">
            已连接为 <span className="font-medium text-foreground/70">{username}</span>
          </span>
        </div>
      </div>
    </aside>
  );
}
