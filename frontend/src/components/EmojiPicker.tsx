import { memo, useCallback, useState, useMemo, useRef, useEffect } from "react";
import { useTranslation } from "@/i18n/context";
import { useChatStore } from "@/stores/chatStore";
import { chatAPI } from "@/lib/api";
import { Upload, Trash2 } from "lucide-react";

const RECENTS_KEY = "tdchat:recent-emojis";
const MAX_RECENTS = 18;

function getRecents(): string[] {
  try {
    const stored = localStorage.getItem(RECENTS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch { return []; }
}

function saveRecents(emoji: string): string[] {
  const recents = getRecents().filter((e) => e !== emoji);
  recents.unshift(emoji);
  const trimmed = recents.slice(0, MAX_RECENTS);
  try { localStorage.setItem(RECENTS_KEY, JSON.stringify(trimmed)); } catch { /* ignore */ }
  return trimmed;
}

const CATEGORIES: { name: string; emojis: string[] }[] = [
  { name: "Smileys", emojis: ["😀", "😃", "😄", "😁", "😅", "🤣", "😂", "🙂", "😊", "😇", "😍", "🤩", "😘", "😗", "😋", "😛", "😜", "🤪", "😝", "🤗", "🤔", "😐", "😑", "😶", "😏", "😒", "🙄", "😌", "😔", "😪", "😴", "😷", "🤒", "🤕", "🥵", "🥶", "😵", "🤯", "🥳", "😎", "🤓", "😟", "😮", "😯", "😲", "😳", "🥺", "😦", "😨", "😰", "😢", "😭", "😱", "😡", "🤬", "😤"] },
  { name: "Gestures", emojis: ["👍", "👎", "👌", "✌️", "🤞", "🤟", "🤘", "🤙", "👋", "✋", "🖐", "👆", "👇", "👉", "👈", "🙌", "👏", "🙏", "🤝", "💪", "🦾", "🖕", "✍️", "🤲", "🫶", "🤌"] },
  { name: "Hearts", emojis: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "💕", "💖", "💗", "💘", "💝", "💞", "💟", "♥️", "🩷", "🩵", "🩶"] },
  { name: "Objects", emojis: ["🎉", "🎊", "🎂", "🔥", "⭐", "🌟", "✨", "💯", "✅", "❌", "💤", "🎵", "🎶", "📌", "📍", "💡", "🔔", "🔕", "💬", "💭", "🚀", "🌈", "☀️", "🌙", "⚡", "💎", "🎁", "🏆", "🎯", "💰", "📢", "📣"] },
  { name: "Misc", emojis: ["👿", "💀", "💩", "🤡", "👻", "👽", "🤖", "😺", "😸", "😹", "😻", "🐶", "🐱", "🦊", "🐼", "🐨", "🐸", "🦄", "🐙", "🍕", "🍔", "🌮", "☕", "🍺", "🎮", "⚽", "🏀", "🧠", "👀", "👃", "🫀"] },
];

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export const EmojiPicker = memo(function EmojiPicker({
  onSelect,
  onClose,
}: EmojiPickerProps) {
  const { t } = useTranslation();
  const [activeCat, setActiveCat] = useState(0);
  const [search, setSearch] = useState("");
  const [recents] = useState(getRecents);
  const [emojiError, setEmojiError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const customEmojis = useChatStore((s) => s.customEmojis);
  const username = useChatStore((s) => s.username);

  // Request emoji list on mount.
  useEffect(() => {
    chatAPI.sendCustomEmojiList();
  }, []);

  const categoryLabels = useMemo(() => ({
    Smileys: t("emoji.smileys"),
    Gestures: t("emoji.gestures"),
    Hearts: t("emoji.hearts"),
    Objects: t("emoji.objects"),
    Misc: t("emoji.misc"),
    Custom: t("emoji.custom"),
  }), [t]);

  const handleSelect = useCallback(
    (emoji: string) => {
      saveRecents(emoji);
      onSelect(emoji);
      onClose();
    },
    [onSelect, onClose],
  );

  const handleCustomSelect = useCallback(
    (name: string) => {
      onSelect(`:${name}:`);
      onClose();
    },
    [onSelect, onClose],
  );

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const validTypes = ["image/png", "image/jpeg", "image/gif", "image/webp"];
      if (!validTypes.includes(file.type)) {
        setEmojiError("Invalid file type. Allowed: PNG, JPG, GIF, WebP");
        return;
      }

      if (file.size > 128 * 1024) {
        setEmojiError("File too large. Max 128KB");
        return;
      }

      setUploading(true);
      setEmojiError(null);

      const baseName = file.name.replace(/\.[^.]+$/, "");
      const emojiName = baseName.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 32) || "emoji";

      try {
        const url = await chatAPI.uploadEmoji(file, emojiName);
        if (url) {
          chatAPI.sendCustomEmojiAdd(emojiName, url);
        } else {
          setEmojiError("Upload failed");
        }
      } catch {
        setEmojiError("Upload failed");
      } finally {
        setUploading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [],
  );

  const handleDelete = useCallback(
    (name: string) => {
      chatAPI.sendCustomEmojiDelete(name);
    },
    [],
  );

  const filteredEmojis = useMemo(() => {
    if (!search.trim()) return CATEGORIES[activeCat].emojis;
    const lower = search.toLowerCase();
    const all: string[] = [];
    for (const cat of CATEGORIES) {
      for (const e of cat.emojis) {
        if (e.includes(lower) || (e.codePointAt(0)?.toString(16) || "").includes(lower)) {
          all.push(e);
        }
      }
    }
    return all.slice(0, 60);
  }, [search, activeCat]);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } }}
    >
      <div className="animate-scale-in rounded-xl border border-border bg-card shadow-2xl w-[340px] max-h-[440px] flex flex-col">
        {/* Search bar */}
        <div className="px-3 pt-3 pb-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("emoji.search")}
            aria-label={t("emoji.search")}
            className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none"
          />
        </div>

        {/* Recent emojis */}
        {!search && recents.length > 0 && (
          <div className="px-3 pb-2 border-b border-border">
            <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider mb-1 block">{t("emoji.recent")}</span>
            <div className="flex flex-wrap gap-1">
              {recents.map((emoji) => (
                <button key={emoji} onClick={() => handleSelect(emoji)}
                  className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-accent text-lg transition-colors">
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Category tabs */}
        {!search && (
          <div className="flex gap-0.5 px-3 pb-2 border-b border-border">
            {CATEGORIES.map((cat, i) => (
              <button key={cat.name} onClick={() => setActiveCat(i)}
                className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors ${
                  i === activeCat ? "bg-accent text-foreground" : "text-muted-foreground/60 hover:text-muted-foreground"
                }`}>
                {categoryLabels[cat.name as keyof typeof categoryLabels] || cat.name}
              </button>
            ))}
            <button onClick={() => setActiveCat(-1)}
              className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors ${
                -1 === activeCat ? "bg-accent text-foreground" : "text-muted-foreground/60 hover:text-muted-foreground"
              }`}>
              {categoryLabels.Custom}
            </button>
          </div>
        )}

        {/* Emoji grid or CustomEmoji inline grid */}
        {activeCat === -1 && !search ? (
          <div className="overflow-y-auto flex-1 p-3 custom-scrollbar">
            {/* Upload header */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-muted-foreground/50">{t("emoji.custom")}</span>
              <button
                onClick={handleUploadClick}
                disabled={uploading}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
              >
                <Upload className="w-3 h-3" />
                {uploading ? "..." : t("emoji.uploadEmoji")}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
            {emojiError && (
              <div className="mb-2 text-[10px] text-red-500">{emojiError}</div>
            )}
            {customEmojis.length === 0 ? (
              <div className="text-center py-8 text-xs text-muted-foreground/50">{t("emoji.noCustomEmoji")}</div>
            ) : (
              <div className="grid grid-cols-5 gap-2">
                {customEmojis.map((emoji) => (
                  <div key={emoji.name} className="group relative">
                    <button
                      onClick={() => handleCustomSelect(emoji.name)}
                      title={`:${emoji.name}:`}
                      className="flex flex-col items-center gap-1 w-full p-1.5 rounded-lg hover:bg-accent transition-colors"
                    >
                      <div className="w-10 h-10 flex items-center justify-center">
                        <img
                          src={emoji.url}
                          alt={emoji.name}
                          className="max-w-full max-h-full object-contain"
                          loading="lazy"
                        />
                      </div>
                      <span className="text-[8px] text-muted-foreground/60 truncate w-full text-center leading-none">
                        :{emoji.name}:
                      </span>
                    </button>
                    {emoji.uploader === username && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(emoji.name);
                        }}
                        className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center rounded-full bg-destructive/90 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive"
                        title={t("emoji.deleteEmoji")}
                      >
                        <Trash2 className="w-2 h-2" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
        <div className="overflow-y-auto flex-1 p-3 custom-scrollbar">
          <div className="grid grid-cols-8 gap-0.5">
            {filteredEmojis.map((emoji) => (
              <button key={emoji} onClick={() => handleSelect(emoji)}
                className="flex items-center justify-center w-9 h-9 rounded-lg hover:bg-accent text-lg transition-colors">
                {emoji}
              </button>
            ))}
          </div>
          {filteredEmojis.length === 0 && (
            <div className="text-center py-8 text-xs text-muted-foreground/50">{t("emoji.noResults")}</div>
          )}
        </div>
        )}
      </div>
    </div>
  );
});
