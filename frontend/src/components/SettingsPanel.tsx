import { X, VolumeX, Bell, BellOff, Clock, Eye, EyeOff } from "lucide-react";
import { useChatStore } from "@/stores/chatStore";
import { useTranslation } from "@/i18n/context";
import { chatAPI } from "@/lib/api";

interface SettingsPanelProps {
  onClose: () => void;
}

function formatMuteExpiry(mutedUntil: number): string {
  if (mutedUntil <= 0) return "";
  const now = Date.now();
  if (mutedUntil <= now) return "";
  const remaining = mutedUntil - now;
  const hours = Math.ceil(remaining / (1000 * 60 * 60));
  if (hours >= 8760) return "";
  if (hours >= 24) return `${Math.floor(hours / 24)}d`;
  if (hours >= 1) return `${hours}h`;
  return "< 1h";
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const { t } = useTranslation();
  const { notificationPrefs, mutedConversations, username, onlineUsers, userProfiles } =
    useChatStore();

  // Build a list of known conversation keys from all sources.
  const conversationKeys = new Set<string>();
  conversationKeys.add("public");
  for (const u of onlineUsers) {
    if (u !== username) conversationKeys.add(`dm:${u}`);
  }
  for (const key of Object.keys(notificationPrefs)) {
    conversationKeys.add(key);
  }
  for (const key of mutedConversations) {
    conversationKeys.add(key);
  }

  const resolveName = (key: string): string => {
    if (key === "public") return t("chat.publicChat");
    if (key.startsWith("dm:")) {
      const u = key.slice(3);
      return userProfiles[u]?.display_name || u;
    }
    if (key.startsWith("group:")) {
      return key.slice(6);
    }
    return key;
  };

  const isMuted = (key: string): boolean => {
    if (mutedConversations.includes(key)) return true;
    const pref = notificationPrefs[key];
    return !!(pref && pref.mutedUntil > Date.now());
  };

  const getMutedUntil = (key: string): number => {
    return notificationPrefs[key]?.mutedUntil ?? 0;
  };

  const getShowPreview = (key: string): boolean => {
    return notificationPrefs[key]?.showPreview ?? true;
  };

  const handleUnmute = (key: string) => {
    chatAPI.sendSetNotificationPrefs(key, 0, getShowPreview(key));
  };

  const handleTogglePreview = (key: string) => {
    chatAPI.sendSetNotificationPrefs(key, getMutedUntil(key), !getShowPreview(key));
  };

  const entries = Array.from(conversationKeys).sort((a, b) => {
    if (a === "public") return -1;
    if (b === "public") return 1;
    return a.localeCompare(b);
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Slide-in panel */}
      <div className="relative w-full max-w-sm h-full bg-card border-l border-border shadow-2xl flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Bell className="h-4 w-4" />
            {t("settings.notificationPrefs")}
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {/* Muted conversations list */}
          <h3 className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider mb-2 px-1">
            {t("settings.mutedConversations")}
          </h3>

          {entries.filter((k) => isMuted(k)).length === 0 && (
            <p className="text-xs text-muted-foreground/50 px-1 py-4 text-center">
              {t("settings.noMutedConversations")}
            </p>
          )}

          <div className="space-y-1">
            {entries
              .filter((k) => isMuted(k))
              .map((key) => {
                const expiry = formatMuteExpiry(getMutedUntil(key));
                const showPreview = getShowPreview(key);
                return (
                  <div
                    key={key}
                    className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-accent/50 transition-colors"
                  >
                    <BellOff className="h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs text-foreground truncate block">
                        {resolveName(key)}
                      </span>
                      {expiry && (
                        <span className="text-[10px] text-muted-foreground/50 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {expiry}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => handleTogglePreview(key)}
                      className="rounded p-1 text-muted-foreground/50 hover:text-foreground hover:bg-accent transition-colors"
                      title={showPreview ? t("settings.previewOn") : t("settings.previewOff")}
                    >
                      {showPreview ? (
                        <Eye className="h-3.5 w-3.5" />
                      ) : (
                        <EyeOff className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      onClick={() => handleUnmute(key)}
                      className="rounded p-1 text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
                      title={t("settings.unmute")}
                    >
                      <VolumeX className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
          </div>

          {/* Unmuted conversations with preview toggle */}
          <h3 className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider mb-2 mt-5 px-1">
            {t("settings.showPreview")}
          </h3>

          <div className="space-y-1">
            {entries
              .filter((k) => !isMuted(k))
              .slice(0, 20)
              .map((key) => {
                const showPreview = getShowPreview(key);
                const pref = notificationPrefs[key];
                // Only show if user has explicitly set this pref
                if (!pref) return null;
                return (
                  <div
                    key={key}
                    className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-accent/50 transition-colors"
                  >
                    <Bell className="h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0" />
                    <span className="flex-1 text-xs text-foreground truncate">
                      {resolveName(key)}
                    </span>
                    <button
                      onClick={() => handleTogglePreview(key)}
                      className="rounded p-1 text-muted-foreground/50 hover:text-foreground hover:bg-accent transition-colors"
                      title={showPreview ? t("settings.previewOn") : t("settings.previewOff")}
                    >
                      {showPreview ? (
                        <Eye className="h-3.5 w-3.5" />
                      ) : (
                        <EyeOff className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
}
