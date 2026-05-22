import { useState, useCallback, useRef, useEffect } from "react";
import {
  X, Camera, Save, User, Palette, Bell, Database, Key,
  Sun, Moon, Monitor, Volume2, VolumeX, Copy, Plus,
  Loader2, Check, Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/stores/chatStore";
import { useTranslation } from "@/i18n/context";
import { chatAPI, generateInviteCode, listInviteCodes, type InviteCode } from "@/lib/api";
import { Avatar } from "@/components/Avatar";
import { isSoundEnabled, setSoundEnabled } from "@/lib/soundToggle";
import { playMessageSound } from "@/lib/sound";

type Tab = "profile" | "appearance" | "notifications" | "data" | "account";
type Theme = "dark" | "light" | "system";

const TABS: Tab[] = ["profile", "appearance", "notifications", "data", "account"];
const TAB_ICON: Record<Tab, typeof User> = { profile: User, appearance: Palette, notifications: Bell, data: Database, account: Key };
const TAB_LABEL: Record<Tab, string> = { profile: "settings.profile", appearance: "settings.appearance", notifications: "settings.notifications", data: "settings.data", account: "settings.account" };
const THEME_OPTIONS: { value: Theme; icon: typeof Sun; label: string }[] = [
  { value: "light", icon: Sun, label: "settings.themeLight" },
  { value: "dark", icon: Moon, label: "settings.themeDark" },
  { value: "system", icon: Monitor, label: "settings.themeSystem" },
];

function getStoredTheme(): Theme {
  const stored = localStorage.getItem("tdchat-theme");
  if (stored === "light" || stored === "dark" || stored === "system") return stored;
  return "dark";
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
  const { username, userProfiles, scheduledMessages } = useChatStore();
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
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [codesLoading, setCodesLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [maxUses, setMaxUses] = useState(5);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  useEffect(() => {
    if (open && profile) {
      setDisplayName(profile.display_name ?? "");
      setBio(profile.bio ?? "");
      setStatus(profile.status ?? "");
      setAvatarUrl(profile.avatar_url ?? "");
    }
  }, [open, profile]);

  useEffect(() => { applyTheme(theme); localStorage.setItem("tdchat-theme", theme); }, [theme]);

  useEffect(() => {
    if (open && username && tab === "account") {
      setCodesLoading(true); setInviteError("");
      listInviteCodes(username).then(setCodes).catch(e => setInviteError(e.message)).finally(() => setCodesLoading(false));
    }
  }, [open, username, tab]);

  const toggleSound = useCallback(() => { const n = !soundOn; setSoundOn(n); setSoundEnabled(n); }, [soundOn]);

  const handleSave = useCallback(() => {
    setSaving(true);
    chatAPI.sendProfileUpdate({ display_name: displayName.trim(), avatar_url: avatarUrl, bio: bio.trim(), status: status.trim() });
    setSaving(false);
  }, [displayName, avatarUrl, bio, status]);

  const handleAvatar = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file?.type.startsWith("image/")) return;
    setUploading(true);
    try { const url = await chatAPI.uploadImage(file); if (url) setAvatarUrl(url); } finally { setUploading(false); }
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!username) return;
    setGenerating(true); setInviteError("");
    try {
      const r = await generateInviteCode(username, maxUses);
      setCodes(prev => [{ code: r.code, creator: username, max_uses: maxUses, use_count: 0, created_at: Date.now() }, ...prev]);
    } catch (err) { setInviteError(err instanceof Error ? err.message : "Failed"); }
    finally { setGenerating(false); }
  }, [username, maxUses]);

  const handleCopy = useCallback(async (code: string) => {
    try { await navigator.clipboard.writeText(code); setCopiedCode(code); setTimeout(() => setCopiedCode(null), 2000); } catch { /* noop */ }
  }, []);

  const handleExport = useCallback(async () => {
    try {
      const blob = await chatAPI.exportChat("public", "json");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `chat-export-${Date.now()}.json`; a.click();
      URL.revokeObjectURL(url);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!open) return null;

  const displayNameOrUser = displayName.trim() || username || "?";
  const renderTabButton = (tabKey: Tab, mobile: boolean) => {
    const Icon = TAB_ICON[tabKey];
    return (
      <button key={tabKey} onClick={() => setTab(tabKey)}
        className={cn(mobile
          ? "flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-[10px] transition-colors flex-shrink-0"
          : "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors text-left",
          tab === tabKey ? "bg-accent text-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-accent/50")}>
        <Icon className={mobile ? "h-4 w-4" : "h-4 w-4 flex-shrink-0"} /><span>{t(TAB_LABEL[tabKey])}</span>
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center md:p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative z-10 flex w-full h-full md:h-auto md:max-h-[600px] md:max-w-2xl md:rounded-xl bg-card border-0 md:border border-border shadow-2xl overflow-hidden animate-scale-in">
        <button onClick={onClose} className="absolute top-3 right-3 z-20 rounded-full p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors" aria-label={t("friend.dismiss")}>
          <X className="h-4 w-4" />
        </button>
        <div className="hidden sm:flex flex-col w-44 border-r border-border bg-accent/20 py-4 px-2 gap-0.5 flex-shrink-0">
          {TABS.map(k => renderTabButton(k, false))}
        </div>
        <div className="sm:hidden flex border-b border-border bg-accent/20 px-2 py-2 gap-0.5 overflow-x-auto flex-shrink-0">
          {TABS.map(k => renderTabButton(k, true))}
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-6 md:px-8">
          {tab === "profile" && (
            <div className="space-y-4">
              <div className="flex justify-center">
                <div className="relative">
                  <Avatar src={avatarUrl || null} name={displayNameOrUser} size="lg" />
                  <button onClick={() => fileRef.current?.click()} disabled={uploading}
                    className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md hover:brightness-110 transition-all disabled:opacity-50">
                    <Camera className="h-4 w-4" />
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" onChange={handleAvatar} className="hidden" />
                  {uploading && <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40"><div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" /></div>}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">{t("profile.displayName")}</label>
                <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={30} placeholder={username ?? ""}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus-visible:ring-2 focus-visible:ring-primary/50" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">{t("profile.bio")}</label>
                <textarea value={bio} onChange={e => { if (e.target.value.length <= 200) setBio(e.target.value); }} maxLength={200} rows={2} placeholder={t("profile.bio")}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none outline-none focus-visible:ring-2 focus-visible:ring-primary/50" />
                <div className="flex justify-end"><span className="text-[10px] text-muted-foreground/50">{bio.length}/200</span></div>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">{t("profile.status")}</label>
                <input type="text" value={status} onChange={e => { if (e.target.value.length <= 50) setStatus(e.target.value); }} maxLength={50} placeholder={t("profile.status")}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/50" />
                <div className="flex justify-end"><span className="text-[10px] text-muted-foreground/50">{status.length}/50</span></div>
              </div>
              <button onClick={handleSave} disabled={saving}
                className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium bg-primary text-primary-foreground hover:brightness-110 disabled:opacity-50 transition-colors">
                <Save className="h-4 w-4" />{saving ? "..." : t("profile.save")}
              </button>
            </div>
          )}
          {tab === "appearance" && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground">{t("settings.appearance")}</h2>
              {THEME_OPTIONS.map(opt => {
                const Icon = opt.icon;
                return (
                  <button key={opt.value} onClick={() => setTheme(opt.value)}
                    className={cn("flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-sm transition-colors",
                      theme === opt.value ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground")}>
                    <Icon className="h-5 w-5" /><span>{t(opt.label)}</span>
                    {theme === opt.value && <span className="ml-auto h-2 w-2 rounded-full bg-primary" />}
                  </button>
                );
              })}
            </div>
          )}
          {tab === "notifications" && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground">{t("settings.notifications")}</h2>
              <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                <div>
                  <p className="text-sm text-foreground">{t("settings.sound")}</p>
                  <p className="text-[11px] text-muted-foreground/60">{soundOn ? t("settings.soundOn") : t("settings.soundOff")}</p>
                </div>
                <button onClick={toggleSound}
                  className={cn("rounded-lg p-2 transition-colors", soundOn ? "text-foreground bg-accent" : "text-muted-foreground/50 hover:text-foreground hover:bg-accent")}>
                  {soundOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
                </button>
              </div>
              <button onClick={() => { playMessageSound(); }}
                className="w-full rounded-lg border border-border px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                {t("settings.testSound")}
              </button>
            </div>
          )}
          {tab === "data" && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground">{t("settings.data")}</h2>
              <button onClick={handleExport}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-4 py-3 text-sm text-foreground hover:bg-accent transition-colors">
                <Download className="h-4 w-4" />{t("settings.exportData")}
              </button>
              <div className="rounded-lg border border-border px-4 py-3">
                <p className="text-xs text-muted-foreground">{t("schedule.scheduledMessages")}</p>
                <p className="text-2xl font-semibold text-foreground mt-1">{scheduledMessages.length}</p>
              </div>
            </div>
          )}
          {tab === "account" && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground">{t("settings.account")}</h2>
              <div className="rounded-lg border border-border px-4 py-3">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{t("settings.myAccount")}</p>
                <p className="text-sm font-medium text-foreground mt-1">{username}</p>
              </div>
              <div>
                <div className="flex items-end gap-2 mb-3">
                  <div className="flex-1">
                    <label className="mb-1 block text-[10px] font-medium text-muted-foreground">{t("invite.maxUses")}</label>
                    <input type="number" value={maxUses} onChange={e => setMaxUses(Math.max(1, Math.min(999, parseInt(e.target.value) || 1)))}
                      min={1} max={999} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/50" />
                  </div>
                  <button onClick={handleGenerate} disabled={generating}
                    className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:brightness-110 disabled:opacity-50 transition-colors">
                    {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{t("invite.generateCode")}
                  </button>
                </div>
                {inviteError && <p className="text-xs text-destructive mb-3" role="alert">{inviteError}</p>}
                <div className="max-h-48 overflow-y-auto space-y-2">
                  {codesLoading ? (
                    <div className="flex items-center justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                  ) : codes.length === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">{t("invite.noCodes")}</p>
                  ) : (
                    codes.map(c => (
                      <div key={c.code} className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2.5">
                        <div className="flex-1 min-w-0">
                          <code className="text-sm font-mono text-foreground tracking-wider">{c.code}</code>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{t("invite.usesLeft").replace("{{used}}", String(c.use_count)).replace("{{max}}", String(c.max_uses))}</p>
                        </div>
                        <button onClick={() => handleCopy(c.code)}
                          className="ml-2 rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                          {copiedCode === c.code ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
