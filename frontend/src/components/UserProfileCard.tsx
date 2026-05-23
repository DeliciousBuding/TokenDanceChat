import { useMemo, useCallback, useEffect, useRef, useState } from "react";
import { X, Send, UserPlus, ShieldOff, Shield, Pencil, Phone, Video } from "lucide-react";
import { cn, usernameHue, formatLastSeen } from "@/lib/utils";
import { useChatStore, type UserProfile } from "@/stores/chatStore";
import { useTranslation } from "@/i18n/context";
import { chatAPI } from "@/lib/api";
import { Avatar } from "@/components/Avatar";
import { ProfileEditModal } from "@/components/ProfileEditModal";

interface UserProfileCardProps {
  username: string;
  onClose: () => void;
}

export function UserProfileCard({ username, onClose }: UserProfileCardProps) {
  const { t, lang } = useTranslation();
  const {
    userStatusList,
    setSelectedProfileUser,
    setCurrentChat,
    blockedUsers,
    userProfiles,
    setActiveCall,
  } = useChatStore();
  const sheetRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);
  const startYRef = useRef(0);
  const currentYRef = useRef(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  // Detect mobile viewport.
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const ownUsername = useChatStore((s) => s.username);
  const isOwnProfile = ownUsername === username;

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

  // Request profile data on mount.
  useEffect(() => {
    chatAPI.sendProfileGet(username);
  }, [username]);

  const userStatus = useMemo(() => {
    return userStatusList.find((u) => u.username === username);
  }, [userStatusList, username]);

  const profile: UserProfile | undefined = userProfiles[username];
  const displayName = profile?.display_name || username;
  const avatarUrl = profile?.avatar_url || userStatus?.avatar_url || null;
  const bio = profile?.bio || "";
  const statusText = profile?.status || userStatus?.status || "";

  const hue = useMemo(() => usernameHue(username), [username]);
  const nameColor = `oklch(72% 0.16 ${hue})`;

  const lastSeenText = useMemo(() => {
    if (!userStatus || userStatus.online) return null;
    const ls = userStatus.last_seen;
    if (!ls) return null;
    const now = Date.now();
    const diffMs = now - ls;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return t("profile.justNow");
    if (diffMin < 60) return t("profile.minutesAgo", { n: diffMin });
    if (diffHour < 24) return t("profile.hoursAgo", { n: diffHour });
    if (diffDay < 30) return t("profile.daysAgo", { n: diffDay });
    return formatLastSeen(ls, lang);
  }, [userStatus, t]);

  const handleSendMessage = useCallback(() => {
    setSelectedProfileUser(null);
    setCurrentChat({ type: "dm", username });
  }, [setSelectedProfileUser, setCurrentChat, username]);

  const handleStartCall = useCallback((callType: "video" | "voice") => {
    setActiveCall({
      callId: "",
      peer: username,
      callType,
      startTime: Date.now(),
    });
    onClose();
  }, [setActiveCall, username, onClose]);

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

  const profileContent = (
    <>
      {showEditModal && (
        <ProfileEditModal onClose={() => setShowEditModal(false)} />
      )}

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
            className="absolute top-3 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full bg-border cursor-grab active:cursor-grabbing"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          />
        )}

        {/* Close button */}
        <button
          onClick={onClose}
          aria-label={t("a11y.close")}
          className={cn(
            "absolute rounded-full p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors",
            isMobile ? "top-3 right-3" : "top-3 right-3",
          )}
        >
          <X className="h-4 w-4" />
        </button>

        {/* Avatar */}
        <div className="flex justify-center mb-4">
          <Avatar src={avatarUrl || null} name={displayName} size="lg" online={userStatus?.online} />
        </div>

        {/* Display name */}
        <h2
          className="text-center text-xl font-semibold mb-1"
          style={{ color: nameColor }}
        >
          {displayName}
        </h2>
        {displayName !== username && (
          <p className="text-center text-xs text-muted-foreground mb-0.5">
            @{username}
          </p>
        )}

        {/* Custom status */}
        {statusText && (
          <p className="text-center text-sm text-foreground/70 mb-1">
            {statusText}
          </p>
        )}

        {/* Online / last seen status */}
        <div className="flex items-center justify-center gap-1.5 mb-4">
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

        {/* Bio */}
        {bio && (
          <>
            <div className="h-px bg-border mb-3" />
            <p className="text-center text-sm text-foreground/70 px-2 mb-3 whitespace-pre-wrap break-words">
              {bio}
            </p>
          </>
        )}

        {/* Divider */}
        <div className="h-px bg-border mb-4" />

        {/* Actions */}
        <div className="space-y-2">
          {isOwnProfile ? (
            <button
              onClick={() => setShowEditModal(true)}
              className="flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-sm text-foreground/80 hover:bg-accent hover:text-foreground transition-colors"
            >
              <Pencil className="h-4 w-4 text-muted-foreground" />
              {t("profile.editProfile")}
            </button>
          ) : (
            <>
              <button
                onClick={handleSendMessage}
                className="flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-sm text-foreground/80 hover:bg-accent hover:text-foreground transition-colors"
              >
                <Send className="h-4 w-4 text-muted-foreground" />
                {t("profile.sendMessage")}
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => handleStartCall("voice")}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm text-foreground/80 hover:bg-accent hover:text-foreground transition-colors"
                  aria-label={t("call.voiceCall")}
                >
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  {t("call.voiceCall")}
                </button>
                <button
                  onClick={() => handleStartCall("video")}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm text-foreground/80 hover:bg-accent hover:text-foreground transition-colors"
                  aria-label={t("call.videoCall")}
                >
                  <Video className="h-4 w-4 text-muted-foreground" />
                  {t("call.videoCall")}
                </button>
              </div>
              <button
                onClick={() => {
                  chatAPI.sendFriendRequest(username);
                  onClose();
                }}
                className="flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-sm text-foreground/80 hover:bg-accent hover:text-foreground transition-colors"
              >
                <UserPlus className="h-4 w-4 text-muted-foreground" />
                {t("profile.addFriend")}
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
                  {t("profile.unblockUser")}
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
                  {t("profile.blockUser")}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );

  if (isMobile) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${displayName}'s profile`}
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
          {profileContent}
        </div>
      </div>
    );
  }

  // Desktop modal overlay.
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${displayName}'s profile`}
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
      <div className="relative z-10">{profileContent}</div>
    </div>
  );
}
