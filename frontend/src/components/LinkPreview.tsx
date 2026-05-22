import { memo, useState, useEffect } from "react";
import { Globe, ExternalLink } from "lucide-react";
import { chatAPI, type LinkPreviewData } from "@/lib/api";

interface LinkPreviewProps {
  url: string;
}

/** Extracts domain from a URL string. */
function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Skeleton loading placeholder while fetching OG metadata. */
const LinkPreviewSkeleton = () => (
  <div
    className="mt-2 flex rounded-lg border border-border bg-muted/40 overflow-hidden animate-pulse max-w-sm"
    style={{ height: 80 }}
  >
    <div className="w-[100px] bg-muted/60 flex-shrink-0" />
    <div className="flex-1 p-3 flex flex-col justify-center gap-2">
      <div className="h-3.5 w-3/4 rounded bg-muted-foreground/15" />
      <div className="h-2.5 w-full rounded bg-muted-foreground/10" />
      <div className="h-2.5 w-1/3 rounded bg-muted-foreground/10" />
    </div>
  </div>
);

/** Error / unavailable state: minimal grey card with domain only. */
const LinkPreviewError = ({ domain }: { domain: string }) => (
  <a
    href={`https://${domain}`}
    target="_blank"
    rel="noopener noreferrer"
    className="mt-2 flex items-center gap-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2 max-w-sm hover:bg-muted/40 transition-colors group/err animate-fade-in"
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

export const LinkPreview = memo(function LinkPreview({ url }: LinkPreviewProps) {
  const [state, setState] = useState<PreviewState>({ status: "loading" });
  const domain = extractDomain(url);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
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
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (state.status === "loading") {
    return <LinkPreviewSkeleton domain={domain} />;
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
      className="mt-2 flex rounded-lg border border-border overflow-hidden hover:border-primary/30 hover:shadow-md transition-all duration-200 max-w-sm group/preview animate-fade-in"
      onClick={(e) => e.stopPropagation()}
    >
      {data.image && (
        <div className="w-[120px] flex-shrink-0 bg-muted/50 overflow-hidden">
          <img
            src={data.image}
            alt=""
            className="h-full w-full object-cover rounded-l-lg group-hover/preview:scale-105 transition-transform duration-300"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
      )}
      <div className="flex-1 min-w-0 p-3 flex flex-col justify-center gap-1">
        <h4 className="text-sm font-medium text-foreground line-clamp-1 group-hover/preview:text-primary/80 transition-colors">
          {data.title}
        </h4>
        {data.description && (
          <p className="text-sm text-muted-foreground/70 line-clamp-2 leading-relaxed">
            {data.description}
          </p>
        )}
        <div className="flex items-center gap-1.5 mt-0.5">
          <Globe className="h-3 w-3 text-muted-foreground/40 flex-shrink-0" />
          <span className="text-xs text-muted-foreground/50 truncate">{displayDomain}</span>
          <ExternalLink className="h-3 w-3 text-muted-foreground/30 opacity-0 group-hover/preview:opacity-100 transition-opacity ml-auto flex-shrink-0" />
        </div>
      </div>
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
  // Limit to 3 previews per message to avoid clutter
  return result.slice(0, 3);
}

/** Renders multiple link previews for URLs in a message. */
export const MessageLinkPreviews = memo(function MessageLinkPreviews({ content }: { content: string }) {
  const urls = extractURLs(content);
  if (urls.length === 0) return null;

  return (
    <>
      {urls.map((url) => (
        <LinkPreview key={url} url={url} />
      ))}
    </>
  );
});
