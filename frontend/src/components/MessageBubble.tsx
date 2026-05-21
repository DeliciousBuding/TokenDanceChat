import { memo, useMemo, useCallback, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Copy, Check, Forward, Lightbulb } from "lucide-react";
import { cn, formatTime } from "@/lib/utils";
import type { ChatMessage } from "@/lib/api";

interface MessageBubbleProps {
  message: ChatMessage;
  isOwn: boolean;
  /** Current user's username, used for self-mention highlighting. */
  currentUsername?: string;
  /** Hide avatar (for grouped messages after the first) */
  hideAvatar?: boolean;
  /** Hide username header (for grouped messages after the first) */
  hideUsername?: boolean;
  /** Show timestamp on the bubble (only for last in group or solo) */
  forceShowTimestamp?: boolean;
  /** Whether this message is part of a group (adjusts spacing) */
  isGrouped?: boolean;
  /** Callback for forward action */
  onForward?: (message: ChatMessage) => void;
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

function avatarGradient(username: string): string {
  const baseHue = hashString(username) % 360;
  const hue1 = baseHue;
  const hue2 = (baseHue + 45) % 360;
  return `linear-gradient(135deg, oklch(65% 0.16 ${hue1}), oklch(58% 0.14 ${hue2}))`;
}

function usernameHue(username: string): number {
  return hashString(username) % 360;
}

/** Simple code block renderer with syntax highlighting and copy button */
const CodeBlock = memo(function CodeBlock({
  language,
  code,
}: {
  language: string;
  code: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may not be available.
    }
  }, [code]);

  return (
    <div className="relative group/code my-2 rounded-lg overflow-hidden border border-[hsl(220,2.5%,23.5%)]">
      {/* Header bar */}
      <div className="flex items-center justify-between bg-[hsl(220,2.5%,12%)] px-3 py-1.5 border-b border-[hsl(220,2.5%,18%)]">
        <span className="text-[10px] text-muted-foreground/60 font-mono uppercase tracking-wider">
          {language || "code"}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground/50 hover:text-foreground hover:bg-[hsl(220,2.5%,18%)] opacity-0 group-hover/code:opacity-100 transition-opacity"
          aria-label="Copy code"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      {/* Code content */}
      <pre className="!bg-[hsl(220,2.5%,10%)] !p-3 !m-0 overflow-x-auto text-[0.8125rem] leading-relaxed">
        <code className={`language-${language || ""}`}>{code}</code>
      </pre>
    </div>
  );
});

/** Helper: extract code blocks from plain text and render with highlighting */
function parseContentForCodeBlocks(
  content: string,
): Array<{ type: "text"; value: string } | { type: "code"; language: string; code: string }> {
  const parts: Array<
    { type: "text"; value: string } | { type: "code"; language: string; code: string }
  > = [];
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", value: content.slice(lastIndex, match.index) });
    }
    parts.push({
      type: "code",
      language: match[1] || "",
      code: match[2].trimEnd(),
    });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    parts.push({ type: "text", value: content.slice(lastIndex) });
  }
  return parts;
}

