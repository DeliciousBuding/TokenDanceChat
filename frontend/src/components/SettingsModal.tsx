import { useState, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  X, Camera, Save, User, Palette, Bell,
  Sun, Moon, Monitor, Volume2, VolumeX,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/stores/chatStore";
import { useTranslation } from "@/i18n/context";
import { chatAPI } from "@/lib/api";
import { Avatar } from "@/components/Avatar";
import { isSoundEnabled, setSoundEnabled } from "@/lib/soundToggle";
import { playMessageSound } from "@/lib/sound";

type Tab = "profile" | "appearance" | "notifications";
type Theme = "dark" | "light" | "system";

const TABS: { key: Tab; icon: typeof User; labelKey: string }[] = [
  { key: "profile", icon: User, labelKey: "settings.profile" },
  { key: "appearance", icon: Palette, labelKey: "settings.appearance" },
  { key: "notifications", icon: Bell, labelKey: "settings.notifications" },
];

const THEME_OPTIONS: { value: Theme; icon: typeof Sun; labelKey: string }[] = [
  { value: "light", icon: Sun, labelKey: "settings.themeLight" },
  { value: "dark", icon: Moon, labelKey: "settings.themeDark" },
  { value: "system", icon: Monitor, labelKey: "settings.themeSystem" },
];

function getStoredTheme(): Theme {
  const stored = localStorage.getItem("tdchat-theme");
  if (stored === "light" || stored === "dark" || stored === "system") return stored;
  return "light";
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "light") { root.classList.remove("dark"); root.classList.add("light"); }
  else if (theme === "dark") { root.classList.add("dark"); root.classList.remove("light"); }
  else { root.classList.toggle("dark", window.matchMedia("(prefers-color-scheme: dark)").matches); root.classList.remove("light"); }
}

function ToggleSwitch({
  checked,
  onClick,
  ariaLabel,
  visual,
}: {
  checked: boolean;
  onClick: () => void;
  ariaLabel: string;
  visual: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      data-visual={visual}
      onClick={onClick}
      className="relative inline-flex h-11 w-14 shrink-0 items-center justify-center rounded-full transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
    >
      <span
        className={cn(
          "absolute h-7 w-12 rounded-full transition-colors",
          checked ? "bg-[var(--brand)]" : "bg-[var(--bg-3)]",
        )}
      />
      <span
        className={cn(
          "relative inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-[10px]" : "-translate-x-[10px]",
        )}
      />
    </button>
  );
}

