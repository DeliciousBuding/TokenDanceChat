import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Search, X, Loader2 } from "lucide-react";
import { chatAPI, type SearchResult } from "@/lib/api";
import { useChatStore } from "@/stores/chatStore";
import { useTranslation } from "@/i18n/context";
import { cn } from "@/lib/utils";

/** Splits an FTS5 snippet into text and highlighted segments. */
function parseSnippetParts(raw: string): Array<{ text: string; highlight: boolean }> {
  const parts: Array<{ text: string; highlight: boolean }> = [];
  const regex = /<mark>([\s\S]*?)<\/mark>/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(raw)) !== null) {
    if (match.index > lastIdx) {
      parts.push({ text: raw.slice(lastIdx, match.index), highlight: false });
    }
    parts.push({ text: match[1], highlight: true });
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < raw.length) {
    parts.push({ text: raw.slice(lastIdx), highlight: false });
  }
  return parts;
}

interface SearchBarProps {
  currentRoomID: string;
}

export function SearchBar({ currentRoomID }: SearchBarProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [noResults, setNoResults] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const currentChat = useChatStore((s) => s.currentChat);
  const messages = useChatStore((s) => s.messages);
  const username = useChatStore((s) => s.username);

  // Compute conversation message IDs for client-side filtering.
  const conversationMessageIDs = useMemo(() => {
    if (currentChat.type === "dm") {
      const partner = currentChat.username;
      return new Set(
        messages
          .filter((m) => {
            const sender = m.from || m.username;
            const recipient = m.to;
            return (sender === partner && recipient === username) ||
              (sender === username && recipient === partner);
          })
          .map((m) => m.id),
      );
    }
    if (currentChat.type === "group") {
      return new Set(
        messages
          .filter((m) => m.to === currentChat.name || (m as any).group === currentChat.name)
          .map((m) => m.id),
      );
    }
    return null; // public — use server-side room filter
  }, [currentChat, messages, username]);

  // Filter results to current conversation scope.
  const scopedResults = useMemo(() => {
    if (!conversationMessageIDs) return results;
    return results.filter((r) => conversationMessageIDs.has(r.id));
  }, [results, conversationMessageIDs]);

  // Ctrl+K to open, Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
        setQuery("");
        setResults([]);
        setError(false);
      }
      if (e.key === "Escape" && open) {
        if (query) { setQuery(""); setResults([]); }
        else setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, query]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) { setResults([]); setError(false); setNoResults(false); return; }
    setLoading(true); setError(false); setNoResults(false);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await chatAPI.searchMessages(query.trim(), currentRoomID);
        setResults(r);
        if (r.length === 0) setNoResults(true);
      } catch { setError(true); }
      finally { setLoading(false); setSelectedIndex(0); }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query, currentRoomID]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, scopedResults.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" && scopedResults.length > 0) {
      const r = scopedResults[selectedIndex];
      if (r) {
        window.dispatchEvent(new CustomEvent("tdchat:scroll-to-message", { detail: { id: r.id, content: r.content } }));
        setOpen(false); setQuery(""); setResults([]);
      }
    }
  }, [scopedResults, selectedIndex]);

  const handleClickResult = useCallback((r: SearchResult) => {
    window.dispatchEvent(new CustomEvent("tdchat:scroll-to-message", { detail: { id: r.id, content: r.content } }));
    setOpen(false); setQuery(""); setResults([]);
  }, []);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="fixed inset-x-0 top-[15%] z-50 mx-auto w-full max-w-lg px-4">
        <div className="rounded-xl border border-border bg-card shadow-2xl overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <Search className="h-4 w-4 text-muted-foreground/60 flex-shrink-0" />
            <input ref={inputRef} type="text" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={handleKeyDown}
              placeholder={t("search.placeholder")} aria-label={t("search.placeholder")} className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 outline-none" />
            {loading ? <Loader2 className="h-4 w-4 text-muted-foreground/60 animate-spin flex-shrink-0" />
            : query ? <button onClick={() => { setQuery(""); setResults([]); inputRef.current?.focus(); }} aria-label="Clear search" className="flex-shrink-0 rounded p-0.5 text-muted-foreground/40 hover:text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
            : <kbd className="hidden sm:inline-flex items-center rounded border border-border bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground/60">ESC</kbd>}
          </div>
          <div className="max-h-72 overflow-y-auto">
            {!query && <div className="px-4 py-8 text-center"><p className="text-xs text-muted-foreground/50">{t("search.typeToSearch")}</p></div>}
            {loading && <div className="flex items-center justify-center py-6"><Loader2 className="h-5 w-5 text-muted-foreground/40 animate-spin" /></div>}
            {error && !loading && query && <div className="px-4 py-8 text-center"><Search className="mx-auto h-5 w-5 text-destructive/40 mb-2" /><p className="text-xs text-destructive/60">{t("search.searchError")}</p></div>}
            {noResults && !loading && !error && query && <div className="px-4 py-8 text-center"><Search className="mx-auto h-5 w-5 text-muted-foreground/30 mb-2" /><p className="text-xs text-muted-foreground/50">{conversationMessageIDs ? t("search.notFoundInConversation") : t("search.notFound")}</p></div>}
            {scopedResults.length > 0 && scopedResults.map((r, i) => (
              <button key={r.id} onClick={() => handleClickResult(r)}
                className={cn("w-full text-left px-4 py-3 border-b border-border last:border-b-0 transition-colors",
                  i === selectedIndex ? "bg-accent" : "hover:bg-accent")}>
                <div className="flex items-center gap-2 mb-1"><span className="text-xs font-medium text-muted-foreground/70">{r.username}</span></div>
                <p className="text-xs text-muted-foreground/80 line-clamp-2">
                  {r.snippet
                    ? parseSnippetParts(r.snippet).map((part, j) =>
                        part.highlight
                          ? <mark key={j} className="bg-[oklch(71.2%_0.194_13.428_/_0.2)] text-foreground/90 rounded-sm px-0.5">{part.text}</mark>
                          : <span key={j}>{part.text}</span>
                      )
                    : r.content.substring(0, 120)
                  }
                </p>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 px-4 py-2 border-t border-border">
            <kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground/50">Ctrl+K</kbd>
            <span className="text-[10px] text-muted-foreground/50 ml-auto">{t("search.toggleSearch")}</span>
          </div>
        </div>
      </div>
    </>
  );
}
