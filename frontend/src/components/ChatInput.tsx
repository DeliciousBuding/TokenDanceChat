import { useState, useRef, useCallback, useEffect, useMemo, lazy, Suspense, type KeyboardEvent, type ClipboardEvent } from "react";
import { Send, Loader2, X, ImagePlus, Paperclip, Mic, Square, Bold, Italic, Strikethrough, Code, Quote, Link, Eye, EyeOff, Film } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn, hashString } from "@/lib/utils";
import { useTranslation } from "@/i18n/context";
import { useChatStore } from "@/stores/chatStore";
import { chatAPI, type ChatMessage, type TypingContext } from "@/lib/api";
import { mentionableAssistants } from "@/lib/assistantRegistry";
import { ScheduleButton } from "./ScheduleButton";

const GifPicker = lazy(() => import("@/components/GifPicker").then((m) => ({ default: m.GifPicker })));

const EMOJI_MAP: Record<string, string> = {
  smile: "😄", laugh: "😆", heart: "❤️", thumbsup: "👍", thumbsdown: "👎",
  cry: "😢", angry: "😠", fire: "🔥", clap: "👏", ok: "👌",
  cool: "😎", thinking: "🤔", party: "🎉", rocket: "🚀", eyes: "👀",
  pray: "🙏", wave: "👋", joy: "😂", sweat_smile: "😅", sob: "😭",
  screaming: "😱", smirk: "😏", wink: "😉", blush: "😊", yum: "😋",
  neutral: "😐", confused: "😕", worried: "😟", tired: "😫", star: "⭐",
  check: "✅", x: "❌", hundred: "💯", plus1: "👍", minus1: "👎",
};

interface ChatInputProps {
  onSend: (content: string) => void;
  disabled?: boolean;
  replyTo?: ChatMessage | null;
  onUpload?: (file: File) => void;
}

