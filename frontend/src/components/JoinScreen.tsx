import { useState, useCallback, useEffect, type FormEvent, type KeyboardEvent } from "react";
import { MessageCircle, ArrowRight, Loader2 } from "lucide-react";
import { useChatStore } from "@/stores/chatStore";
import { useWebSocket } from "@/hooks/useWebSocket";

const USERNAME_STORAGE_KEY = "tokendance:username";

export function JoinScreen() {
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const { setView, setUsername: setStoreUsername } = useChatStore();
  const { connect } = useWebSocket();

  // Load saved username from localStorage on mount.
  useEffect(() => {
    const saved = localStorage.getItem(USERNAME_STORAGE_KEY);
    if (saved) {
      setUsername(saved);
    }
  }, []);

  const handleJoin = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault();

      const trimmed = username.trim();
      if (!trimmed) {
        setError("请输入用户名");
        return;
      }

      if (trimmed.length < 2) {
        setError("用户名至少需要2个字符");
        return;
      }

      if (trimmed.length > 20) {
        setError("用户名不能超过20个字符");
        return;
      }

      if (!/^[一-龥a-zA-Z0-9_]+$/.test(trimmed)) {
        setError("用户名只能包含中文、英文、数字和下划线");
        return;
      }

      setError("");
      setConnecting(true);

      try {
        await connect(trimmed);
        // Save username to localStorage on success.
        localStorage.setItem(USERNAME_STORAGE_KEY, trimmed);
        setStoreUsername(trimmed);
        setView("chat");
      } catch (err) {
        const message = err instanceof Error ? err.message : "连接服务器失败，请确保服务器正在运行";
        setError(message);
        setConnecting(false);
      }
    },
    [username, connect, setStoreUsername, setView],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        handleJoin();
      }
    },
    [handleJoin],
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-[hsl(223,4%,13%)] p-4">
      <div className="animate-blur-in w-full max-w-md">
        {/* Card */}
        <div className="rounded-xl border border-[hsl(220,2.5%,23.5%)] bg-[hsl(231,4%,16%)] p-8 shadow-2xl">
          {/* Logo / Icon */}
          <div className="mb-6 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[hsl(231,4%,20%)] ring-1 ring-[hsl(220,2.5%,28.5%)]">
              <MessageCircle
                className="h-8 w-8"
                style={{ color: "oklch(71.2% 0.194 13.428)" }}
              />
            </div>
          </div>

          {/* Title */}
          <h1 className="mb-1 text-center text-2xl font-semibold text-foreground tracking-tight">
            TokenDance Chat
          </h1>
          <p className="mb-8 text-center text-sm text-muted-foreground">
            输入用户名加入公共聊天室
          </p>

          {/* Form */}
          <form onSubmit={handleJoin} className="space-y-4">
            <div>
              <input
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setError("");
                }}
                onKeyDown={handleKeyDown}
                placeholder="你的用户名..."
                autoFocus
                maxLength={20}
                disabled={connecting}
                className="w-full rounded-lg border border-[hsl(220,2.5%,23.5%)] bg-[hsl(223,4%,13%)] px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-all focus:border-[hsl(220,2.5%,35%)] focus:ring-1 focus:ring-[hsl(220,2.5%,35%)] disabled:opacity-50"
              />
              {error && (
                <p className="mt-2 text-xs text-destructive animate-fade-in">
                  {error}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={connecting || !username.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-all duration-200 disabled:opacity-50"
              style={{
                backgroundColor: "oklch(71.2% 0.194 13.428)",
                color: "#fff",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.filter = "brightness(1.1)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.filter = "brightness(1)";
              }}
            >
              {connecting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  连接中...
                </>
              ) : (
                <>
                  加入聊天
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer hint */}
        <p className="mt-6 text-center text-xs text-muted-foreground/50">
          公共聊天室 · 文明交流
        </p>
      </div>
    </div>
  );
}
