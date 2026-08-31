import { useState } from "react";
import { X, VolumeX, Bell, BellOff, BellRing, Clock, Eye, EyeOff } from "lucide-react";
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
  const { notificationPrefs, mutedConversations } = useChatStore();

  // Desktop notification permission is only ever requested from this explicit
  // user action (a real gesture), satisfying browser autoplay/permission rules.
  const [notifPermission, setNotifPermission] = useState<string>(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported",
  );
  const requestNotifications = () => {
    if (typeof Notification === "undefined") return;
    Notification.requestPermission().then((p) => setNotifPermission(p));
  };

  const conversationKeys = new Set<string>();
  conversationKeys.add("public");
  for (const key of Object.keys(notificationPrefs)) {
    if (key === "public") conversationKeys.add(key);
  }
  for (const key of mutedConversations) {
    if (key === "public") conversationKeys.add(key);
  }

  const resolveName = (key: string): string => {
    if (key === "public") return t("chat.publicChat");
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
    <div className="fixed inset-0 z-50 flex justify-end" data-visual="settings-modal-root">
      {/* Backdrop */}
      <div
        className="td-chat-backdrop absolute inset-0"
        onClick={onClose}
      />

      {/* Slide-in panel */}
      <div
        className="td-chat-drawer relative w-full max-w-sm h-full flex flex-col animate-slide-in-right"
        data-visual="settings-modal"
      >
        {/* Header */}
        <div className="td-chat-drawer-header flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Bell className="h-4 w-4" />
            {t("settings.notificationPrefs")}
          </h2>
          <button
            onClick={onClose}
            className="td-chat-header-action flex h-11 w-11 items-center justify-center rounded-[var(--radius-control)] text-muted-foreground hover:text-foreground transition-colors"
            aria-label={t("a11y.close")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-3" data-visual="settings-content">
          {/* Desktop notifications master control (explicit user gesture) */}
          {notifPermission !== "unsupported" && (
            <div className="td-chat-list-row mb-4 flex items-center gap-3 px-3 py-2.5">
              <BellRing className="h-4 w-4 text-muted-foreground/60 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground">{t("settings.desktopNotifications")}</p>
                {notifPermission === "denied" && (
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">{t("settings.notificationsDenied")}</p>
                )}
              </div>
              {notifPermission === "granted" ? (
                <span className="text-[11px] text-[var(--success)]">{t("settings.notificationsGranted")}</span>
              ) : (
                <button
                  onClick={requestNotifications}
                  className="min-h-9 rounded-[var(--radius-control)] bg-[var(--accent)]/10 px-3 text-[11px] font-medium text-[var(--accent)] hover:bg-[var(--accent)]/18 transition-colors"
                >
                  {t("settings.notificationsEnable")}
                </button>
              )}
            </div>
          )}

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
                    className="td-chat-list-row flex items-center gap-3 px-3 py-2 text-sm"
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
                      className="td-chat-header-action flex h-11 w-11 items-center justify-center rounded-[var(--radius-control)] text-muted-foreground/50 hover:text-foreground transition-colors"
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
                      className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-control)] text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
                      title={t("settings.unmute")}
                    >
                      <VolumeX className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
          </div>

          {/* Unmuted conversations with preview toggle */}
          {entries.some((k) => !isMuted(k) && notificationPrefs[k]) && (
            <>
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
                        className="td-chat-list-row flex items-center gap-3 px-3 py-2 text-sm"
                      >
                        <Bell className="h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0" />
                        <span className="flex-1 text-xs text-foreground truncate">
                          {resolveName(key)}
                        </span>
                        <button
                          onClick={() => handleTogglePreview(key)}
                          className="td-chat-header-action flex h-11 w-11 items-center justify-center rounded-[var(--radius-control)] text-muted-foreground/50 hover:text-foreground transition-colors"
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
