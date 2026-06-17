import { memo, useState } from "react";
import { FileText, Image, Video, Music, Archive, File, Download, ExternalLink, Eye, EyeOff } from "lucide-react";
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
      return <Image className={cls + " text-[var(--accent)]"} />;
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
          className="td-chat-card block mb-2 overflow-hidden transition-colors hover:border-[var(--accent)]/35"
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
        <div className="td-chat-card-muted mb-2 p-3">
          <audio controls className="w-full h-10" preload="metadata">
            <source src={fileUrl} type={mimeType || "audio/mpeg"} />
            <track kind="captions" />
          </audio>
        </div>
      )}

      {/* Video inline player */}
      {category === "video" && (
        <div className="td-chat-card mb-2 overflow-hidden bg-black">
          <video
            controls
            className="w-full max-h-64 object-contain"
            preload="metadata"
            poster=""
          >
            <source src={fileUrl} type={mimeType || "video/mp4"} />
          </video>
        </div>
      )}

      {/* PDF inline preview */}
      {category === "pdf" && (
        <PdfPreview fileUrl={fileUrl} fileName={fileName} />
      )}

      {/* File card */}
      <a
        href={fileUrl}
        download={fileName}
        target="_blank"
        rel="noopener noreferrer"
        className="td-chat-card group/file flex items-center gap-3 px-3 py-2.5 transition-all duration-200 hover:border-[var(--accent)]/35"
        onClick={(e) => e.stopPropagation()}
        title={t("file.downloadFile") || "Download file"}
      >
        <FileIconComponent category={category} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground/80 truncate group-hover/file:text-[var(--accent)] transition-colors">
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

// ── PDF inline preview (toggleable iframe) ──

function PdfPreview({ fileUrl, fileName }: { fileUrl: string; fileName: string }) {
  const [showPreview, setShowPreview] = useState(false);

  return (
    <div className="mb-2">
      {!showPreview ? (
        <button
          onClick={() => setShowPreview(true)}
          className="td-chat-list-row flex items-center gap-2 px-3 py-2 transition-colors"
        >
          <Eye className="h-4 w-4 text-red-500" />
          <span className="text-sm text-muted-foreground">Preview PDF</span>
        </button>
      ) : (
        <div className="td-chat-card overflow-hidden">
          <div className="td-chat-section flex items-center justify-between border-b px-3 py-1.5">
            <span className="text-xs text-muted-foreground truncate">{fileName}</span>
            <button
              onClick={() => setShowPreview(false)}
              className="p-0.5 rounded text-muted-foreground/50 hover:text-foreground transition-colors"
            >
              <EyeOff className="h-3.5 w-3.5" />
            </button>
          </div>
          <iframe
            src={fileUrl}
            className="w-full h-80 bg-white"
            title={fileName}
            sandbox="allow-scripts"
          />
        </div>
      )}
    </div>
  );
}
