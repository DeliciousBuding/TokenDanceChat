import { memo, useState, useEffect, useRef } from "react";
import { Globe, ExternalLink } from "lucide-react";
import { chatAPI, type LinkPreviewData } from "@/lib/api";

interface LinkPreviewProps {
  url: string;
  /** Timestamp of the message containing this URL (ms). Used to skip old messages. */
  messageTimestamp?: number;
}

/** Extracts domain from a URL string. */
function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Compact skeleton loading placeholder. */
const LinkPreviewSkeleton = () => (
  <div
    className="mt-1.5 flex rounded-lg border border-border bg-card/50 overflow-hidden animate-pulse max-w-[320px] p-2 gap-2 items-center"
  >
    <div className="w-10 h-10 rounded bg-muted/60 flex-shrink-0" />
    <div className="flex-1 min-w-0 flex flex-col gap-1.5">
      <div className="h-3.5 w-3/4 rounded bg-muted-foreground/15" />
      <div className="h-2.5 w-full rounded bg-muted-foreground/10" />
      <div className="h-2 w-1/3 rounded bg-muted-foreground/10" />
    </div>
  </div>
);

/** Error / unavailable state: minimal grey card with domain only. */
const LinkPreviewError = ({ domain }: { domain: string }) => (
  <a
    href={`https://${domain}`}
    target="_blank"
    rel="noopener noreferrer"
    className="mt-1.5 flex items-center gap-2 rounded-lg border border-border/50 bg-card/50 px-3 py-2 max-w-[320px] hover:bg-muted/40 transition-colors group/err"
    onClick={(e) => e.stopPropagation()}
  >
    <Globe className="h-3.5 w-3.5 text-muted-foreground/40 flex-shrink-0" />
    <span className="text-xs text-muted-foreground/50 truncate">{domain}</span>
    <ExternalLink className="h-3 w-3 text-muted-foreground/30 opacity-0 group-hover/err:opacity-100 transition-opacity ml-auto flex-shrink-0" />
  </a>
);

type PreviewState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "empty" }
  | { status: "success"; data: LinkPreviewData };

/** Don't fetch previews for messages older than 5 minutes. */
const MAX_MESSAGE_AGE_MS = 5 * 60 * 1000;

export const LinkPreview = memo(function LinkPreview({ url, messageTimestamp }: LinkPreviewProps) {
  const [state, setState] = useState<PreviewState>({ status: "loading" });
  const domain = extractDomain(url);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Skip fetching for messages older than 5 minutes.
  const isTooOld =
    messageTimestamp != null && Date.now() - messageTimestamp > MAX_MESSAGE_AGE_MS;

  useEffect(() => {
    let cancelled = false;

    // Debounce: wait 500ms before fetching. If the component unmounts
    // (message scrolls out of view), the fetch is cancelled.
    if (isTooOld) {
      setState({ status: "empty" });
      return;
    }

    setState({ status: "loading" });
    debounceRef.current = setTimeout(() => {
      if (cancelled) return;
      chatAPI.fetchLinkPreview(url).then((result) => {
        if (cancelled) return;
        if (!result) {
          setState({ status: "error" });
        } else if (!result.title && !result.description) {
          setState({ status: "empty" });
        } else {
          setState({ status: "success", data: result });
        }
      }).catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    }, 500);

    return () => {
      cancelled = true;
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [url, isTooOld]);

  if (isTooOld) {
    return null;
  }

  if (state.status === "loading") {
    return <LinkPreviewSkeleton />;
  }

  if (state.status === "error") {
    return <LinkPreviewError domain={domain} />;
  }

  if (state.status === "empty") {
    return null;
  }

  const { data } = state;
  const displayDomain = data.site_name || domain;

  return (
    <a
      href={data.url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1.5 flex rounded-lg border border-border bg-card/50 overflow-hidden hover:border-primary/30 hover:shadow-sm transition-all duration-200 max-w-[320px] group/preview p-2 gap-2.5 items-center"
      onClick={(e) => e.stopPropagation()}
    >
      {data.image ? (
        <div className="w-10 h-10 rounded flex-shrink-0 bg-muted/50 overflow-hidden">
          <img
            src={data.image}
            alt=""
            className="h-full w-full object-cover rounded group-hover/preview:scale-105 transition-transform duration-300"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
      ) : (
        <div className="w-10 h-10 rounded flex-shrink-0 bg-muted/30 flex items-center justify-center">
          <Globe className="h-4 w-4 text-muted-foreground/30" />
        </div>
      )}
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <h4 className="text-sm font-medium text-foreground line-clamp-1 group-hover/preview:text-primary/80 transition-colors">
          {data.title}
        </h4>
        {data.description && (
          <p className="text-xs text-muted-foreground line-clamp-1">
            {data.description}
          </p>
        )}
        <span className="text-[10px] text-muted-foreground/60 truncate">{displayDomain}</span>
      </div>
      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/30 opacity-0 group-hover/preview:opacity-100 transition-opacity flex-shrink-0" />
    </a>
  );
});

/**
 * Detects all HTTP(S) URLs in a text string and returns them as unique entries.
 * Filters out URLs that end with image/audio extensions (those are handled separately).
 */
const IMAGE_AUDIO_EXT_RE = /\.(png|jpg|jpeg|gif|webp|webm|ogg|mp3|wav|m4a)(\?.*)?$/i;

export function extractURLs(text: string): string[] {
  const regex = /https?:\/\/[^\s)\]]+/g;
  const matches = text.match(regex);
  if (!matches) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const url of matches) {
    // Clean trailing punctuation
    const cleaned = url.replace(/[.,;:!?]+$/, "");
    if (seen.has(cleaned)) continue;
    if (IMAGE_AUDIO_EXT_RE.test(cleaned)) continue;
    // Block internal/relative URLs
    try {
      const parsed = new URL(cleaned);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
    } catch {
      continue;
    }
    seen.add(cleaned);
    result.push(cleaned);
  }
  // Only return the first URL to avoid cluttering the message with multiple previews.
  return result.slice(0, 1);
}

/** Renders a link preview for the first URL in a message. */
export const MessageLinkPreviews = memo(function MessageLinkPreviews({
  content,
  messageTimestamp,
}: {
  content: string;
  messageTimestamp?: number;
}) {
  const urls = extractURLs(content);
  if (urls.length === 0) return null;

  return (
    <>
      {urls.map((url) => (
        <LinkPreview key={url} url={url} messageTimestamp={messageTimestamp} />
      ))}
    </>
  );
});
