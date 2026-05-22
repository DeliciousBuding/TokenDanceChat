import { useRef, useEffect, useState, useCallback, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { MessageBubble } from "./MessageBubble";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/i18n/context";
import { useChatStore } from "@/stores/chatStore";
import type { ChatMessage } from "@/lib/api";

interface ThreadPanelProps {
  parentMessage: ChatMessage | null;
  threadMessages: ChatMessage[];
  onClose: () => void;
  onSendReply: (content: string) => void;
}

export function ThreadPanel({
  parentMessage,
  threadMessages,
  onClose,
  onSendReply,
}: ThreadPanelProps) {
  const { t } = useTranslation();
  const { username } = useChatStore();
  const [replyContent, setReplyContent] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (parentMessage) {
      requestAnimationFrame(() => setIsVisible(true));
    } else {
      setIsVisible(false);
    }
  }, [parentMessage]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [threadMessages]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const trimmed = replyContent.trim();
        if (trimmed) {
          onSendReply(trimmed);
          setReplyContent("");
        }
      }
      if (e.key === "Escape") {
        onClose();
      }
    },
    [replyContent, onSendReply, onClose],
  );

  const handleSend = useCallback(() => {
    const trimmed = replyContent.trim();
    if (trimmed) {
      onSendReply(trimmed);
      setReplyContent("");
    }
  }, [replyContent, onSendReply]);

  const handleClose = useCallback(() => {
    setIsVisible(false);
    setTimeout(onClose, 200);
  }, [onClose]);

  if (!parentMessage) return null;

  const replyCount = threadMessages.length;
  const countText = t("thread.replyCount", { count: replyCount.toString() });

  return (
    <>
      {/* Backdrop overlay */}
      <div
        className={cn(
          "fixed inset-0 z-30 bg-black/30 backdrop-blur-sm transition-opacity duration-200",
          isVisible ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Slide-in panel */}
      <div
        className={cn(
          "fixed bottom-0 right-0 top-0 z-40 flex w-full max-w-md flex-col border-l border-border bg-background shadow-2xl transition-transform duration-300 ease-in-out",
          "md:static md:z-0 md:shadow-none",
          isVisible ? "translate-x-0" : "translate-x-full",
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-foreground truncate">
              {t("thread.replies")}
            </h2>
            <p className="text-xs text-muted-foreground">{countText}</p>
          </div>
          <button
            onClick={handleClose}
            aria-label={t("thread.close")}
            className="ml-2 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Parent message */}
        <div className="border-b border-border/50 bg-muted/30 px-4 py-3">
          <MessageBubble
            message={parentMessage}
            isOwn={parentMessage.username === username}
            isGrouped={false}
          />
        </div>

        {/* Thread replies */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
          {threadMessages.length === 0 && (
            <p className="text-center text-xs text-muted-foreground py-8">
              {t("thread.replyPlaceholder")}
            </p>
          )}
          {threadMessages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              isOwn={msg.username === username}
              isGrouped={false}
            />
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Reply input */}
        <div className="border-t border-border p-4 pb-safe">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t("thread.replyPlaceholder")}
              rows={2}
              className="block min-h-[40px] max-h-[120px] w-full resize-none rounded-xl border border-border bg-card px-3 py-2 text-sm leading-5 text-foreground placeholder:text-muted-foreground/60 outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none"
              aria-label={t("thread.replyPlaceholder")}
            />
            <button
              onClick={handleSend}
              disabled={!replyContent.trim()}
              aria-label={t("thread.replyPlaceholder")}
              className="flex-shrink-0 rounded-xl bg-primary p-2 text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
