import { memo, useCallback, useState, useMemo } from "react";

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
  const [activeCat, setActiveCat] = useState(0);
  const [search, setSearch] = useState("");
  const [recents] = useState(getRecents);

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
    >
      <div className="animate-scale-in rounded-xl border border-border bg-card shadow-2xl w-[340px] max-h-[440px] flex flex-col">
        {/* Search bar */}
        <div className="px-3 pt-3 pb-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search emoji..."
            className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-[hsl(220,2.5%,35%)]"
          />
        </div>

        {/* Recent emojis */}
        {!search && recents.length > 0 && (
          <div className="px-3 pb-2 border-b border-[hsl(220,2.5%,16%)]">
            <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider mb-1 block">Recent</span>
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
                {cat.name}
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
            <div className="text-center py-8 text-xs text-muted-foreground/50">No emojis found</div>
          )}
        </div>
      </div>
    </div>
  );
});
