import { memo, useCallback } from "react";

const QUICK_EMOJI = ["👍", "❤️", "😂", "😮", "😢", "😡", "👏", "🎉", "🔥", "💯"];
const EMOJI_GRID = [
  "😀", "😃", "😄", "😁", "😅", "🤣", "😂", "🙂", "😊", "😇", "😍", "🤩",
  "😘", "😗", "😚", "😋", "😛", "😜", "🤪", "😝", "🤑", "🤗", "🤭", "🤫",
  "🤔", "🤐", "🤨", "😐", "😑", "😶", "😏", "😒", "🙄", "😬", "🤥", "😌",
  "😔", "😪", "🤤", "😴", "😷", "🤒", "🤕", "🤢", "🤮", "🥵", "🥶", "😵",
  "🤯", "🤠", "🥳", "🥸", "😎", "🤓", "🧐", "😕", "😟", "🙁", "😮", "😯",
  "😲", "😳", "🥺", "😦", "😧", "😨", "😰", "😥", "😢", "😭", "😱", "😖",
  "😣", "😞", "😓", "😩", "😫", "🥱", "😤", "😡", "😠", "🤬", "👿", "💀",
  "💩", "🤡", "👹", "👺", "👻", "👽", "🤖", "😺", "😸", "😹", "😻", "😼",
  "👍", "👎", "👌", "✌️", "🤞", "🤟", "🤘", "🤙", "👋", "🤚", "✋", "🖐",
  "👆", "👇", "👉", "👈", "🙌", "👏", "🙏", "🤝", "💪", "🦾", "🖕", "✍️",
  "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "💕", "💖",
  "🎉", "🎊", "🎂", "🔥", "⭐", "🌟", "✨", "💯", "✅", "❌", "💤", "🎵",
];

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export const EmojiPicker = memo(function EmojiPicker({
  onSelect,
  onClose,
}: EmojiPickerProps) {
  const handleSelect = useCallback(
    (emoji: string) => {
      onSelect(emoji);
      onClose();
    },
    [onSelect, onClose],
  );

  const handleBackdrop = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose],
  );

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      onClick={handleBackdrop}
    >
      <div
        className="animate-scale-in rounded-xl border border-border bg-card shadow-2xl p-3 w-[320px] max-h-[420px] flex flex-col"
      >
        {/* Quick access row */}
        <div className="flex gap-1 mb-2 pb-2 border-b border-[hsl(220,2.5%,16%)]">
          {QUICK_EMOJI.map((emoji) => (
            <button
              key={emoji}
              onClick={() => handleSelect(emoji)}
              className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-accent text-lg transition-colors"
              aria-label={`React with ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>

        {/* Emoji grid */}
        <div className="overflow-y-auto flex-1 pr-1 custom-scrollbar">
          <div className="grid grid-cols-8 gap-0.5">
            {EMOJI_GRID.map((emoji) => (
              <button
                key={emoji}
                onClick={() => handleSelect(emoji)}
                className="flex items-center justify-center w-9 h-9 rounded-lg hover:bg-accent text-lg transition-colors"
                aria-label={`React with ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
});
