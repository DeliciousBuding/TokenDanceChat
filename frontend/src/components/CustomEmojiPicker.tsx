import { memo, useRef, useState, useCallback, useEffect } from "react";
import { useChatStore } from "@/stores/chatStore";
import { useTranslation } from "@/i18n/context";
import { chatAPI } from "@/lib/api";
import { Upload, Trash2 } from "lucide-react";

interface CustomEmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export const CustomEmojiPicker = memo(function CustomEmojiPicker({
  onSelect,
  onClose,
}: CustomEmojiPickerProps) {
  const { t } = useTranslation();
  const customEmojis = useChatStore((s) => s.customEmojis);
  const username = useChatStore((s) => s.username);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSelect = useCallback(
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

      // Validate file type
      const validTypes = ["image/png", "image/jpeg", "image/gif", "image/webp"];
      if (!validTypes.includes(file.type)) {
        setError("Invalid file type. Allowed: PNG, JPG, GIF, WebP");
        return;
      }

      // Validate file size (max 128KB)
      if (file.size > 128 * 1024) {
        setError("File too large. Max 128KB");
        return;
      }

      setUploading(true);
      setError(null);

      // Derive name from filename (strip extension, sanitize)
      const baseName = file.name.replace(/\.[^.]+$/, "");
      const emojiName = baseName.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 32) || "emoji";

      try {
        const url = await chatAPI.uploadEmoji(file, emojiName);
        if (url) {
          chatAPI.sendCustomEmojiAdd(emojiName, url);
        } else {
          setError("Upload failed");
        }
      } catch {
        setError("Upload failed");
      } finally {
        setUploading(false);
        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [t],
  );

  const handleDelete = useCallback(
    (name: string) => {
      chatAPI.sendCustomEmojiDelete(name);
    },
    [],
  );

  // Request emoji list on mount.
  useEffect(() => {
    chatAPI.sendCustomEmojiList();
  }, []);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } }}
    >
      <div className="animate-scale-in rounded-xl border border-border bg-card shadow-2xl w-[340px] max-h-[440px] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-3 pt-3 pb-2 border-b border-border">
          <span className="text-xs font-medium text-foreground">
            {t("emoji.custom")}
          </span>
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

        {/* Error message */}
        {error && (
          <div className="px-3 py-1.5 text-[10px] text-red-500 bg-red-500/10">
            {error}
          </div>
        )}

        {/* Emoji grid */}
        <div className="overflow-y-auto flex-1 p-3 custom-scrollbar">
          {customEmojis.length === 0 ? (
            <div className="text-center py-8 text-xs text-muted-foreground/50">
              {t("emoji.noCustomEmoji")}
            </div>
          ) : (
            <div className="grid grid-cols-6 gap-2">
              {customEmojis.map((emoji) => (
                <div key={emoji.name} className="group relative">
                  <button
                    onClick={() => handleSelect(emoji.name)}
                    title={`:${emoji.name}:`}
                    className="flex flex-col items-center gap-1 w-full p-2 rounded-lg hover:bg-accent transition-colors"
                  >
                    <div className="w-10 h-10 flex items-center justify-center">
                      <img
                        src={emoji.url}
                        alt={emoji.name}
                        className="max-w-full max-h-full object-contain"
                        loading="lazy"
                      />
                    </div>
                    <span className="text-[9px] text-muted-foreground/60 truncate w-full text-center leading-none">
                      :{emoji.name}:
                    </span>
                  </button>
                  {emoji.uploader === username && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(emoji.name);
                      }}
                      className="absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center rounded-full bg-destructive/90 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive"
                      title={t("emoji.deleteEmoji")}
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
