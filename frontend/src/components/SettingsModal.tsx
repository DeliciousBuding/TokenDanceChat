import { useState, useCallback, useRef, useEffect } from "react";
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm animate-fade-in" onClick={onClose} />

      {/* Card */}
      <div
        className="relative z-10 flex w-[680px] max-w-[calc(100vw-2rem)] h-[480px] max-h-[calc(100vh-4rem)] rounded-2xl shadow-xl overflow-hidden animate-scale-in"
        style={{ background: 'var(--surface-glass-strong, rgba(255,255,255,0.85))' }}
      >
        {/* macOS-style close button */}
        <button
          onClick={onClose}
          className="absolute top-3 left-3 z-20 w-8 h-8 flex items-center justify-center rounded-full transition-colors cursor-pointer"
          style={{ color: 'var(--text-secondary)' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          aria-label={t("friend.dismiss")}
        >
          <X className="h-4 w-4" strokeWidth={1.5} />
        </button>

        {/* Left Sidebar */}
        <div className="w-[160px] flex-shrink-0 flex flex-col pt-14 pb-6 px-3 gap-0.5 border-r" style={{ borderColor: 'var(--border-light, var(--border-base))' }}>
          {TABS.map(item => {
            const Icon = item.icon;
            const active = tab === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setTab(item.key)}
                className={cn(
                  "flex items-center gap-2.5 h-10 rounded-lg px-4 text-[13px] font-medium transition-colors text-left",
                  active
                    ? "text-[var(--brand)]"
                    : "text-[var(--text-secondary)]"
                )}
                style={active ? { background: 'color-mix(in srgb, var(--brand) 10%, transparent)' } : {}}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
              >
                <Icon size={16} strokeWidth={1.5} className="flex-shrink-0" />
                <span>{t(item.labelKey)}</span>
              </button>
            );
          })}
        </div>

        {/* Right Content Area */}
        <div className="flex-1 overflow-y-auto p-8 pt-14 relative">
          {/* ── Profile Tab ── */}
          {tab === "profile" && (
            <div className="flex flex-col h-full">
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
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full shadow-md transition-transform hover:scale-105 disabled:opacity-50 cursor-pointer"
                    style={{ background: 'var(--brand)', color: '#fff' }}
                  >
                    <Camera size={13} strokeWidth={1.5} />
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
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1.5 h-9 px-6 rounded-full text-[13px] font-medium text-white transition-all hover:brightness-110 disabled:opacity-50 cursor-pointer"
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
            <div>
              <p
                className="text-[11px] font-semibold uppercase tracking-wider mb-6"
                style={{ color: 'var(--text-disabled, var(--text-secondary))' }}
              >
                {t("settings.appearance")}
              </p>
              <div className="grid grid-cols-3 gap-3">
                {THEME_OPTIONS.map(opt => {
                  const Icon = opt.icon;
                  const active = theme === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setTheme(opt.value)}
                      className={cn(
                        "flex flex-col items-center gap-2.5 rounded-xl border p-4 transition-all cursor-pointer",
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
            <div>
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
                <button
                  role="switch"
                  aria-checked={soundOn}
                  onClick={toggleSound}
                  className={cn(
                    "relative inline-flex h-6 w-10 items-center rounded-full transition-colors cursor-pointer",
                    soundOn ? "bg-[var(--brand)]" : "bg-[var(--bg-3)]"
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-4.5 w-4.5 transform rounded-full bg-white transition-transform shadow-sm",
                      soundOn ? "translate-x-[18px]" : "translate-x-[4px]"
                    )}
                  />
                </button>
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
                <button
                  role="switch"
                  aria-checked={mentionNotify}
                  onClick={() => setMentionNotify(!mentionNotify)}
                  className={cn(
                    "relative inline-flex h-6 w-10 items-center rounded-full transition-colors cursor-pointer",
                    mentionNotify ? "bg-[var(--brand)]" : "bg-[var(--bg-3)]"
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-4.5 w-4.5 transform rounded-full bg-white transition-transform shadow-sm",
                      mentionNotify ? "translate-x-[18px]" : "translate-x-[4px]"
                    )}
                  />
                </button>
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
                <button
                  role="switch"
                  aria-checked={desktopNotify}
                  onClick={() => setDesktopNotify(!desktopNotify)}
                  className={cn(
                    "relative inline-flex h-6 w-10 items-center rounded-full transition-colors cursor-pointer",
                    desktopNotify ? "bg-[var(--brand)]" : "bg-[var(--bg-3)]"
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-4.5 w-4.5 transform rounded-full bg-white transition-transform shadow-sm",
                      desktopNotify ? "translate-x-[18px]" : "translate-x-[4px]"
                    )}
                  />
                </button>
              </div>

              {/* Test sound button */}
              <button
                onClick={() => { playMessageSound(); }}
                className="mt-6 w-full rounded-lg border px-4 py-2.5 text-[13px] transition-colors cursor-pointer"
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
    </div>
  );
}