const INPUT_MIN_HEIGHT = 48;
const INPUT_MAX_HEIGHT = 160;
export function ChatInput({
  onSend,
  disabled,
  replyTo,
  onUpload,
}: ChatInputProps) {
  const { t } = useTranslation();
  const { onlineUsers, username, currentChat, pendingImage, setPendingImage, setReplyTo, connected } = useChatStore();
  const [content, setContent] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const draftKey = useMemo(() => {
    if (currentChat.type === "dm") return `dm-${currentChat.username}`;
    if (currentChat.type === "group") return `group-${currentChat.name}`;
    return "public";
  }, [currentChat]);
  const draftStorageKey = `tdchat-draft-${draftKey}`;
  const draftLoadedRef = useRef(false);

  // Load draft when conversation changes.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftStorageKey);
      setContent(saved ?? "");
    } catch { setContent(""); }
    draftLoadedRef.current = true;
  }, [draftStorageKey]);

  // Save draft on content change (debounced via ref).
  const saveDraftRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (!draftLoadedRef.current) return;
    clearTimeout(saveDraftRef.current);
    saveDraftRef.current = setTimeout(() => {
      try {
        if (content.trim()) {
          localStorage.setItem(draftStorageKey, content);
        } else {
          localStorage.removeItem(draftStorageKey);
        }
      } catch { /* quota exceeded, ignore */ }
    }, 500);
    return () => clearTimeout(saveDraftRef.current);
  }, [content, draftStorageKey]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isComposing, setIsComposing] = useState(false);
  const [pulseButton, setPulseButton] = useState(false);
  const hadContentRef = useRef(false);
  const sendBtnRef = useRef<HTMLButtonElement>(null);
  const sendingRef = useRef(false);
  const typingSentRef = useRef(false);
  const [hasScheduled, setHasScheduled] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onUploadRef = useRef(onUpload);
  onUploadRef.current = onUpload;

  // Formatting toolbar state
  const [previewOn, setPreviewOn] = useState(false);
  const [formatToolbarOpen, setFormatToolbarOpen] = useState(false);
  const [linkInputVisible, setLinkInputVisible] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const linkInputRef = useRef<HTMLInputElement>(null);

  // Slide-to-cancel gesture
  const [slideCancelOffset, setSlideCancelOffset] = useState(0);
  const [slideCancelDragging, setSlideCancelDragging] = useState(false);
  const slideCancelStartX = useRef(0);
  const SLIDE_CANCEL_THRESHOLD = 60;

  // Gif picker state
  const [showGifPicker, setShowGifPicker] = useState(false);

  const handleCancelPointerDown = useCallback((e: React.PointerEvent) => {
    slideCancelStartX.current = e.clientX;
    setSlideCancelDragging(true);
    setSlideCancelOffset(0);
  }, []);

  const handleCancelPointerMove = useCallback((e: React.PointerEvent) => {
    if (!slideCancelDragging) return;
    const dx = slideCancelStartX.current - e.clientX;
    setSlideCancelOffset(Math.max(0, dx));
  }, [slideCancelDragging]);

  const handleCancelPointerUp = useCallback(() => {
    if (slideCancelOffset >= SLIDE_CANCEL_THRESHOLD) {
      cancelRecording();
    }
    setSlideCancelDragging(false);
    setSlideCancelOffset(0);
  }, [slideCancelOffset]);

  // Cleanup slide-cancel state when recording stops
  useEffect(() => {
    if (!isRecording) {
      setSlideCancelDragging(false);
      setSlideCancelOffset(0);
    }
  }, [isRecording]);
  const dragCounter = useRef(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const [dragError, setDragError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ fileName: string; progress: number } | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);

  // Estimate image file size from data URL
  const estimateImageSize = useCallback((dataUrl: string): string => {
    const base64 = dataUrl.split(',')[1] || '';
    const bytes = Math.round(base64.length * 0.75);
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }, []);

  // @mention autocomplete state
  const [mentionActive, setMentionActive] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionRef = useRef<HTMLDivElement>(null);

  // Compute the current @mention query from cursor position.
  const mentionQuery = useMemo(() => {
    const textarea = textareaRef.current;
    if (!textarea) return { query: "", startPos: -1 };
    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = content.slice(0, cursorPos);
    const match = textBeforeCursor.match(/@([\p{L}\p{N}_]*)$/u);
    if (!match) return { query: "", startPos: -1 };
    return {
      query: match[1] || "",
      startPos: match.index!,
    };
  }, [content]);

  // Derive filtered mention list and whether dropdown should be open.
  const mentionFiltered = useMemo(() => {
    const { query, startPos } = mentionQuery;
    if (startPos < 0) return [];
    const lower = query.toLowerCase();
    const assistantNames = new Set(mentionableAssistants.map((assistant) => assistant.name));
    const assistants = mentionableAssistants.filter((assistant) => {
      if (lower === "") return true;
      return (
        assistant.name.toLowerCase().includes(lower) ||
        assistant.aliases.some((alias) => alias.includes(lower))
      );
    }).map((assistant) => assistant.name);
    const users = onlineUsers
      .filter((u) => !assistantNames.has(u))
      .filter((u) => u.toLowerCase().includes(lower))
      .slice(0, Math.max(0, 10 - assistants.length));
    const results = [...assistants, ...users];
    // Add @all in group/public chats when query matches.
    const inGroupContext = currentChat.type === "group" || currentChat.type === "public";
    if (inGroupContext) {
      const allTargets = ["all", "everyone", "here"];
      for (const target of allTargets) {
        if (target.startsWith(lower) || lower === "") {
          results.unshift(target);
          break; // only add one @all variant
        }
      }
    }
    return results.slice(0, 10);
  }, [mentionQuery, onlineUsers, currentChat]);

  // Sync mentionActive with whether we have matches.
  useEffect(() => {
    setMentionActive(mentionFiltered.length > 0);
    setMentionIndex(0);
  }, [mentionFiltered.length]);

  // ── Slash commands ──
  const [slashIndex, setSlashIndex] = useState(0);
  const [emojiIndex, setEmojiIndex] = useState(0);
  const [slashDismissed, setSlashDismissed] = useState(false);
  const [emojiDismissed, setEmojiDismissed] = useState(false);

  const slashCommands = useMemo(() => [
    { command: "me", label: t("slash.me") },
    { command: "topic", label: t("slash.topic") },
    { command: "shrug", label: t("slash.shrug") },
    { command: "tableflip", label: t("slash.tableflip") },
  ], [t]);

  const slashQuery = useMemo(() => {
    const textarea = textareaRef.current;
    if (!textarea) return { query: "", startPos: -1, args: "" };
    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = content.slice(0, cursorPos);
    const match = textBeforeCursor.match(/(?:^|\s)\/([\w]*)(\s+.*)?$/);
    if (!match) return { query: "", startPos: -1, args: "" };
    const fullMatch = match[0];
    const slashPos = match.index! + fullMatch.indexOf("/");
    return {
      query: match[1] || "",
      args: (match[2] || "").trimStart(),
      startPos: slashPos,
    };
  }, [content]);

  const slashFiltered = useMemo(() => {
    const { query, startPos } = slashQuery;
    if (startPos < 0) return [];
    const lower = query.toLowerCase();
    return slashCommands.filter((cmd) =>
      query === "" || cmd.command.toLowerCase().startsWith(lower),
    );
  }, [slashQuery, slashCommands]);

  // ── Emoji shortcuts ──
  const emojiQuery = useMemo(() => {
    const textarea = textareaRef.current;
    if (!textarea) return { query: "", startPos: -1 };
    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = content.slice(0, cursorPos);
    const match = textBeforeCursor.match(/:([a-zA-Z0-9_]*)$/);
    if (!match) return { query: "", startPos: -1 };
    return {
      query: match[1] || "",
      startPos: match.index!,
    };
  }, [content]);

  const emojiFiltered = useMemo((): { key: string; emoji: string; custom: boolean; url?: string }[] => {
    const { query, startPos } = emojiQuery;
    if (startPos < 0 || query.length < 1) return [];
    const lower = query.toLowerCase();
    // Built-in emojis as { key, emoji } entries.
    const builtin = Object.entries(EMOJI_MAP)
      .filter(([key]) => key.toLowerCase().includes(lower))
      .map(([key, emoji]) => ({ key, emoji, custom: false }));
    // Custom emojis from store.
    const custom = useChatStore.getState().customEmojis
      .filter((e) => e.name.toLowerCase().includes(lower))
      .map((e) => ({ key: e.name, emoji: "", custom: true, url: e.url }));
    return [...builtin, ...custom].slice(0, 20);
  }, [emojiQuery]);

  // Active states with priority: mention > slash > emoji
  const slashActive = useMemo(
    () => slashFiltered.length > 0 && mentionFiltered.length === 0 && !slashDismissed,
    [slashFiltered.length, mentionFiltered.length, slashDismissed],
  );

  const emojiActive = useMemo(
    () =>
      emojiFiltered.length > 0 &&
      mentionFiltered.length === 0 &&
      slashFiltered.length === 0 &&
      !emojiDismissed,
    [emojiFiltered.length, mentionFiltered.length, slashFiltered.length, emojiDismissed],
  );

  // Reset dismissed flags when query content changes
  useEffect(() => {
    setSlashDismissed(false);
  }, [slashQuery.query, slashQuery.startPos]);

  useEffect(() => {
    setEmojiDismissed(false);
  }, [emojiQuery.query, emojiQuery.startPos]);

  // Reset indices when filtered lists change
  useEffect(() => { setSlashIndex(0); }, [slashFiltered.length]);
  useEffect(() => { setEmojiIndex(0); }, [emojiFiltered.length]);

  // Auto-resize textarea
  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const newHeight = Math.min(
      Math.max(textarea.scrollHeight, INPUT_MIN_HEIGHT),
      INPUT_MAX_HEIGHT,
    );
    textarea.style.height = `${newHeight}px`;
    textarea.style.overflowY =
      textarea.scrollHeight > INPUT_MAX_HEIGHT ? "auto" : "hidden";
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [content, adjustHeight]);

  // Compute typing context from current chat
  const typingContext = useMemo((): TypingContext => {
    const base: TypingContext = currentChat.type === "dm" ? { channel: "dm", target: currentChat.username } :
      currentChat.type === "group" ? { channel: "group", target: currentChat.name } :
      { channel: "public" };
    const trimmed = content.trim();
    if (trimmed) {
      base.preview = trimmed.slice(0, 30);
    }
    return base;
  }, [currentChat, content]);

  // Track latest typing context for unmount cleanup
  const typingContextRef = useRef(typingContext);
  typingContextRef.current = typingContext;

  // Dispatch typing_start / typing_stop events
  useEffect(() => {
    const hasContent = content.trim().length > 0;
    if (hasContent && !isComposing && !disabled && !typingSentRef.current) {
      chatAPI.sendTypingStart(typingContext);
      typingSentRef.current = true;
    } else if (!hasContent && typingSentRef.current) {
      chatAPI.sendTypingStop(typingContext);
      typingSentRef.current = false;
    }
  }, [content, isComposing, disabled, typingContext]);

  // Focus textarea when component mounts
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Auto-dismiss drag error toast
  useEffect(() => {
    if (dragError) {
      const timer = setTimeout(() => setDragError(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [dragError]);

  // Clean up recording and typing state on unmount
  useEffect(() => {
    return () => {
      mediaRecorderRef.current?.stop();
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      if (typingSentRef.current) {
        chatAPI.sendTypingStop(typingContextRef.current);
        typingSentRef.current = false;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleInsertAssistant = (event: Event) => {
      const assistant = (event as CustomEvent<{ name?: string }>).detail?.name;
      if (!assistant) return;
      const textarea = textareaRef.current;
      const prefix = content.trim().length > 0 ? " " : "";
      const nextContent = `${content}${prefix}@${assistant} `;
      setContent(nextContent);
      requestAnimationFrame(() => {
        textarea?.focus();
        textarea?.setSelectionRange(nextContent.length, nextContent.length);
        adjustHeight();
      });
    };
    window.addEventListener("tdchat:insert-mention", handleInsertAssistant);
    return () => {
      window.removeEventListener("tdchat:insert-mention", handleInsertAssistant);
    };
  }, [adjustHeight, content]);

  // Image paste handler — works for all image types.
  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            if (file.size > 50 * 1024 * 1024) return;
            const reader = new FileReader();
            reader.onload = () => {
              setPendingImage(reader.result as string);
            };
            reader.readAsDataURL(file);
            break;
          }
        }
      }
    },
    [setPendingImage],
  );

  // Image file select handler
  const handleImageSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 50 * 1024 * 1024) return;
      const reader = new FileReader();
      reader.onload = () => {
        setPendingImage(reader.result as string);
      };
      reader.readAsDataURL(file);
      if (imageInputRef.current) imageInputRef.current.value = "";
    },
    [setPendingImage],
  );

  // General file upload handler — upload directly and insert link.
  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !onUpload) return;
      if (file.size > 50 * 1024 * 1024) return;
      setUploadProgress({ fileName: file.name, progress: 0 });
      onUpload(file);
      setTimeout(() => setUploadProgress(null), 3000);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [onUpload],
  );

  // Cancel pending image
  const handleCancelImage = useCallback(() => {
    setPendingImage(null);
  }, [setPendingImage]);

  // Send pending image
  const handleSendImage = useCallback(() => {
    if (!pendingImage || !onUpload) return;
    // Convert data URL to File and upload.
    fetch(pendingImage)
      .then((res) => res.blob())
      .then((blob) => {
        const file = new File([blob], `paste-${Date.now()}.png`, { type: blob.type });
        onUpload(file);
      });
  }, [pendingImage, onUpload]);

  // ── Markdown formatting helpers ──

  /** Wrap the current selection with before/after text. If nothing selected, insert placeholder and place cursor inside. */
  const wrapSelection = useCallback(
    (before: string, after: string, placeholder: string) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selected = content.slice(start, end);
      const replacement = selected
        ? before + selected + after
        : before + placeholder + after;
      const newContent =
        content.slice(0, start) + replacement + content.slice(end);
      setContent(newContent);
      requestAnimationFrame(() => {
        textarea.focus();
        if (selected) {
          const cursor = start + replacement.length;
          textarea.setSelectionRange(cursor, cursor);
        } else {
          const cursor = start + before.length;
          const selEnd = cursor + placeholder.length;
          textarea.setSelectionRange(cursor, selEnd);
        }
      });
    },
    [content],
  );

  const insertQuote = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const hasSelection = start !== end;
    let newContent: string;
    let newCursor: number;
    if (hasSelection) {
      const before = content.slice(0, start);
      const selected = content.slice(start, end);
      const after = content.slice(end);
      const quoted = selected
        .split("\n")
        .map((line) => "> " + line)
        .join("\n");
      newContent = before + quoted + after;
      newCursor = start + quoted.length;
    } else {
      const beforeCursor = content.slice(0, start);
      const lastNewline = beforeCursor.lastIndexOf("\n");
      const lineStart = lastNewline === -1 ? 0 : lastNewline + 1;
      newContent =
        content.slice(0, lineStart) + "> " + content.slice(lineStart);
      newCursor = start + 2;
    }
    setContent(newContent);
    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(newCursor, newCursor);
    });
  }, [content]);

  const handleFormatBold = useCallback(
    () => wrapSelection("**", "**", "bold"),
    [wrapSelection],
  );
  const handleFormatItalic = useCallback(
    () => wrapSelection("*", "*", "italic"),
    [wrapSelection],
  );
  const handleFormatStrikethrough = useCallback(
    () => wrapSelection("~~", "~~", "strike"),
    [wrapSelection],
  );
  const handleFormatCode = useCallback(
    () => wrapSelection("`", "`", "code"),
    [wrapSelection],
  );

  const handleFormatLink = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = content.slice(start, end);
    if (selected) {
      // Selection exists: show inline URL input
      setLinkInputVisible(true);
      setLinkUrl("");
      requestAnimationFrame(() => {
        linkInputRef.current?.focus();
      });
    } else {
      // No selection: show inline URL input for manual entry
      setLinkInputVisible(true);
      setLinkUrl("");
      requestAnimationFrame(() => {
        linkInputRef.current?.focus();
      });
    }
  }, [content]);

  const handleGifSelect = useCallback(
    (markdown: string) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      // Insert the GIF/sticker markdown with a trailing space.
      const insertion = markdown + " ";
      const newContent = content.slice(0, start) + insertion + content.slice(end);
      setContent(newContent);
      setShowGifPicker(false);
      requestAnimationFrame(() => {
        textarea.focus();
        const cursor = start + insertion.length;
        textarea.setSelectionRange(cursor, cursor);
      });
    },
    [content],
  );

  const commitLink = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const url = linkUrl.trim();
    if (!url) {
      setLinkInputVisible(false);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = content.slice(start, end);
    const replacement = selected
      ? `[${selected}](${url})`
      : `[link](${url})`;
    const newContent =
      content.slice(0, start) + replacement + content.slice(end);
    setContent(newContent);
    setLinkInputVisible(false);
    setLinkUrl("");
    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = selected
        ? start + replacement.length
        : start + replacement.indexOf("](") + 1;
      const selEnd = selected ? cursor : start + replacement.indexOf("](");
      textarea.setSelectionRange(
        selected ? cursor : selEnd,
        selected ? cursor : cursor,
      );
    });
  }, [content, linkUrl]);

  const cancelLink = useCallback(() => {
    setLinkInputVisible(false);
    setLinkUrl("");
    textareaRef.current?.focus();
  }, []);

  // Keyboard shortcuts for formatting
  useEffect(() => {
    const handleGlobalShortcut = (e: globalThis.KeyboardEvent) => {
      const textarea = textareaRef.current;
      if (!textarea || document.activeElement !== textarea) return;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;

      if (e.key === "b" || e.key === "B") {
        e.preventDefault();
        handleFormatBold();
      } else if (e.key === "i" || e.key === "I") {
        e.preventDefault();
        handleFormatItalic();
      } else if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        handleFormatLink();
      } else if (e.key === "e" || e.key === "E") {
        e.preventDefault();
        handleFormatCode();
      } else if (mod && e.shiftKey && (e.key === "x" || e.key === "X")) {
        e.preventDefault();
        handleFormatStrikethrough();
      }
    };
    window.addEventListener("keydown", handleGlobalShortcut);
    return () => window.removeEventListener("keydown", handleGlobalShortcut);
  }, [handleFormatBold, handleFormatItalic, handleFormatStrikethrough, handleFormatCode, handleFormatLink]);

  const startRecording = useCallback(async () => {
    if (isRecording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blobType = mimeType.split(';')[0];
        const blob = new Blob(chunksRef.current, { type: blobType });
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: blobType });
        onUploadRef.current?.(file);
      };
      recorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime(t => {
        if (t + 1 >= 300) {
          // Auto-stop at 5 minutes
          mediaRecorderRef.current?.stop();
          setIsRecording(false);
          if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
          return 0;
        }
        return t + 1;
      }), 1000);
    } catch {
      console.warn('MediaRecorder not available or microphone permission denied');
    }
  }, [onUpload]);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setRecordingTime(0);
  }, []);

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      // Remove onstop handler to prevent upload, then stop
      mediaRecorderRef.current.onstop = () => {};
      mediaRecorderRef.current.stop();
    }
    chunksRef.current = [];
    setIsRecording(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setRecordingTime(0);
  }, []);

  // Pulse send button when content goes from empty to non-empty
  useEffect(() => {
    const hasContent = content.trim().length > 0;
    if (!hadContentRef.current && hasContent) {
      setPulseButton(true);
      const timer = setTimeout(() => setPulseButton(false), 400);
      hadContentRef.current = true;
      return () => clearTimeout(timer);
    }
    if (!hasContent) {
      hadContentRef.current = false;
    }
  }, [content]);

  const handleSend = useCallback(() => {
    // Prevent double-send from rapid clicks or Enter+click firing.
    if (sendingRef.current) return;
    const trimmed = content.trim();
    if (!trimmed || disabled) return;
    if (!connected) {
      // Keep content in input so user can retry when reconnected.
      return;
    }
    sendingRef.current = true;

    // If editing a previous message, send edit instead
    if (editingMessageId) {
      chatAPI.sendMessageEdit(editingMessageId, trimmed);
      setEditingMessageId(null);
    } else {
      onSend(trimmed);
    }
    import("@/lib/sound").then((m) => m.playSentSound());
    setContent("");
    // Clear reply indicator after send
    setReplyTo(null);
    // Pulse the send button as visual confirmation of sent message.
    setPulseButton(true);
    setTimeout(() => setPulseButton(false), 400);
    // Clear draft.
    try { localStorage.removeItem(draftStorageKey); } catch { /* ignore */ }
    // Clear typing state.
    if (typingSentRef.current) {
      chatAPI.sendTypingStop(typingContext);
      typingSentRef.current = false;
    }
    if (textareaRef.current) {
      textareaRef.current.style.height = `${INPUT_MIN_HEIGHT}px`;
      textareaRef.current.style.overflowY = "hidden";
    }
    // Allow sending again after a short delay.
    setTimeout(() => { sendingRef.current = false; }, 500);
  }, [content, disabled, connected, onSend, typingContext, draftStorageKey, editingMessageId]);

  // Schedule a message for future delivery.
  const handleSchedule = useCallback(
    (sendAt: number) => {
      if (!content.trim() || !connected) return;
      const trimmed = content.trim();
      const state = useChatStore.getState();
      const currentRoomId = state.currentRoomID;

      if (currentChat.type === "dm") {
        chatAPI.sendScheduleMessage(trimmed, sendAt, currentRoomId, currentChat.username, "", state.replyTo?.id);
      } else if (currentChat.type === "group") {
        chatAPI.sendScheduleMessage(trimmed, sendAt, currentRoomId, "", currentChat.name, state.replyTo?.id);
      } else {
        chatAPI.sendScheduleMessage(trimmed, sendAt, currentRoomId, "", "", state.replyTo?.id);
      }

      setContent("");
      setReplyTo(null);
      setHasScheduled(true);
      try { localStorage.removeItem(draftStorageKey); } catch { /* ignore */ }
      if (typingSentRef.current) {
        chatAPI.sendTypingStop(typingContext);
        typingSentRef.current = false;
      }
      if (textareaRef.current) {
        textareaRef.current.style.height = `${INPUT_MIN_HEIGHT}px`;
        textareaRef.current.style.overflowY = "hidden";
      }
      // Reset scheduled indicator after 2 sec
      setTimeout(() => setHasScheduled(false), 2500);
    },
    [content, connected, currentChat, setReplyTo, draftStorageKey, typingContext],
  );

  // Insert @username at cursor position.
  const insertMention = useCallback(
    (selectedUser: string) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const { startPos } = mentionQuery;
      if (startPos < 0) return;

      const cursorPos = textarea.selectionStart;
      const before = content.slice(0, startPos);
      const after = content.slice(cursorPos);
      const newContent = `${before}@${selectedUser} ${after}`;
      setContent(newContent);
      setMentionActive(false);

      // Restore cursor after the inserted mention.
      const newCursor = startPos + selectedUser.length + 2;
      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(newCursor, newCursor);
      });
    },
    [content, mentionQuery],
  );

  // Insert slash command at cursor position.
  const insertSlashCommand = useCallback(
    (command: string) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const { startPos, args } = slashQuery;
      if (startPos < 0) return;

      const cursorPos = textarea.selectionStart;
      const before = content.slice(0, startPos);
      const after = content.slice(cursorPos);

      let replacement = "";
      if (command === "shrug") {
        replacement = "¯\\_(ツ)_/¯";
      } else if (command === "tableflip") {
        replacement = "(╯°□°)╯︵ ┻━┻";
      } else if (command === "me") {
        replacement = `_${username} ${args}_`;
      } else if (command === "topic") {
        if (args) {
          chatAPI.sendSetTopic(args);
        }
        replacement = "";
      }

      const newContent = before + replacement + after;
      setContent(newContent);

      const newCursor = startPos + replacement.length;
      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(newCursor, newCursor);
      });
    },
    [content, slashQuery, username],
  );

  // Insert emoji at cursor position.
  const insertEmoji = useCallback(
    (emojiKey: string) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const { startPos } = emojiQuery;
      if (startPos < 0) return;

      const cursorPos = textarea.selectionStart;
      const before = content.slice(0, startPos);
      const after = content.slice(cursorPos);

      // Check if this is a custom emoji (no unicode char in EMOJI_MAP)
      const emojiChar = EMOJI_MAP[emojiKey];
      const replacement = emojiChar || `:${emojiKey}:`;

      const newContent = before + replacement + after;
      setContent(newContent);

      const newCursor = startPos + replacement.length;
      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(newCursor, newCursor);
      });
    },
    [content, emojiQuery],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // @mention autocomplete keyboard handling
      if (mentionActive) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setMentionIndex((prev) =>
            Math.min(prev + 1, mentionFiltered.length - 1),
          );
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setMentionIndex((prev) => Math.max(prev - 1, 0));
          return;
        }
        if (e.key === "Enter" && !e.shiftKey && !isComposing) {
          e.preventDefault();
          if (mentionFiltered[mentionIndex]) {
            insertMention(mentionFiltered[mentionIndex]);
          }
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setMentionActive(false);
          return;
        }
      }

      // Slash command keyboard handling
      if (slashActive) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSlashIndex((prev) =>
            Math.min(prev + 1, slashFiltered.length - 1),
          );
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSlashIndex((prev) => Math.max(prev - 1, 0));
          return;
        }
        if (e.key === "Enter" && !e.shiftKey && !isComposing) {
          e.preventDefault();
          if (slashFiltered[slashIndex]) {
            insertSlashCommand(slashFiltered[slashIndex].command);
          }
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setSlashDismissed(true);
          return;
        }
      }

      // Emoji shortcut keyboard handling
      if (emojiActive) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setEmojiIndex((prev) =>
            Math.min(prev + 1, emojiFiltered.length - 1),
          );
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setEmojiIndex((prev) => Math.max(prev - 1, 0));
          return;
        }
        if (e.key === "Enter" && !e.shiftKey && !isComposing) {
          e.preventDefault();
          if (emojiFiltered[emojiIndex]) {
            insertEmoji(emojiFiltered[emojiIndex].key);
          }
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setEmojiDismissed(true);
          return;
        }
      }

      if (e.key === "Enter" && !e.shiftKey && !isComposing) {
        e.preventDefault();
        handleSend();
      }

      // ↑ key with empty input → edit last sent message (Telegram-style).
      if (e.key === "ArrowUp" && !e.shiftKey && !content && !mentionActive && !slashActive && !emojiActive) {
        e.preventDefault();
        const allMessages = useChatStore.getState().messages;
        // Filter by current conversation context
        const partner = currentChat.type === "dm" ? currentChat.username : null;
        const group = currentChat.type === "group" ? currentChat.name : null;
        for (let i = allMessages.length - 1; i >= 0; i--) {
          const m = allMessages[i];
          if (m.username !== username || m.deleted) continue;
          // Conversation filter
          if (partner) {
            const sender = m.from || m.username;
            const recipient = m.to;
            if (!((sender === partner && recipient === username) || (sender === username && recipient === partner))) continue;
          } else if (group) {
            if (m.to !== group && (m as any).group !== group) continue;
          } else if (m.to) {
            continue; // public chat: only messages without specific recipient
          }
          setContent(m.content);
          setEditingMessageId(m.id);
          requestAnimationFrame(() => {
            const ta = textareaRef.current;
            if (ta) {
              ta.focus();
              ta.setSelectionRange(ta.value.length, ta.value.length);
            }
          });
          break;
        }
      }

      // Clear editing state if user types something different
      if (editingMessageId && e.key !== "ArrowUp" && e.key !== "ArrowDown" && e.key !== "Shift" && e.key !== "Control" && e.key !== "Alt" && e.key !== "Meta") {
        // Will be cleared by the onChange handler
      }
    },
    [
      handleSend,
      isComposing,
      mentionActive,
      mentionFiltered,
      mentionIndex,
      insertMention,
      slashActive,
      slashFiltered,
      slashIndex,
      insertSlashCommand,
      emojiActive,
      emojiFiltered,
      emojiIndex,
      insertEmoji,
      content,
      username,
      currentChat,
      editingMessageId,
    ],
  );

  const hasContent = content.trim().length > 0;

  // Determine placeholder based on chat context.
  const placeholder = useMemo(() => {
    if (currentChat.type === "dm") {
      return t("input.dmPlaceholder", {
        username: currentChat.username,
      });
    }
    if (currentChat.type === "group") {
      return t("input.groupPlaceholder", { name: currentChat.name });
    }
    return t("input.placeholder");
  }, [currentChat, t]);

  return (
    <div
      className="relative border-t border-border bg-background pb-safe"
      onDragEnter={(e) => {
        e.preventDefault();
        dragCounter.current += 1;
        setIsDragOver(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        dragCounter.current -= 1;
        if (dragCounter.current === 0) {
          setIsDragOver(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        dragCounter.current = 0;
        setIsDragOver(false);
        const files = e.dataTransfer?.files;
        if (!files || files.length === 0) return;
        const file = files[0];
        if (file.size > 50 * 1024 * 1024) {
          setDragError(t("input.fileTooLarge"));
          return;
        }
        if (file.type.startsWith("image/")) {
          const reader = new FileReader();
          reader.onload = () => setPendingImage(reader.result as string);
          reader.readAsDataURL(file);
        } else if (onUpload) {
          setUploadProgress({ fileName: file.name, progress: 0 });
          onUpload(file);
          // Clear progress after a short delay (upload completes async in parent)
          setTimeout(() => setUploadProgress(null), 3000);
        }
      }}
    >
      {/* Reply indicator */}
      {replyTo && (
        <div className="reply-indicator-enter flex items-center gap-2 px-4 pt-2">
          <div className="flex-1 flex items-center gap-2 rounded-lg bg-card border border-border px-3 py-1.5">
            <span className="text-xs text-muted-foreground">
              {t("input.replyTo")}{" "}
              <span className="font-medium text-foreground/70">
                {replyTo.username}
              </span>
            </span>
            <span className="text-xs text-muted-foreground truncate flex-1">
              {replyTo.content.slice(0, 60)}
              {replyTo.content.length > 60 ? "..." : ""}
            </span>
          </div>
          <button
            onClick={() => setReplyTo(null)}
            aria-label={t("input.cancel")}
            className="flex-shrink-0 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Editing indicator */}
      {editingMessageId && !replyTo && (
        <div className="reply-indicator-enter flex items-center gap-2 px-4 pt-2">
          <div className="flex-1 flex items-center gap-2 rounded-lg bg-primary/10 border border-primary/20 px-3 py-1.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-primary">
              <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
            </svg>
            <span className="text-xs text-muted-foreground">
              {t("input.editingMessage")}
            </span>
          </div>
          <button
            onClick={() => { setEditingMessageId(null); setContent(""); }}
            aria-label={t("input.cancel")}
            className="flex-shrink-0 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Image preview */}
      {pendingImage && (
        <div className="image-preview-enter px-4 pt-2">
          <div className="flex items-start gap-3 rounded-xl border border-border bg-card/50 p-3 shadow-sm">
            <div className="relative flex-shrink-0">
              <img
                src={pendingImage}
                alt="Preview"
                className="h-24 w-auto rounded-lg border border-border object-cover shadow-sm"
                onLoad={(e) => {
                  const img = e.currentTarget;
                  setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
                }}
              />
              <button
                onClick={handleCancelImage}
                className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-white hover:bg-destructive/90 transition-colors shadow-sm"
                aria-label="Remove image"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            <div className="flex flex-col gap-1.5 min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-foreground/80 truncate">
                  {t("input.pastedImage")}
                </span>
                {imageDimensions && (
                  <span className="text-[10px] text-muted-foreground/60 flex-shrink-0">
                    {imageDimensions.width} x {imageDimensions.height}
                  </span>
                )}
              </div>
              <div className="text-[10px] text-muted-foreground/50">
                {estimateImageSize(pendingImage)}
              </div>
              <button
                onClick={handleSendImage}
                className="mt-1 flex items-center gap-1.5 self-start rounded-lg px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground hover:brightness-110 transition-all"
              >
                <Send className="h-3 w-3" />
                {t("input.sendImage")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden file inputs */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        onChange={handleImageSelect}
        className="hidden"
        aria-hidden="true"
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.txt,.md,.csv,.json,.xml,.zip,.tar,.gz,.7z,.rar,.mp3,.wav,.m4a,.webm,.ogg,.mp4,.mov"
        onChange={handleFileSelect}
        className="hidden"
        aria-hidden="true"
      />

      {/* Markdown formatting toolbar */}
      {!isRecording && (
        <div
          className={cn(
            "items-center gap-1 overflow-x-auto border-b border-border/60 bg-background/70 px-3 py-1.5 shadow-[inset_0_-1px_0_oklch(0_0_0_/_0.015)] scrollbar-thin sm:flex",
            formatToolbarOpen ? "flex" : "hidden",
          )}
        >
          <button
            type="button"
            onClick={handleFormatBold}
            disabled={disabled}
            aria-label={t("editor.bold")}
            title={t("editor.bold") + " (Ctrl+B)"}
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Bold className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleFormatItalic}
            disabled={disabled}
            aria-label={t("editor.italic")}
            title={t("editor.italic") + " (Ctrl+I)"}
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Italic className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleFormatStrikethrough}
            disabled={disabled}
            aria-label={t("editor.strikethrough")}
            title={t("editor.strikethrough")}
            className="hidden h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-30 sm:flex"
          >
            <Strikethrough className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleFormatCode}
            disabled={disabled}
            aria-label={t("editor.code")}
            title={t("editor.code") + " (Ctrl+E)"}
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Code className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={insertQuote}
            disabled={disabled}
            aria-label={t("editor.quote")}
            title={t("editor.quote")}
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Quote className="h-4 w-4" />
          </button>

          {/* GIF picker button */}
          <button
            type="button"
            onClick={() => setShowGifPicker((p) => !p)}
            disabled={disabled}
            aria-label="GIF"
            title="GIF & Stickers"
            className={cn(
              "flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-30",
              showGifPicker
                ? "bg-accent text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Film className="h-4 w-4" />
          </button>

          {/* Link button with inline URL input */}
          <div className="relative flex items-center">
            <button
              type="button"
              onClick={handleFormatLink}
              disabled={disabled}
              aria-label={t("editor.link")}
              title={t("editor.link") + " (Ctrl+K)"}
              className={cn(
                "hidden h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-30 sm:flex",
                linkInputVisible
                  ? "bg-accent text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Link className="h-4 w-4" />
            </button>
            {linkInputVisible && (
              <div className="flex items-center gap-1 animate-scale-in ml-1">
                <input
                  ref={linkInputRef}
                  type="url"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitLink();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      cancelLink();
                    }
                  }}
                  placeholder={t("editor.linkUrl")}
                  className="h-11 w-52 rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                />
                <button
                  type="button"
                  onClick={commitLink}
                  className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:brightness-110 transition-colors"
                  aria-label="OK"
                >
                  <Send className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={cancelLink}
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                  aria-label="Cancel"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Preview toggle */}
          <button
            type="button"
            onClick={() => setPreviewOn((p) => !p)}
            disabled={disabled}
            aria-label={t("editor.preview")}
            title={t("editor.preview")}
            className={cn(
              "flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-30",
              previewOn
                ? "bg-accent text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {previewOn ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
      )}

      {/* Recording indicator (replaces toolbar and input area when recording) */}
      {isRecording ? (
        <div className="recording-bar-enter flex flex-col gap-2 px-4 py-3 transition-all duration-300 ease-out">
          {/* Duration limit bar */}
          <div className="recording-limit-bar">
            <div
              className="recording-limit-bar-fill"
              style={{ width: `${Math.min((recordingTime / 300) * 100, 100)}%` }}
            />
          </div>

          <div
            className={cn(
              "flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors duration-200",
              slideCancelDragging && slideCancelOffset >= SLIDE_CANCEL_THRESHOLD
                ? "border-destructive/60 bg-destructive/15"
                : "border-destructive/30 bg-destructive/5",
            )}
          >
            {/* Pulsing red dot */}
            <span className="relative flex h-3 w-3 flex-shrink-0">
              <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
            </span>

            {/* Recording time */}
            <span className="text-sm font-mono text-destructive/80 tabular-nums flex-shrink-0 min-w-[44px]">
              {String(Math.floor(recordingTime / 60)).padStart(2, '0')}:{String(recordingTime % 60).padStart(2, '0')}
            </span>

            {/* Waveform visualizer */}
            <div className="recording-waveform">
              {[16, 24, 12, 20, 14].map((peak, i) => (
                <div
                  key={i}
                  className="waveform-bar"
                  style={{
                    '--wv-peak': `${peak}px`,
                    animationDelay: `${i * 0.12}s`,
                  } as React.CSSProperties}
                />
              ))}
            </div>

            {/* Cancel button with slide-to-cancel gesture */}
            <div
              className={cn(
                "slide-cancel-track relative flex-shrink-0",
                slideCancelDragging && "slide-cancel-dragging",
                slideCancelDragging && slideCancelOffset >= SLIDE_CANCEL_THRESHOLD && "slide-cancel-threshold-reached",
              )}
              onPointerDown={handleCancelPointerDown}
              onPointerMove={handleCancelPointerMove}
              onPointerUp={handleCancelPointerUp}
              onPointerCancel={handleCancelPointerUp}
            >
              <button
                onClick={() => {
                  if (!slideCancelDragging) cancelRecording();
                }}
                className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-xl border transition-colors",
                  slideCancelDragging && slideCancelOffset >= SLIDE_CANCEL_THRESHOLD
                    ? "border-destructive/50 bg-destructive/20 text-destructive"
                    : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-destructive",
                )}
                style={slideCancelDragging ? { transform: `translateX(${-slideCancelOffset}px)` } : undefined}
                aria-label="Cancel recording"
              >
                <X className="h-4 w-4" />
              </button>
              <span className="slide-cancel-hint">
                {slideCancelDragging && slideCancelOffset >= SLIDE_CANCEL_THRESHOLD ? "Release to cancel" : "← slide to cancel"}
              </span>
            </div>

            {/* Stop / Send button */}
            <button
              onClick={stopRecording}
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground hover:brightness-110 transition-colors"
              aria-label="Stop recording"
            >
              <Square className="h-4 w-4" fill="currentColor" />
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Input area */}
          <div className="flex items-end gap-2 px-3 py-2.5 sm:px-4 sm:py-3">
            <div className="flex items-center gap-1.5 pb-0.5 sm:gap-2 sm:pb-0">
              <button
                type="button"
                onClick={() => setFormatToolbarOpen((open) => !open)}
                disabled={disabled}
                aria-label={t("editor.formatting")}
                title={t("editor.formatting")}
                className={cn(
                  "flex h-11 w-11 flex-shrink-0 cursor-pointer items-center justify-center rounded-xl border border-transparent transition-colors duration-200 sm:hidden",
                  formatToolbarOpen
                    ? "bg-primary/10 text-primary"
                    : "bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
                  "disabled:cursor-not-allowed disabled:opacity-30",
                )}
              >
                <Bold className="h-[18px] w-[18px]" />
              </button>

              {/* Image upload button */}
              <button
                onClick={() => imageInputRef.current?.click()}
                disabled={disabled}
                aria-label="Upload image"
                className={cn(
                  "hidden h-11 w-11 flex-shrink-0 cursor-pointer items-center justify-center rounded-xl border border-transparent transition-colors duration-200 sm:flex sm:h-12 sm:w-12",
                  "bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30",
                )}
              >
                <ImagePlus className="h-[18px] w-[18px]" />
              </button>

              {/* File upload button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled}
                aria-label="Upload file"
                className={cn(
                  "flex h-11 w-11 flex-shrink-0 cursor-pointer items-center justify-center rounded-xl border border-transparent transition-colors duration-200 sm:h-12 sm:w-12",
                  "bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30",
                )}
              >
                <Paperclip className="h-[18px] w-[18px]" />
              </button>

              {/* Mic button */}
              <button
                onClick={startRecording}
                disabled={disabled}
                aria-label="Record voice message"
                className={cn(
                  "hidden h-11 w-11 flex-shrink-0 cursor-pointer items-center justify-center rounded-xl border border-transparent transition-colors duration-200 sm:flex sm:h-12 sm:w-12",
                  "bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30",
                )}
              >
                <Mic className="h-[18px] w-[18px]" />
              </button>

            </div>

            <div className="relative input-glow min-w-0 flex-1">
              {/* @mention autocomplete dropdown */}
              {mentionActive && (
                <div
                  ref={mentionRef}
                  className="absolute bottom-full left-0 right-0 mb-1 overflow-hidden rounded-lg border border-border bg-card shadow-lg animate-scale-in z-20"
                  style={{ maxHeight: "200px", overflowY: "auto" }}
                >
                  {mentionFiltered.map((user, idx) => (
                    <button
                      key={user}
                      onClick={() => insertMention(user)}
                      onMouseEnter={() => setMentionIndex(idx)}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-2 text-sm text-left transition-colors",
                        idx === mentionIndex
                          ? "bg-accent text-foreground"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground",
                      )}
                    >
                      <span
                        className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                        style={{
                          background: `linear-gradient(135deg, oklch(65% 0.16 ${hashString(user) % 360}), oklch(58% 0.14 ${(hashString(user) + 45) % 360}))`,
                        }}
                      >
                        {user.charAt(0).toUpperCase()}
                      </span>
                      <span className="truncate">{user}</span>
                      {mentionableAssistants.some((assistant) => assistant.name === user) && (
                        <span className="ml-auto rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground/70">
                          {mentionableAssistants.find((assistant) => assistant.name === user)?.label}
                        </span>
                      )}
                      {user === username && (
                        <span className="ml-auto text-[10px] text-muted-foreground/50">
                          {t("sidebar.you")}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* Slash command dropdown */}
              {slashActive && (
                <div
                  className="absolute bottom-full left-0 right-0 mb-1 overflow-hidden rounded-lg border border-border bg-card shadow-lg animate-scale-in z-20"
                  style={{ maxHeight: "200px", overflowY: "auto" }}
                >
                  {slashFiltered.map((cmd, idx) => (
                    <button
                      key={cmd.command}
                      onClick={() => insertSlashCommand(cmd.command)}
                      onMouseEnter={() => setSlashIndex(idx)}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-2 text-sm text-left transition-colors",
                        idx === slashIndex
                          ? "bg-accent text-foreground"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground",
                      )}
                    >
                      <span className="text-xs font-mono font-semibold text-muted-foreground/70">
                        /{cmd.command}
                      </span>
                      <span className="truncate">{cmd.label}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Emoji shortcut dropdown */}
              {emojiActive && (
                <div
                  className="absolute bottom-full left-0 right-0 mb-1 overflow-hidden rounded-lg border border-border bg-card shadow-lg animate-scale-in z-20"
                  style={{ maxHeight: "200px", overflowY: "auto" }}
                >
                  {emojiFiltered.map((item, idx) => (
                    <button
                      key={item.key}
                      onClick={() => insertEmoji(item.key)}
                      onMouseEnter={() => setEmojiIndex(idx)}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-2 text-sm text-left transition-colors",
                        idx === emojiIndex
                          ? "bg-accent text-foreground"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground",
                      )}
                    >
                      {item.custom ? (
                        <img src={(item as unknown as { url: string }).url} alt={item.key} className="w-5 h-5 object-contain" />
                      ) : (
                        <span className="text-base">{item.emoji}</span>
                      )}
                      <span className="text-xs text-muted-foreground/70">
                        :{item.key}:
                      </span>
                    </button>
                  ))}
                </div>
              )}

              <textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                onCompositionStart={() => setIsComposing(true)}
                onCompositionEnd={() => setIsComposing(false)}
                placeholder={placeholder}
                rows={1}
                maxLength={2000}
                disabled={disabled}
                aria-label={placeholder}
                className="block h-12 max-h-[160px] min-h-12 w-full resize-none overflow-y-hidden rounded-xl border border-border/70 bg-background/90 px-4 py-[13px] text-base leading-5 text-foreground placeholder:text-muted-foreground/60 shadow-[0_1px_2px_oklch(0_0_0_/_0.025)] outline-none transition-colors duration-200 focus-visible:border-primary/45 focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:outline-none disabled:opacity-50 sm:text-sm"
                style={{ scrollbarWidth: "thin", height: INPUT_MIN_HEIGHT }}
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              {/* Schedule button */}
              <div className="hidden sm:block">
                <ScheduleButton
                  onSchedule={handleSchedule}
                  disabled={disabled || !hasContent}
                  scheduled={hasScheduled}
                />
              </div>

              {/* Send button */}
              <button
                ref={sendBtnRef}
                onClick={handleSend}
                disabled={disabled || !hasContent}
                aria-label={
                  disabled ? t("join.buttonConnecting") : hasScheduled ? t("schedule.schedule") : t("input.placeholder")
                }
                className={cn(
                  "flex h-12 w-12 flex-shrink-0 cursor-pointer items-center justify-center rounded-xl border border-transparent transition-all duration-300 ease-out",
                  hasContent
                    ? "bg-primary text-primary-foreground hover:brightness-110"
                    : "bg-accent/50 text-muted-foreground/45",
                  "disabled:cursor-not-allowed disabled:opacity-30",
                  pulseButton && "animate-pulse-once",
                )}
                onMouseEnter={(e) => {
                  if (hasContent) {
                    e.currentTarget.style.transform = "scale(1.05)";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "scale(1)";
                }}
              >
                {disabled ? (
                  <Loader2 className="h-[18px] w-[18px] text-muted-foreground animate-spin" />
                ) : (
                  <Send className="h-[18px] w-[18px]" />
                )}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Markdown preview */}
      {!isRecording && previewOn && content.trim() && (
        <div className="border-t border-border bg-muted/30 px-4 py-3">
          <div className="prose prose-sm dark:prose-invert max-w-none text-foreground/90 prose-p:my-1 prose-headings:my-1.5 prose-code:before:content-none prose-code:after:content-none prose-code:bg-accent/60 prose-code:rounded prose-code:px-1 prose-code:py-0.5 prose-pre:bg-muted prose-blockquote:border-l-primary/50">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {content}
            </ReactMarkdown>
          </div>
        </div>
      )}

      {/* Character count */}
      {!isRecording && content.length > 0 && (
        <div className="flex justify-end px-4 pb-1">
          <span
            className={cn(
              "text-[10px] transition-colors",
              content.length > 1800
                ? "text-destructive/70"
                : "text-muted-foreground/40",
            )}
            aria-live="polite"
          >
            {t("input.characters", { current: content.length, max: 2000 })}
          </span>
        </div>
      )}

      {/* Drag-and-drop overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/80 backdrop-blur-sm border-2 border-dashed border-primary/50 rounded-lg m-1">
          <div className="flex flex-col items-center gap-2 text-primary/70">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span className="text-sm font-medium">{t("file.dropFilesHere")}</span>
          </div>
        </div>
      )}

      {/* Upload progress bar */}
      {uploadProgress && (
        <div className="px-4 pt-2 animate-slide-up">
          <div className="flex items-center gap-3 rounded-lg bg-muted/30 border border-border px-3 py-2">
            <Loader2 className="h-4 w-4 text-primary animate-spin flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-foreground/70 truncate">{uploadProgress.fileName}</p>
              <p className="text-[10px] text-muted-foreground/50">{t("file.uploading")}</p>
            </div>
            <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden flex-shrink-0">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300 ease-out"
                style={{ width: `${Math.min(uploadProgress.progress, 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Drag error toast */}
      {dragError && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 rounded-full bg-destructive text-destructive-foreground text-xs font-medium animate-slide-up shadow-lg whitespace-nowrap">
          {dragError}
        </div>
      )}

      {/* Gif Picker */}
      {showGifPicker && (
        <Suspense fallback={null}>
          <GifPicker
            onSelect={handleGifSelect}
            onClose={() => setShowGifPicker(false)}
          />
        </Suspense>
      )}
    </div>
  );
}
