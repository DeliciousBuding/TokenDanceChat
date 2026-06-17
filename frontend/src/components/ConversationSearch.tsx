import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Search, ChevronUp, ChevronDown, X } from "lucide-react";
import { useChatStore } from "@/stores/chatStore";
import { useTranslation } from "@/i18n/context";
import { cn, formatTime } from "@/lib/utils";
import type { ChatMessage } from "@/lib/api";

interface ConversationSearchProps {
  open: boolean;
  onClose: () => void;
  onHighlightChange: (term: string) => void;
}

const MAX_RESULTS = 20;

/** Render a content snippet with the first match of query highlighted. */
function renderSnippet(content: string, query: string): React.ReactNode {
  const lower = content.toLowerCase();
  const q = query.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx === -1) return content.slice(0, 120);
  const start = Math.max(0, idx - 40);
  const end = Math.min(content.length, idx + query.length + 40);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < content.length ? "..." : "";
  return (
    <>
      {prefix}
      {content.slice(start, idx)}
      <mark className="bg-primary/20 text-foreground/90 rounded-sm px-0.5">
        {content.slice(idx, idx + query.length)}
      </mark>
      {content.slice(idx + query.length, end)}
      {suffix}
    </>
  );
}

export function ConversationSearch({ open, onClose, onHighlightChange }: ConversationSearchProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const messages = useChatStore((s) => s.messages);

  const conversationMessages = messages;

  // Client-side filtering.
  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    const matched: ChatMessage[] = [];
    for (const m of conversationMessages) {
      if (m.username === "system" || m.deleted) continue;
      if (m.content.toLowerCase().includes(q) || m.username.toLowerCase().includes(q)) {
        matched.push(m);
        if (matched.length >= MAX_RESULTS) break;
      }
    }
    return matched;
  }, [query, conversationMessages]);

  // Reset selection when results change; update parent highlight term.
  useEffect(() => { setSelectedIndex(0); }, [results.length]);
  useEffect(() => {
    onHighlightChange(open && query.trim() ? query.trim() : "");
  }, [open, query, onHighlightChange]);

  // Focus input on open; reset on close.
  useEffect(() => {
    if (open) { setTimeout(() => inputRef.current?.focus(), 50); }
    else { setQuery(""); setSelectedIndex(0); }
  }, [open]);

  // Listen for external focus request (e.g., double CTRL+F when already open).
  useEffect(() => {
    const handler = () => { inputRef.current?.focus(); inputRef.current?.select(); };
    window.addEventListener("tdchat:focus-conversation-search", handler);
    return () => window.removeEventListener("tdchat:focus-conversation-search", handler);
  }, []);

  const scrollToMessage = useCallback((messageId: string) => {
    window.dispatchEvent(new CustomEvent("tdchat:scroll-to-message", { detail: { id: messageId } }));
    onClose();
  }, [onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIndex((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIndex((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" && results.length > 0) { const r = results[selectedIndex]; if (r) scrollToMessage(r.id); }
    else if (e.key === "Escape") { onClose(); }
  }, [results, selectedIndex, scrollToMessage, onClose]);

  if (!open) return null;

  const trimmedQuery = query.trim();

  return (
    <div className="td-chat-statusbar border-b px-4 py-2 animate-slide-up">
      <div className="flex items-center gap-2 max-w-2xl mx-auto">
        <Search className="h-4 w-4 text-muted-foreground/60 flex-shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t("search.inConversation")}
          aria-label={t("search.inConversation")}
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 outline-none"
        />
        {trimmedQuery && (
          <span className="text-[11px] text-muted-foreground/60 flex-shrink-0 tabular-nums whitespace-nowrap">
            {results.length > 0
              ? t("search.matchCount", { n: results.length })
              : t("search.noMatchesInConversation")}
          </span>
        )}
        <button
          onClick={() => setSelectedIndex((i) => Math.max(i - 1, 0))}
          disabled={results.length === 0}
          aria-label={t("a11y.prevResult")}
          className="flex-shrink-0 rounded p-0.5 text-muted-foreground/50 hover:text-muted-foreground disabled:opacity-25"
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => setSelectedIndex((i) => Math.min(i + 1, results.length - 1))}
          disabled={results.length === 0}
          aria-label={t("a11y.nextResult")}
          className="flex-shrink-0 rounded p-0.5 text-muted-foreground/50 hover:text-muted-foreground disabled:opacity-25"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onClose}
          aria-label={t("a11y.closeSearch")}
          className="flex-shrink-0 rounded p-0.5 text-muted-foreground/50 hover:text-muted-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {trimmedQuery && results.length > 0 && (
        <div className="mt-2 max-h-60 overflow-y-auto border-t border-[var(--chat-stream-card-border)]">
          {results.map((r, i) => (
            <button
              key={r.id}
              onClick={() => scrollToMessage(r.id)}
              className={cn(
                "td-chat-list-row w-full text-left px-2 py-2",
                i === selectedIndex && "bg-[var(--bg-hover)]",
              )}
            >
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs font-medium text-muted-foreground/70">{r.username}</span>
                <span className="text-[10px] text-muted-foreground/40">{formatTime(r.timestamp, t)}</span>
              </div>
              <p className="text-xs text-muted-foreground/80 line-clamp-2">
                {renderSnippet(r.content, trimmedQuery)}
              </p>
            </button>
          ))}
        </div>
      )}

      {trimmedQuery && results.length === 0 && (
        <div className="py-4 text-center text-xs text-muted-foreground/50">
          {t("search.noMatchesInConversation")}
        </div>
      )}
    </div>
  );
}