export const MessageBubble = memo(function MessageBubble({
  message,
  isOwn,
  currentUsername,
  hideAvatar = false,
  hideUsername = false,
  forceShowTimestamp = false,
  isGrouped = false,
  onForward,
}: MessageBubbleProps) {
  const gradient = useMemo(() => avatarGradient(message.username), [message.username]);
  const hue = useMemo(() => usernameHue(message.username), [message.username]);
  const nameColor = `oklch(72% 0.16 ${hue})`;
  const bubbleBg = `oklch(72% 0.16 ${hue} / 0.10)`;
  const bubbleBorder = `oklch(72% 0.16 ${hue} / 0.18)`;

  // Parse content for code blocks
  const contentParts = useMemo(
    () => parseContentForCodeBlocks(message.content),
    [message.content],
  );

  // Parse @mentions and render with highlighting.
  const mentionContent = useMemo(() => {
    const content = message.content;
    const mentionRegex = /@(\w+)/g;
    const parts: (
      | { type: "text"; value: string }
      | { type: "mention"; username: string }
    )[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = mentionRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: "text", value: content.slice(lastIndex, match.index) });
      }
      parts.push({ type: "mention", username: match[1] });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < content.length) {
      parts.push({ type: "text", value: content.slice(lastIndex) });
    }

    if (parts.length === 0) {
      // No mentions, check for code blocks.
      const codeParts = parseContentForCodeBlocks(content);
      if (codeParts.length === 1 && codeParts[0].type === "text") {
        // No code blocks: render with ReactMarkdown.
        return (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        );
      }

      // Has code blocks: render parts.
      return (
        <>
          {codeParts.map((part, i) => {
            if (part.type === "code") {
              return (
                <CodeBlock
                  key={i}
                  language={part.language}
                  code={part.code}
                />
              );
            }
            return (
              <ReactMarkdown key={i} remarkPlugins={[remarkGfm]}>
                {part.value}
              </ReactMarkdown>
            );
          })}
        </>
      );
    }

    // Has mentions: render parts with mentions and code blocks.
    return (
      <>
        {parts.map((part, i) => {
          if (part.type === "mention") {
            const isSelfMention = currentUsername === part.username;
            return (
              <span
                key={i}
                className={isSelfMention ? "mention-self" : "mention-other"}
                style={{
                  color: "oklch(71.2% 0.194 13.428)",
                  fontWeight: 500,
                  cursor: "pointer",
                  ...(isSelfMention
                    ? {
                        backgroundColor: "oklch(71.2% 0.194 13.428 / 0.12)",
                        borderRadius: "3px",
                        padding: "0 2px",
                      }
                    : {}),
                }}
              >
                @{part.username}
              </span>
            );
          }
          // Text parts: may contain code blocks.
          const subParts = parseContentForCodeBlocks(part.value);
          return (
            <span key={i}>
              {subParts.map((sp, j) => {
                if (sp.type === "code") {
                  return (
                    <CodeBlock
                      key={j}
                      language={sp.language}
                      code={sp.code}
                    />
                  );
                }
                return (
                  <ReactMarkdown key={j} remarkPlugins={[remarkGfm]}>
                    {sp.value}
                  </ReactMarkdown>
                );
              })}
            </span>
          );
        })}
      </>
    );
  }, [message.content, currentUsername]);

  // In a group, non-first messages get tighter top padding
  const paddingY = isGrouped && hideAvatar ? "py-0.5" : "py-1.5";

  return (
    <div
      className={cn(
        "group flex gap-3 px-4 animate-slide-up",
        isOwn ? "justify-end" : "justify-start",
        paddingY,
      )}
    >
      {/* Avatar for others */}
      {!isOwn && !hideAvatar && (
        <div className="mt-0.5 flex-shrink-0">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white ring-1 ring-white/10"
            style={{ background: gradient }}
            aria-hidden="true"
          >
            {message.username.charAt(0).toUpperCase()}
          </div>
        </div>
      )}

      {/* Spacer (replaces hidden avatar to keep alignment) */}
      {!isOwn && hideAvatar && <div className="w-8 flex-shrink-0" aria-hidden="true" />}

      <div className={cn("max-w-[75%]", isOwn ? "items-end" : "items-start")}>
        {/* Username + timestamp header */}
        {!hideUsername && (
          <div
            className={cn(
              "mb-1 flex items-baseline gap-2",
              isOwn ? "justify-end" : "justify-start",
            )}
          >
            {!isOwn && (
              <span
                className="text-xs font-medium"
                style={{ color: nameColor }}
              >
                {message.username}
              </span>
            )}
            {/* Timestamp in header: only for solo messages (not first in group) */}
            {isOwn && !isGrouped && (
              <span className="text-xs text-muted-foreground/60">
                {formatTime(message.timestamp)}
              </span>
            )}
            {!isOwn && !isGrouped && (
              <span className="text-[10px] text-muted-foreground/50">
                {formatTime(message.timestamp)}
              </span>
            )}
          </div>
        )}

        {/* Message content bubble */}
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 text-sm leading-relaxed relative",
            isOwn
              ? "rounded-br-md"
              : "rounded-bl-md bg-[hsl(231,4%,18%)]",
          )}
          style={
            isOwn
              ? {
                  backgroundColor: bubbleBg,
                  border: `1px solid ${bubbleBorder}`,
                }
              : {
                  border: "1px solid hsl(220,2.5%,22%)",
                }
          }
        >
          <div className="markdown-body text-foreground/90">
            {mentionContent}
          </div>

          {/* Forward button (appears on hover) */}
          {onForward && (
            <div className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onForward(message);
                }}
                className="flex items-center gap-1 rounded-lg bg-[hsl(231,4%,22%)] border border-[hsl(220,2.5%,28%)] px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-[hsl(231,4%,26%)] transition-colors shadow-md"
                aria-label="Forward message"
              >
                <Forward className="h-3 w-3" />
                Forward
              </button>
            </div>
          )}
        </div>

        {/* Timestamp shown below bubble for own messages (hover) or last in group */}
        {isOwn && (
          <div className="mt-1 flex justify-end">
            <span
              className={cn(
                "text-[10px] text-muted-foreground/50 transition-opacity",
                forceShowTimestamp
                  ? "opacity-100"
                  : "opacity-0 group-hover:opacity-100",
              )}
            >
              {formatTime(message.timestamp)}
            </span>
          </div>
        )}

        {/* Timestamp for others: show below bubble when forced (last in group) */}
        {!isOwn && forceShowTimestamp && (
          <div className="mt-1 flex justify-start">
            <span className="text-[10px] text-muted-foreground/50">
              {formatTime(message.timestamp)}
            </span>
          </div>
        )}
      </div>

      {/* Avatar for own messages */}
      {isOwn && !hideAvatar && (
        <div className="mt-0.5 flex-shrink-0">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white ring-1 ring-white/10"
            style={{ background: gradient }}
            aria-hidden="true"
          >
            {message.username.charAt(0).toUpperCase()}
          </div>
        </div>
      )}

      {isOwn && hideAvatar && <div className="w-8 flex-shrink-0" aria-hidden="true" />}
    </div>
  );
});