interface SettingsModalProps { open: boolean; onClose: () => void; }

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const { t } = useTranslation();
  const { username, userProfiles } = useChatStore();
  const profile = username ? userProfiles[username] : null;
  const [tab, setTab] = useState<Tab>("profile");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [status, setStatus] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [theme, setTheme] = useState<Theme>(getStoredTheme);
  const [soundOn, setSoundOn] = useState(() => isSoundEnabled());
  const [mentionNotify, setMentionNotify] = useState(true);
  const [desktopNotify, setDesktopNotify] = useState(false);

  useEffect(() => {
    if (open && profile) {
      setDisplayName(profile.display_name ?? "");
      setBio(profile.bio ?? "");
      setStatus(profile.status ?? "");
      setAvatarUrl(profile.avatar_url ?? "");
    }
  }, [open, profile]);

  useEffect(() => { applyTheme(theme); localStorage.setItem("tdchat-theme", theme); }, [theme]);

  const toggleSound = useCallback(() => {
    const n = !soundOn; setSoundOn(n); setSoundEnabled(n);
  }, [soundOn]);

  const handleSave = useCallback(() => {
    setSaving(true);
    chatAPI.sendProfileUpdate({ display_name: displayName.trim(), avatar_url: avatarUrl, bio: bio.trim(), status: status.trim() });
    setTimeout(() => setSaving(false), 400);
  }, [displayName, avatarUrl, bio, status]);

  const handleAvatar = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file?.type.startsWith("image/")) return;
    setUploading(true);
    try { const url = await chatAPI.uploadImage(file); if (url) setAvatarUrl(url); } finally { setUploading(false); }
  }, []);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!open) return null;

  const displayNameOrUser = displayName.trim() || username || "?";

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-3 py-4 sm:p-6"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Backdrop */}
      <div
        data-visual="settings-backdrop"
        className="absolute inset-0 bg-black/25 backdrop-blur-md animate-fade-in"
        onClick={onClose}
      />

      {/* Card */}
      <div
        data-visual="settings-modal"
        className="glass-strong relative z-10 flex h-[calc(100vh-2rem)] max-h-[720px] w-full max-w-[720px] flex-col overflow-hidden rounded-[22px] shadow-[0_24px_80px_rgba(0,0,0,0.18)] animate-scale-in sm:h-[560px] sm:max-h-[calc(100vh-4rem)] sm:flex-row"
        style={{ background: 'var(--surface-glass-strong, rgba(255,255,255,0.85))' }}
      >
        {/* macOS-style close button */}
        <button
          type="button"
          onClick={onClose}
          data-visual="settings-close"
          className="absolute left-2 top-2 z-20 flex h-11 w-11 items-center justify-center rounded-full transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] sm:left-3 sm:top-3"
          style={{ color: 'var(--text-secondary)' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          aria-label={t("friend.dismiss")}
        >
          <X className="h-4 w-4" strokeWidth={1.5} />
        </button>

        {/* Left Sidebar */}
        <div
          data-visual="settings-tab-list"
          className="flex shrink-0 gap-2 border-b px-4 pb-3 pt-14 sm:w-[180px] sm:flex-col sm:border-b-0 sm:border-r sm:px-3 sm:pb-6 sm:pt-16"
          style={{ borderColor: 'var(--border-light, var(--border-base))' }}
        >
          {TABS.map(item => {
            const Icon = item.icon;
            const active = tab === item.key;
            return (
              <button
                type="button"
                key={item.key}
                data-visual="settings-tab"
                data-active={active ? "true" : "false"}
                onClick={() => setTab(item.key)}
                className={cn(
                  "flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl px-2 text-[13px] font-medium transition-colors text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] sm:w-full sm:flex-none sm:justify-start sm:gap-2.5 sm:px-4",
                  active
                    ? "text-[var(--brand)]"
                    : "text-[var(--text-secondary)]"
                )}
                style={active ? { background: 'color-mix(in srgb, var(--brand) 10%, transparent)' } : {}}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
              >
                <Icon size={16} strokeWidth={1.5} className="flex-shrink-0" />
                <span className="min-w-0 truncate">{t(item.labelKey)}</span>
              </button>
            );
          })}
        </div>

        {/* Right Content Area */}
        <div data-visual="settings-content" className="relative flex-1 overflow-y-auto px-5 pb-5 pt-5 sm:p-8 sm:pt-14">
          {/* ── Profile Tab ── */}
          {tab === "profile" && (
            <div data-visual="settings-profile-panel" className="flex min-h-full flex-col">
              {/* Section title */}
              <p
                className="text-[11px] font-semibold uppercase tracking-wider mb-6"
                style={{ color: 'var(--text-disabled, var(--text-secondary))' }}
              >
                {t("profile.editProfile")}
              </p>

              {/* Avatar */}
              <div className="flex justify-center mb-8">
                <div className="relative">
                  <Avatar src={avatarUrl || null} name={displayNameOrUser} size="lg" />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    data-visual="settings-avatar-upload"
                    className="absolute -bottom-3 -right-3 flex h-11 w-11 items-center justify-center rounded-full shadow-md transition-transform hover:scale-105 disabled:opacity-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                    style={{ background: 'var(--brand)', color: '#fff' }}
                    aria-label={t("profile.avatarUpload")}
                  >
                    <Camera size={16} strokeWidth={1.5} />
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" onChange={handleAvatar} className="hidden" />
                  {uploading && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    </div>
                  )}
                </div>
              </div>

              {/* Display Name */}
              <div className="mb-5">
                <label
                  className="block text-[11px] font-medium mb-2"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {t("profile.displayName")}
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  maxLength={30}
                  placeholder={username ?? ""}
                  className="w-full h-11 rounded-lg border px-4 text-[14px] transition-all duration-200 placeholder:text-[var(--text-disabled)] focus:outline-none"
                  style={{
                    background: 'var(--bg-1)',
                    borderColor: 'var(--border-base)',
                    color: 'var(--text-primary)',
                  }}
                  onFocus={e => {
                    e.currentTarget.style.borderColor = 'var(--brand)';
                    e.currentTarget.style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--brand) 20%, transparent)';
                  }}
                  onBlur={e => {
                    e.currentTarget.style.borderColor = 'var(--border-base)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
              </div>

              {/* Bio */}
              <div className="mb-5">
                <label
                  className="block text-[11px] font-medium mb-2"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {t("profile.bio")}
                </label>
                <div className="relative">
                  <textarea
                    value={bio}
                    onChange={e => { if (e.target.value.length <= 200) setBio(e.target.value); }}
                    maxLength={200}
                    rows={3}
                    placeholder={t("profile.bio")}
                    className="w-full h-20 rounded-lg border px-4 py-2.5 text-[14px] resize-none transition-all duration-200 placeholder:text-[var(--text-disabled)] focus:outline-none"
                    style={{
                      background: 'var(--bg-1)',
                      borderColor: 'var(--border-base)',
                      color: 'var(--text-primary)',
                    }}
                    onFocus={e => {
                      e.currentTarget.style.borderColor = 'var(--brand)';
                      e.currentTarget.style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--brand) 20%, transparent)';
                    }}
                    onBlur={e => {
                      e.currentTarget.style.borderColor = 'var(--border-base)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  />
                  <span
                    className="absolute bottom-2 right-3 text-[10px]"
                    style={{ color: 'var(--text-disabled)' }}
                  >
                    {bio.length}/200
                  </span>
                </div>
              </div>

              {/* Status */}
              <div className="mb-5">
                <label
                  className="block text-[11px] font-medium mb-2"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {t("profile.status")}
                </label>
                <input
                  type="text"
                  value={status}
                  onChange={e => { if (e.target.value.length <= 50) setStatus(e.target.value); }}
                  maxLength={50}
                  placeholder={t("profile.status")}
                  className="w-full h-11 rounded-lg border px-4 text-[14px] transition-all duration-200 placeholder:text-[var(--text-disabled)] focus:outline-none"
                  style={{
                    background: 'var(--bg-1)',
                    borderColor: 'var(--border-base)',
                    color: 'var(--text-primary)',
                  }}
                  onFocus={e => {
                    e.currentTarget.style.borderColor = 'var(--brand)';
                    e.currentTarget.style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--brand) 20%, transparent)';
                  }}
                  onBlur={e => {
                    e.currentTarget.style.borderColor = 'var(--border-base)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
                <div className="flex justify-end mt-1">
                  <span className="text-[10px]" style={{ color: 'var(--text-disabled)' }}>{status.length}/50</span>
                </div>
              </div>

              {/* Spacer */}
              <div className="flex-1" />

              {/* Save button - fixed to bottom-right of content */}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  data-visual="settings-save"
                  className="flex min-h-11 items-center gap-2 rounded-full px-6 text-[13px] font-medium text-white transition-all hover:brightness-110 disabled:opacity-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
                  style={{ background: 'var(--brand)' }}
                >
                  <Save size={14} strokeWidth={1.5} />
                  {saving ? "..." : t("profile.save")}
                </button>
              </div>
            </div>
          )}

          {/* ── Appearance Tab ── */}
          {tab === "appearance" && (
            <div data-visual="settings-appearance-panel">
              <p
                className="text-[11px] font-semibold uppercase tracking-wider mb-6"
                style={{ color: 'var(--text-disabled, var(--text-secondary))' }}
              >
                {t("settings.appearance")}
              </p>
              <div data-visual="settings-theme-grid" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {THEME_OPTIONS.map(opt => {
                  const Icon = opt.icon;
                  const active = theme === opt.value;
                  return (
                    <button
                      type="button"
                      key={opt.value}
                      onClick={() => setTheme(opt.value)}
                      data-visual="settings-theme-option"
                      data-active={active ? "true" : "false"}
                      className={cn(
                        "flex min-h-[132px] flex-col items-center gap-2.5 rounded-xl border p-4 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]",
                        active
                          ? "ring-2 border-transparent"
                          : "hover:bg-[var(--bg-hover)]"
                      )}
                      style={{
                        borderColor: active ? 'transparent' : 'var(--border-base)',
                        '--tw-ring-color': 'var(--brand)',
                      } as React.CSSProperties}
                    >
                      {/* Theme preview thumbnail */}
                      <div
                        className="w-full h-14 rounded-md overflow-hidden relative"
                        style={{ background: opt.value === 'light' ? '#f5f5f7' : opt.value === 'dark' ? '#1c1c1e' : 'linear-gradient(135deg, #f5f5f7 50%, #1c1c1e 50%)' }}
                      >
                        {/* Mini window chrome */}
                        <div className="absolute top-0 left-0 right-0 h-2.5 flex items-center gap-0.5 px-1.5"
                          style={{ background: opt.value === 'dark' ? '#2c2c2e' : '#e8e8ed' }}>
                          <div className="w-1 h-1 rounded-full" style={{ background: '#ff5f56' }} />
                          <div className="w-1 h-1 rounded-full" style={{ background: '#ffbd2e' }} />
                          <div className="w-1 h-1 rounded-full" style={{ background: '#27c93f' }} />
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Icon size={14} strokeWidth={1.5} style={{ color: active ? 'var(--brand)' : 'var(--text-secondary)' }} />
                        <span
                          className="text-[12px] font-medium"
                          style={{ color: active ? 'var(--brand)' : 'var(--text-secondary)' }}
                        >
                          {t(opt.labelKey)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Notifications Tab ── */}
          {tab === "notifications" && (
            <div data-visual="settings-notifications-panel">
              <p
                className="text-[11px] font-semibold uppercase tracking-wider mb-6"
                style={{ color: 'var(--text-disabled, var(--text-secondary))' }}
              >
                {t("settings.notifications")}
              </p>

              {/* Sound toggle */}
              <div
                className="flex items-center justify-between py-3.5 border-b transition-colors"
                style={{ borderColor: 'var(--border-light, var(--border-base))' }}
              >
                <div className="flex items-center gap-2.5">
                  {soundOn
                    ? <Volume2 size={16} strokeWidth={1.5} style={{ color: 'var(--text-secondary)' }} />
                    : <VolumeX size={16} strokeWidth={1.5} style={{ color: 'var(--text-disabled)' }} />
                  }
                  <div>
                    <p className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>{t("settings.sound")}</p>
                    <p className="text-[11px]" style={{ color: 'var(--text-disabled)' }}>
                      {soundOn ? t("settings.soundOn") : t("settings.soundOff")}
                    </p>
                  </div>
                </div>
                {/* Toggle Switch */}
                <ToggleSwitch
                  checked={soundOn}
                  onClick={toggleSound}
                  ariaLabel={t("settings.sound")}
                  visual="settings-sound-switch"
                />
              </div>

              {/* @Mention toggle */}
              <div
                className="flex items-center justify-between py-3.5 border-b transition-colors"
                style={{ borderColor: 'var(--border-light, var(--border-base))' }}
              >
                <div>
                  <p className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>@{t("settings.notificationPrefs")}</p>
                  <p className="text-[11px]" style={{ color: 'var(--text-disabled)' }}>
                    {mentionNotify ? "已开启" : "已关闭"}
                  </p>
                </div>
                <ToggleSwitch
                  checked={mentionNotify}
                  onClick={() => setMentionNotify(!mentionNotify)}
                  ariaLabel={t("settings.notificationPrefs")}
                  visual="settings-mention-switch"
                />
              </div>

              {/* Desktop notification toggle */}
              <div
                className="flex items-center justify-between py-3.5 transition-colors"
              >
                <div>
                  <p className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>桌面通知</p>
                  <p className="text-[11px]" style={{ color: 'var(--text-disabled)' }}>
                    {desktopNotify ? "已开启" : "已关闭"}
                  </p>
                </div>
                <ToggleSwitch
                  checked={desktopNotify}
                  onClick={() => setDesktopNotify(!desktopNotify)}
                  ariaLabel="桌面通知"
                  visual="settings-desktop-switch"
                />
              </div>

              {/* Test sound button */}
              <button
                type="button"
                onClick={() => { playMessageSound(); }}
                data-visual="settings-test-sound"
                className="mt-6 min-h-11 w-full rounded-lg border px-4 text-[13px] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
                style={{
                  borderColor: 'var(--border-base)',
                  color: 'var(--text-secondary)',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'var(--bg-hover)';
                  e.currentTarget.style.color = 'var(--text-primary)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--text-secondary)';
                }}
              >
                {t("settings.testSound")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
