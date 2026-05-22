import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Search, X, Loader2 } from "lucide-react";
import { chatAPI, type SearchResult } from "@/lib/api";
import { useChatStore } from "@/stores/chatStore";
import { cn } from "@/lib/utils";

function escapeHTML(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Strips <mark> tags from server snippet, escaping everything else. */
function stripMarkTags(s: string): string {
  return escapeHTML(s).replace(/&lt;\/?mark&gt;/g, (m) =>
    m === "&lt;mark&gt;" ? "<mark>" : "</mark>"
  );
}

interface SearchBarProps {
  currentRoomID: string;
}

export function SearchBar({ currentRoomID }: SearchBarProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
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
    if (!query.trim()) { setResults([]); setError(false); return; }
    setLoading(true); setError(false);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await chatAPI.searchMessages(query.trim(), currentRoomID);
        setResults(r);
        if (r.length === 0) setError(true);
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
              placeholder="Search messages..." aria-label="Search messages" className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 outline-none" />
            {loading ? <Loader2 className="h-4 w-4 text-muted-foreground/60 animate-spin flex-shrink-0" />
            : query ? <button onClick={() => { setQuery(""); setResults([]); inputRef.current?.focus(); }} aria-label="Clear search" className="flex-shrink-0 rounded p-0.5 text-muted-foreground/40 hover:text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
            : <kbd className="hidden sm:inline-flex items-center rounded border border-border bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground/60">ESC</kbd>}
          </div>
          <div className="max-h-72 overflow-y-auto">
            {!query && <div className="px-4 py-8 text-center"><p className="text-xs text-muted-foreground/50">Type to search messages</p></div>}
            {loading && <div className="flex items-center justify-center py-6"><Loader2 className="h-5 w-5 text-muted-foreground/40 animate-spin" /></div>}
            {error && !loading && query && <div className="px-4 py-8 text-center"><Search className="mx-auto h-5 w-5 text-muted-foreground/30 mb-2" /><p className="text-xs text-muted-foreground/50">{conversationMessageIDs ? "No messages in this conversation" : "No messages found"}</p></div>}
            {scopedResults.length > 0 && scopedResults.map((r, i) => (
              <button key={r.id} onClick={() => handleClickResult(r)}
                className={cn("w-full text-left px-4 py-3 border-b border-border last:border-b-0 transition-colors",
                  i === selectedIndex ? "bg-accent" : "hover:bg-accent")}>
                <div className="flex items-center gap-2 mb-1"><span className="text-xs font-medium text-muted-foreground/70">{r.username}</span></div>
                <p className="text-xs text-muted-foreground/80 line-clamp-2" dangerouslySetInnerHTML={{ __html: r.snippet ? stripMarkTags(r.snippet) : escapeHTML(r.content.substring(0, 120)) }} />
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 px-4 py-2 border-t border-border">
            <kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground/50">Ctrl+K</kbd>
            <span className="text-[10px] text-muted-foreground/50 ml-auto">toggle search</span>
          </div>
        </div>
      </div>
    </>
  );
}
