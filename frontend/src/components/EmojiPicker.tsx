import { memo, useCallback, useState, useMemo } from "react";
import { useTranslation } from "@/i18n/context";

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

  const categoryLabels = useMemo(() => ({
    Smileys: t("emoji.smileys"),
    Gestures: t("emoji.gestures"),
    Hearts: t("emoji.hearts"),
    Objects: t("emoji.objects"),
    Misc: t("emoji.misc"),
  }), [t]);

  const handleSelect = useCallback(
    (emoji: string) => {
      saveRecents(emoji);
      onSelect(emoji);
      onClose();
    },
    [onSelect, onClose],
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
            className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-[hsl(220,2.5%,35%)]"
          />
        </div>

        {/* Recent emojis */}
        {!search && recents.length > 0 && (
          <div className="px-3 pb-2 border-b border-[hsl(220,2.5%,16%)]">
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
          <div className="flex gap-0.5 px-3 pb-2 border-b border-[hsl(220,2.5%,16%)]">
            {CATEGORIES.map((cat, i) => (
              <button key={cat.name} onClick={() => setActiveCat(i)}
                className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors ${
                  i === activeCat ? "bg-accent text-foreground" : "text-muted-foreground/60 hover:text-muted-foreground"
                }`}>
                {categoryLabels[cat.name as keyof typeof categoryLabels] || cat.name}
              </button>
            ))}
          </div>
        )}

        {/* Emoji grid */}
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
      </div>
    </div>
  );
});
