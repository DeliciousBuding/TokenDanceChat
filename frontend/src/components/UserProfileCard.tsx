import { useMemo, useCallback, useEffect, useRef, useState } from "react";
import { X, Send, UserPlus, ShieldOff, Shield } from "lucide-react";
import { cn, avatarGradient, usernameHue, formatLastSeen } from "@/lib/utils";
import { useChatStore } from "@/stores/chatStore";
import { useTranslation } from "@/i18n/context";
import { chatAPI } from "@/lib/api";

interface UserProfileCardProps {
  username: string;
  onClose: () => void;
}

export function UserProfileCard({ username, onClose }: UserProfileCardProps) {
  const { t } = useTranslation();
  const { userStatusList, setSelectedProfileUser, setCurrentChat, blockedUsers } = useChatStore();
  const sheetRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);
  const startYRef = useRef(0);
  const currentYRef = useRef(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // Detect mobile viewport.
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Lock body scroll when open on mobile.
  useEffect(() => {
    if (isMobile) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [isMobile]);

  // Close on Escape key.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const userStatus = useMemo(() => {
    return userStatusList.find((u) => u.username === username);
  }, [userStatusList, username]);

  const gradient = useMemo(() => avatarGradient(username), [username]);
  const hue = useMemo(() => usernameHue(username), [username]);
  const nameColor = `oklch(72% 0.16 ${hue})`;

  const lastSeenText = useMemo(() => {
    if (!userStatus || userStatus.online) return null;
    return formatLastSeen(userStatus.last_seen);
  }, [userStatus]);

  const handleSendMessage = useCallback(() => {
    setSelectedProfileUser(null);
    setCurrentChat({ type: "dm", username });
  }, [setSelectedProfileUser, setCurrentChat, username]);

  // Touch handlers for swipe-to-dismiss (mobile bottom sheet).
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startYRef.current = e.touches[0].clientY;
    currentYRef.current = e.touches[0].clientY;
    setIsDragging(true);
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isDragging) return;
      currentYRef.current = e.touches[0].clientY;
      const diff = currentYRef.current - startYRef.current;
      if (diff > 0) {
        setDragOffset(diff);
      }
    },
    [isDragging],
  );

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
    if (dragOffset > 100) {
      onClose();
    }
    setDragOffset(0);
  }, [dragOffset, onClose]);

  const content = (
    <div
      className={cn(
        isMobile
          ? "rounded-t-2xl bg-card border-t border-border px-6 pt-8 pb-8 animate-slide-up"
          : "rounded-xl bg-card border border-border p-6 shadow-2xl animate-scale-in",
        "w-full max-w-sm",
      )}
      style={isMobile ? { transform: `translateY(${dragOffset}px)`, transition: isDragging ? "none" : "transform 0.3s ease-out" } : undefined}
    >
      {/* Drag handle for mobile */}
      {isMobile && (
        <div
          className="absolute top-3 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full bg-[hsl(220,2.5%,28.5%)] cursor-grab active:cursor-grabbing"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        />
      )}

      {/* Close button */}
      <button
        onClick={onClose}
        aria-label="Close"
        className={cn(
          "absolute rounded-full p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors",
          isMobile ? "top-3 right-3" : "top-3 right-3",
        )}
      >
        <X className="h-4 w-4" />
      </button>

      {/* Avatar */}
      <div className="flex justify-center mb-4">
        <div
          className="flex h-20 w-20 items-center justify-center rounded-full text-2xl font-bold text-white ring-4 ring-white/10"
          style={{ background: gradient }}
        >
          {username.charAt(0).toUpperCase()}
        </div>
      </div>

      {/* Username */}
      <h2
        className="text-center text-xl font-semibold mb-1"
        style={{ color: nameColor }}
      >
        {username}
      </h2>

      {/* Status */}
      <div className="flex items-center justify-center gap-1.5 mb-5">
        <span
          className={cn(
            "flex h-2 w-2 rounded-full",
            userStatus?.online
              ? "bg-online animate-pulse-dot"
              : "bg-muted-foreground/40",
          )}
        />
        <span className="text-xs text-muted-foreground">
          {userStatus?.online
            ? t("sidebar.online")
            : lastSeenText
              ? t("sidebar.lastSeen", { time: lastSeenText })
              : t("sidebar.offline")}
        </span>
      </div>

      {/* Divider */}
      <div className="h-px bg-[hsl(220,2.5%,23%)] mb-4" />

      {/* Quick actions */}
      <div className="space-y-2">
        <button
          onClick={handleSendMessage}
          className="flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-sm text-foreground/80 hover:bg-accent hover:text-foreground transition-colors"
        >
          <Send className="h-4 w-4 text-muted-foreground" />
          Send Message
        </button>
        <button
          onClick={() => {
            chatAPI.sendFriendRequest(username);
            onClose();
          }}
          className="flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-sm text-foreground/80 hover:bg-accent hover:text-foreground transition-colors"
        >
          <UserPlus className="h-4 w-4 text-muted-foreground" />
          Add Friend
        </button>
        {blockedUsers.includes(username) ? (
          <button
            onClick={() => {
              chatAPI.sendUnblock(username);
              onClose();
            }}
            className="flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-sm text-foreground/80 hover:bg-accent hover:text-foreground transition-colors"
          >
            <ShieldOff className="h-4 w-4 text-muted-foreground" />
            Unblock User
          </button>
        ) : (
          <button
            onClick={() => {
              chatAPI.sendBlock(username);
              onClose();
            }}
            className="flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-sm text-foreground/80 hover:bg-accent hover:text-foreground transition-colors"
          >
            <Shield className="h-4 w-4 text-muted-foreground" />
            Block User
          </button>
        )}
      </div>
    </div>
  );

  if (isMobile) {
    // Bottom sheet overlay.
    return (
      <div
        className="fixed inset-0 z-50 flex items-end justify-center"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={onClose}
        />
        {/* Sheet content */}
        <div ref={sheetRef} className="relative z-10 w-full max-w-sm">
          {content}
        </div>
      </div>
    );
  }

  // Desktop modal overlay.
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      {/* Card */}
      <div className="relative z-10">{content}</div>
    </div>
  );
}
