import { useEffect, useRef, useMemo } from "react";
import { Copy, Reply, Forward, Trash2, CheckSquare } from "lucide-react";
import { useTranslation } from "@/i18n/context";
import type { ChatMessage } from "@/lib/api";

interface MessageContextMenuProps {
  message: ChatMessage;
  isOwn: boolean;
  position: { x: number; y: number };
  onClose: () => void;
  onReply: () => void;
  onCopy: () => void;
  onForward: () => void;
  onDelete: () => void;
  onSelect: () => void;
}

export function MessageContextMenu({
  message: _message,
  isOwn,
  position,
  onClose,
  onReply,
  onCopy,
  onForward,
  onDelete,
  onSelect,
}: MessageContextMenuProps) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click/touch
  useEffect(() => {
    const handler = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay adding listener to avoid immediately closing from the touch that opened
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handler);
      document.addEventListener("touchstart", handler);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Calculate position to keep menu within viewport
  const menuStyle = useMemo(() => {
    const menuWidth = 200;
    const menuHeight = isOwn ? 228 : 184; // approximate
    let { x, y } = position;
    if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 8;
    if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 8;
    if (x < 8) x = 8;
    if (y < 8) y = 8;
    return { left: x, top: y };
  }, [position, isOwn]);

  const menuItems = [
    {
      icon: Reply,
      label: t("input.replyTo"),
      onClick: onReply,
      className: "text-foreground/80",
    },
    {
      icon: Copy,
      label: t("transcript.contextCopy"),
      onClick: onCopy,
      className: "text-foreground/80",
    },
    {
      icon: Forward,
      label: t("transcript.contextForward"),
      onClick: onForward,
      className: "text-foreground/80",
    },
    ...(isOwn
      ? [
          {
            icon: Trash2,
            label: t("transcript.contextDelete"),
            onClick: onDelete,
            className: "text-destructive/80 hover:text-destructive",
          },
        ]
      : []),
    {
      icon: CheckSquare,
      label: t("transcript.contextSelect"),
      onClick: onSelect,
      className: "text-foreground/80",
    },
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[100] animate-fade-in"
        onClick={onClose}
        onTouchEnd={onClose}
        aria-hidden="true"
      />
      {/* Menu */}
      <div
        ref={menuRef}
        role="menu"
        aria-label={t("transcript.contextSelect")}
        className="fixed z-[101] min-w-[200px] rounded-xl border border-border bg-card shadow-2xl py-1.5 animate-scale-in overflow-hidden"
        style={menuStyle}
      >
        {menuItems.map((item) => (
          <button
            key={item.label}
            role="menuitem"
            onClick={item.onClick}
            className={`flex w-full items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-accent ${item.className}`}
          >
            <item.icon className="h-4 w-4 flex-shrink-0" />
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </>
  );
}
