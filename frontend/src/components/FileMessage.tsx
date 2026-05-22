import { memo } from "react";
import { FileText, Image, Video, Music, Archive, File, Download, ExternalLink } from "lucide-react";
import { useTranslation } from "@/i18n/context";

interface FileMessageProps {
  fileName: string;
  fileSize: number; // bytes
  fileUrl: string;
  mimeType?: string;
}

/** Human-readable file size (KB / MB). */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Truncate filename to max N chars, preserving extension. */
function truncateFileName(name: string, maxLen = 30): string {
  if (name.length <= maxLen) return name;
  const dotIdx = name.lastIndexOf(".");
  if (dotIdx <= 0) return name.slice(0, maxLen - 3) + "...";
  const ext = name.slice(dotIdx);
  const baseMax = maxLen - ext.length - 3;
  if (baseMax <= 0) return name;
  return name.slice(0, baseMax) + "..." + ext;
}

/** Detect file type category from extension or mimeType. */
function getFileCategory(
  fileName: string,
  mimeType?: string,
): "pdf" | "image" | "video" | "audio" | "archive" | "default" {
  const name = fileName.toLowerCase();
  if (name.endsWith(".pdf")) return "pdf";
  if (/\.(png|jpg|jpeg|gif|webp|svg|bmp)$/i.test(name)) return "image";
  if (/\.(mp4|webm|ogg|avi|mov|mkv)$/i.test(name)) return "video";
  if (/\.(mp3|wav|m4a|flac|aac)$/i.test(name)) return "audio";
  if (/\.(zip|rar|7z|tar|gz)$/i.test(name)) return "archive";

  if (mimeType) {
    const mt = mimeType.toLowerCase();
    if (mt.startsWith("image/")) return "image";
    if (mt.startsWith("video/")) return "video";
    if (mt.startsWith("audio/")) return "audio";
    if (mt === "application/pdf") return "pdf";
    if (/zip|rar|7z|tar|gzip/.test(mt)) return "archive";
  }
  return "default";
}

function FileIconComponent({ category }: { category: ReturnType<typeof getFileCategory> }) {
  const cls = "h-6 w-6 flex-shrink-0";
  switch (category) {
    case "pdf":
      return <FileText className={cls + " text-red-500 dark:text-red-400"} />;
    case "image":
      return <Image className={cls + " text-blue-500 dark:text-blue-400"} />;
    case "video":
      return <Video className={cls + " text-purple-500 dark:text-purple-400"} />;
    case "audio":
      return <Music className={cls + " text-green-500 dark:text-green-400"} />;
    case "archive":
      return <Archive className={cls + " text-yellow-500 dark:text-yellow-400"} />;
    default:
      return <File className={cls + " text-gray-400 dark:text-gray-500"} />;
  }
}

export const FileMessage = memo(function FileMessage({
  fileName,
  fileSize,
  fileUrl,
  mimeType,
}: FileMessageProps) {
  const { t } = useTranslation();
  const category = getFileCategory(fileName, mimeType);
  const displaySize = formatFileSize(fileSize);
  const displayName = truncateFileName(fileName);

  return (
    <div className="mt-2 max-w-sm">
      {/* Image preview thumbnail */}
      {category === "image" && (
        <a
          href={fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block mb-2 rounded-lg overflow-hidden border border-border hover:border-primary/30 transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          <img
            src={fileUrl}
            alt={fileName}
            className="w-full max-h-48 object-cover hover:brightness-90 transition-all duration-200"
            loading="lazy"
          />
        </a>
      )}

      {/* Audio player */}
      {category === "audio" && (
        <div className="mb-2 rounded-lg bg-muted/30 border border-border p-3">
          <audio controls className="w-full h-10" preload="metadata">
            <source src={fileUrl} type={mimeType || "audio/mpeg"} />
            <track kind="captions" />
          </audio>
        </div>
      )}

      {/* File card */}
      <a
        href={fileUrl}
        download={fileName}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 rounded-lg bg-muted/30 hover:bg-muted/50 border border-border hover:border-primary/30 px-3 py-2.5 transition-all duration-200 group/file"
        onClick={(e) => e.stopPropagation()}
        title={t("file.downloadFile") || "Download file"}
      >
        <FileIconComponent category={category} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground/80 truncate group-hover/file:text-primary/80 transition-colors">
            {displayName}
          </p>
          <p className="text-xs text-muted-foreground/50 mt-0.5">
            {t("file.fileSize", { size: displaySize }) || displaySize}
          </p>
        </div>
        <Download className="h-4 w-4 text-muted-foreground/40 opacity-0 group-hover/file:opacity-100 transition-all flex-shrink-0" />
        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/30 opacity-0 group-hover/file:opacity-100 transition-all flex-shrink-0 -ml-1" />
      </a>
    </div>
  );
});

export { formatFileSize, truncateFileName, getFileCategory };
