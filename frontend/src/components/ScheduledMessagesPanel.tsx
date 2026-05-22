import { useState, useCallback, useEffect, useRef } from "react";
import { ListTodo, X, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/i18n/context";
import { useChatStore } from "@/stores/chatStore";
import { chatAPI } from "@/lib/api";

interface ScheduledMessagesPanelProps {
  roomId: string;
}

export function ScheduledMessagesPanel({ roomId }: ScheduledMessagesPanelProps) {
  const { t } = useTranslation();
  const scheduledMessages = useChatStore((s) => s.scheduledMessages);
  const currentChat = useChatStore((s) => s.currentChat);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Request scheduled messages on mount
  useEffect(() => {
    chatAPI.sendScheduledMessagesList();
  }, []);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handleCancel = useCallback((id: string) => {
    chatAPI.sendCancelScheduledMessage(id);
  }, []);

  // Filter scheduled messages relevant to current conversation
  const filteredMessages = scheduledMessages.filter((sm) => {
    if (currentChat.type === "dm") {
      return sm.to_user === currentChat.username || (sm.username === currentChat.username && sm.to_user !== "");
    }
    if (currentChat.type === "group") {
      return sm.group_name === currentChat.name;
    }
    // Public chat - filter by roomId
    return sm.to_user === "" && sm.group_name === "" && (sm.room_id === roomId || sm.room_id === "");
  });

  const formatSendTime = (sendAt: number): string => {
    const d = new Date(sendAt);
    const now = new Date();
    const isToday =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow =
      d.getFullYear() === tomorrow.getFullYear() &&
      d.getMonth() === tomorrow.getMonth() &&
      d.getDate() === tomorrow.getDate();

    const time = d.toLocaleTimeString(
      navigator.language.startsWith("zh") ? "zh-CN" : "en-US",
      { hour: "2-digit", minute: "2-digit" },
    );

    if (isToday) return `${t("schedule.today")} ${time}`;
    if (isTomorrow) return `${t("schedule.tomorrow")} ${time}`;

    const date = d.toLocaleDateString(
      navigator.language.startsWith("zh") ? "zh-CN" : "en-US",
      { month: "short", day: "numeric" },
    );
    return `${date} ${time}`;
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => { setOpen((prev) => !prev); if (!open) chatAPI.sendScheduledMessagesList(); }}
        aria-label={t("schedule.scheduledMessages")}
        className={cn(
          "flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg px-3 text-xs transition-colors",
          "text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted",
          filteredMessages.length > 0 && "text-primary/70 hover:text-primary",
        )}
      >
        <ListTodo className="h-3.5 w-3.5" />
        {filteredMessages.length > 0 && (
          <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary px-1">
            {filteredMessages.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 w-72 overflow-hidden rounded-xl border border-border bg-card shadow-xl animate-scale-in">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
            <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Clock className="h-3 w-3 text-muted-foreground/70" />
              {t("schedule.scheduledMessages")}
            </h3>
            <button
              onClick={() => setOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground/50 hover:text-muted-foreground transition-colors"
              aria-label={t("friend.dismiss")}
            >
              <X className="h-3 w-3" />
            </button>
          </div>

          {/* Messages list */}
          <div className="max-h-64 overflow-y-auto scrollbar-thin">
            {filteredMessages.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <Clock className="h-5 w-5 mx-auto mb-2 text-muted-foreground/20" />
                <p className="text-xs text-muted-foreground/40">
                  {t("schedule.noScheduled")}
                </p>
              </div>
            ) : (
              filteredMessages.map((sm) => (
                <div
                  key={sm.id}
                  className="flex items-start gap-2.5 px-4 py-2.5 border-b border-border/30 last:border-b-0 hover:bg-accent/30 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-foreground/80 truncate">
                      {sm.content}
                    </p>
                    <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                      {formatSendTime(sm.send_at)}
                    </p>
                  </div>
                  <button
                    onClick={() => handleCancel(sm.id)}
                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-colors"
                    aria-label={t("schedule.cancelSchedule")}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
