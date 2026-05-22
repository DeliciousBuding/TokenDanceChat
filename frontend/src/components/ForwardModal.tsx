import { useState } from "react";
import { Send, X, User, Users } from "lucide-react";
import { useChatStore } from "@/stores/chatStore";
import { useTranslation } from "@/i18n/context";
import type { ChatMessage } from "@/lib/api";

interface ForwardModalProps {
  message: ChatMessage;
  onClose: () => void;
  onForward: (messageID: string, toUsername: string) => void;
}

export function ForwardModal({ message, onClose, onForward }: ForwardModalProps) {
  const { t } = useTranslation();
  const { onlineUsers, username } = useChatStore();
  const [selectedUser, setSelectedUser] = useState("");

  const availableUsers = onlineUsers.filter((u) => u !== username);

  const handleForward = () => {
    if (selectedUser && message.id) {
      onForward(message.id, selectedUser);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md mx-4 rounded-xl border border-border bg-card shadow-2xl animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">{t("forward.title")}</h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-accent"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Original message preview */}
        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2 mb-1">
            <User className="h-3 w-3 text-muted-foreground/50" />
            <span className="text-xs text-muted-foreground/70">{message.username}</span>
          </div>
          <p className="text-xs text-foreground/70 bg-secondary rounded-md p-2 max-h-20 overflow-y-auto">
            {message.content.slice(0, 200)}
            {message.content.length > 200 ? "..." : ""}
          </p>
        </div>

        {/* User selector */}
        <div className="px-4 py-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <Users className="h-3 w-3" />
            {t("forward.selectRecipient")}
          </label>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {availableUsers.length === 0 ? (
              <p className="text-xs text-muted-foreground/50 py-2">
                {t("forward.noUsers")}
              </p>
            ) : (
              availableUsers.map((user) => (
                <button
                  key={user}
                  onClick={() => setSelectedUser(user)}
                  className={`w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm text-left transition-colors ${
                    selectedUser === user
                      ? "bg-accent text-foreground ring-1 ring-ring"
                      : "text-foreground/70 hover:bg-accent"
                  }`}
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-[10px] font-semibold text-foreground/80">
                    {user.charAt(0).toUpperCase()}
                  </span>
                  <span className="truncate">{user}</span>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            {t("forward.cancel")}
          </button>
          <button
            onClick={handleForward}
            disabled={!selectedUser}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
              selectedUser
                ? "bg-primary text-primary-foreground hover:brightness-110"
                : "bg-muted text-muted-foreground"
            }`}
          >
            <Send className="h-3 w-3" />
            {t("forward.forward")}
          </button>
        </div>
      </div>
    </div>
  );
}
