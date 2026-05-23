import { memo, useCallback, useState, useEffect, useRef, useMemo } from "react";
import { Search, X } from "lucide-react";
import { useTranslation } from "@/i18n/context";

interface GiphyItem {
  id: string;
  url: string;
  preview_url: string;
  title: string;
}

interface GiphyResponse {
  data: GiphyItem[];
  pagination: { total_count: number; count: number; offset: number };
}

type TabType = "gif" | "sticker";

interface GifPickerProps {
  onSelect: (markdown: string) => void;
  onClose: () => void;
}

const DEBOUNCE_MS = 300;

async function fetchGiphy(endpoint: string, params: Record<string, string>): Promise<GiphyItem[]> {
  const qs = new URLSearchParams(params);
  const resp = await fetch(`/api/giphy/${endpoint}?${qs}`);
  if (!resp.ok) return [];
  const json: GiphyResponse = await resp.json();
  return json.data ?? [];
}

function SkeletonGrid({ columns }: { columns: number }) {
  return (
    <div
      className="grid gap-1.5"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: columns * 3 }).map((_, i) => (
        <div
          key={i}
          className="aspect-square rounded-lg bg-muted animate-pulse"
          style={{ animationDelay: `${i * 60}ms` }}
        />
      ))}
    </div>
  );
}

export const GifPicker = memo(function GifPicker({
  onSelect,
  onClose,
}: GifPickerProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabType>("gif");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<GiphyItem[]>([]);
  const [loading, setLoading] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<number>(0);

  // Focus search on mount.
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Close on Escape.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Fetch data: trending when search is empty, search otherwise.
  useEffect(() => {
    clearTimeout(debounceRef.current);

    const load = async () => {
      setLoading(true);
      const queryType = activeTab === "sticker" ? "sticker" : "gif";
      try {
        if (search.trim()) {
          const results = await fetchGiphy("search", {
            q: search.trim(),
            limit: "24",
            type: queryType,
          });
          setItems(results);
        } else {
          const results = await fetchGiphy("trending", {
            limit: "24",
            type: queryType,
          });
          setItems(results);
        }
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    };

    debounceRef.current = setTimeout(load, search.trim() ? DEBOUNCE_MS : 0);
    return () => clearTimeout(debounceRef.current);
  }, [search, activeTab]);

  const handleSelect = useCallback(
    (item: GiphyItem) => {
      const prefix = activeTab === "sticker" ? "![sticker]" : "![gif]";
      const markdown = `${prefix}(${item.url})`;
      onSelect(markdown);
      onClose();
    },
    [activeTab, onSelect, onClose],
  );

  // Compute grid columns: 3 on mobile, 4 on desktop.
  const gridCols = useMemo(() => {
    if (typeof window === "undefined") return 3;
    return window.innerWidth >= 640 ? 4 : 3;
  }, []);

  const fallbackGridCols = 3;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="animate-slide-up sm:animate-scale-in w-full sm:w-[400px] max-h-[520px] rounded-t-2xl sm:rounded-xl border border-border bg-card shadow-2xl flex flex-col">
        {/* Header: search + close */}
        <div className="flex items-center gap-2 px-3 pt-3 pb-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("gif.searchGifs")}
              aria-label={t("gif.searchGifs")}
              className="w-full rounded-lg border border-border bg-background pl-8 pr-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none"
            />
          </div>
          <button
            onClick={onClose}
            aria-label={t("a11y.close")}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors flex-shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs: GIF | Stickers */}
        <div className="flex gap-0.5 px-3 pb-2 border-b border-border">
          <button
            onClick={() => setActiveTab("gif")}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              activeTab === "gif"
                ? "bg-accent text-foreground"
                : "text-muted-foreground/60 hover:text-muted-foreground"
            }`}
          >
            {t("gif.gifs")}
          </button>
          <button
            onClick={() => setActiveTab("sticker")}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              activeTab === "sticker"
                ? "bg-accent text-foreground"
                : "text-muted-foreground/60 hover:text-muted-foreground"
            }`}
          >
            {t("gif.stickers")}
          </button>
          {!search.trim() && (
            <span className="ml-auto text-[10px] text-muted-foreground/50 self-center">
              {t("gif.trending")}
            </span>
          )}
        </div>

        {/* Grid */}
        <div className="overflow-y-auto flex-1 p-3 custom-scrollbar">
          {loading ? (
            <SkeletonGrid columns={gridCols || fallbackGridCols} />
          ) : items.length > 0 ? (
            <div
              className="grid gap-1.5"
              style={{ gridTemplateColumns: `repeat(${gridCols || fallbackGridCols}, minmax(0, 1fr))` }}
            >
              {items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleSelect(item)}
                  className="aspect-square rounded-lg overflow-hidden bg-muted hover:ring-2 hover:ring-primary/50 focus-visible:ring-2 focus-visible:ring-primary/50 transition-all cursor-pointer group relative"
                  aria-label={item.title || "GIF"}
                >
                  <img
                    src={item.preview_url}
                    alt={item.title || ""}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <Search className="h-6 w-6 text-muted-foreground/30" />
              <span className="text-xs text-muted-foreground/50">
                {t("gif.noResults")}
              </span>
            </div>
          )}
        </div>

        {/* Powered by GIPHY */}
        <div className="border-t border-border px-3 py-2 flex items-center justify-center">
          <span className="text-[10px] text-muted-foreground/40">
            {t("gif.poweredBy")}
          </span>
        </div>
      </div>
    </div>
  );
});
