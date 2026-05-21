import { memo, useState, useEffect } from "react";
import { Globe } from "lucide-react";
import { chatAPI, type LinkPreviewData } from "@/lib/api";

interface LinkPreviewProps {
  url: string;
}

/** Extracts domain from a URL string. */
function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export const LinkPreview = memo(function LinkPreview({ url }: LinkPreviewProps) {
  const [data, setData] = useState<LinkPreviewData | null>(null);
  const [error, setError] = useState(false);
  const domain = extractDomain(url);

  useEffect(() => {
    let cancelled = false;
    chatAPI.fetchLinkPreview(url).then((result) => {
      if (!cancelled) {
        if (result) {
          setData(result);
        } else {
          setError(true);
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (error || !data) return null;
  if (!data.title && !data.description) return null;

  return (
    <div className="mt-2 border border-border rounded-lg overflow-hidden bg-[hsl(220,2.5%,12%)] max-w-sm">
      {data.image && (
        <div className="w-full h-32 overflow-hidden bg-[hsl(220,2.5%,8%)]">
          <img
            src={data.image}
            alt=""
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
      )}
      <div className="p-3">
        <div className="flex items-center gap-1.5 mb-1">
          <Globe className="h-3 w-3 text-muted-foreground/50" />
          <span className="text-[10px] text-muted-foreground/50 truncate">{domain}</span>
        </div>
        {data.title && (
          <h4 className="text-sm font-medium text-foreground/80 line-clamp-2 mb-0.5">
            {data.title}
          </h4>
        )}
        {data.description && (
          <p className="text-xs text-muted-foreground/60 line-clamp-2">
            {data.description}
          </p>
        )}
      </div>
    </div>
  );
});
