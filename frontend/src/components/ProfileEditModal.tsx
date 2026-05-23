import { useState, useCallback, useRef, useEffect } from "react";
import { X, Camera, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/stores/chatStore";
import { useTranslation } from "@/i18n/context";
import { chatAPI } from "@/lib/api";
import { Avatar } from "@/components/Avatar";

interface ProfileEditModalProps {
  onClose: () => void;
}

export function ProfileEditModal({ onClose }: ProfileEditModalProps) {
  const { t } = useTranslation();
  const { username, userProfiles } = useChatStore();
  const profile = username ? userProfiles[username] : null;

  const [displayName, setDisplayName] = useState(profile?.display_name ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [status, setStatus] = useState(profile?.status ?? "");
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? "");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    if (isMobile) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [isMobile]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleAvatarUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!file.type.startsWith("image/")) return;

      setUploading(true);
      try {
        const url = await chatAPI.uploadImage(file);
        if (url) {
          setAvatarUrl(url);
        }
      } finally {
        setUploading(false);
      }
    },
    [],
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const ws = (chatAPI as any).ws;
      if (ws?.readyState === WebSocket.OPEN) {
        (chatAPI as any).send({
          type: "profile_update",
          display_name: displayName.trim(),
          avatar_url: avatarUrl,
          bio: bio.trim(),
          status: status.trim(),
        });
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }, [displayName, avatarUrl, bio, status, onClose]);

  const displayNameOrUser = displayName.trim() || username || "?";

  const content = (
    <div
      className={cn(
        isMobile
          ? "rounded-t-2xl bg-card border-t border-border px-6 pt-8 pb-8 animate-slide-up"
          : "rounded-xl bg-card border border-border p-6 shadow-2xl animate-scale-in",
        "w-full max-w-sm",
      )}
    >
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

      {/* Title */}
      <h2 className="text-center text-lg font-semibold mb-6 text-foreground">
        {t("profile.editProfile")}
      </h2>

      {/* Avatar section */}
      <div className="flex justify-center mb-6">
        <div className="relative">
          <Avatar src={avatarUrl || null} name={displayNameOrUser} size="lg" />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md hover:brightness-110 transition-all disabled:opacity-50"
            aria-label={t("profile.avatarUpload")}
          >
            <Camera className="h-4 w-4" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={handleAvatarUpload}
            className="hidden"
            aria-label={t("profile.avatarUpload")}
          />
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            </div>
          )}
        </div>
      </div>

      {/* Display name */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">
          {t("profile.displayName")}
        </label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={30}
          placeholder={username ?? ""}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none transition-colors"
        />
      </div>

      {/* Bio */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">
          {t("profile.bio")}
        </label>
        <textarea
          value={bio}
          onChange={(e) => {
            if (e.target.value.length <= 200) setBio(e.target.value);
          }}
          maxLength={200}
          rows={3}
          placeholder={t("profile.bio")}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none resize-none transition-colors"
          style={{ scrollbarWidth: "thin" }}
        />
        <div className="flex justify-end mt-0.5">
          <span className="text-[10px] text-muted-foreground/50">
            {bio.length}/200
          </span>
        </div>
      </div>

      {/* Status */}
      <div className="mb-6">
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">
          {t("profile.status")}
        </label>
        <input
          type="text"
          value={status}
          onChange={(e) => {
            if (e.target.value.length <= 50) setStatus(e.target.value);
          }}
          maxLength={50}
          placeholder={t("profile.status")}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none transition-colors"
        />
        <div className="flex justify-end mt-0.5">
          <span className="text-[10px] text-muted-foreground/50">
            {status.length}/50
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={onClose}
          className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent border border-border transition-colors"
        >
          {t("profile.cancel")}
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium bg-primary text-primary-foreground hover:brightness-110 disabled:opacity-50 transition-colors"
        >
          <Save className="h-4 w-4" />
          {saving ? "..." : t("profile.save")}
        </button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("profile.editProfile")}
        className="fixed inset-0 z-50 flex items-end justify-center"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={onClose}
        />
        <div className="relative z-10 w-full max-w-sm">{content}</div>
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("profile.editProfile")}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div className="relative z-10">{content}</div>
    </div>
  );
}
