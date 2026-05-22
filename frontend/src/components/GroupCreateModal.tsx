import { useState, useCallback } from "react";
import { X, Check, Plus } from "lucide-react";
import { useChatStore } from "@/stores/chatStore";
import { useTranslation } from "@/i18n/context";
import { cn } from "@/lib/utils";

interface GroupCreateModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, members: string[]) => void;
}

export function GroupCreateModal({
  open,
  onClose,
  onCreate,
}: GroupCreateModalProps) {
  const { t } = useTranslation();
  const { friends, onlineUsers, username } = useChatStore();
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");

  // Available members: friends + online users (excluding self)
  const availableUsers = [...new Set([...friends, ...onlineUsers])].filter(
    (u) => u !== username,
  );

  const toggleMember = useCallback((user: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(user)) {
        next.delete(user);
      } else {
        next.add(user);
      }
      return next;
    });
  }, []);

  const handleCreate = useCallback(() => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t("group.nameErrorEmpty"));
      return;
    }
    if (trimmed.length > 30) {
      setError(t("group.nameErrorTooLong"));
      return;
    }
    onCreate(trimmed, [...selected]);
    setName("");
    setSelected(new Set());
    setError("");
    onClose();
  }, [name, selected, onCreate, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-sm mx-4 rounded-xl border border-border bg-card shadow-2xl animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="text-sm font-semibold text-foreground">
            {t("group.createTitle")}
          </h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Group name input */}
          <div>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError("");
              }}
              placeholder={t("group.namePlaceholder")}
              maxLength={30}
              autoFocus
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-[hsl(220,2.5%,35%)] transition-colors"
            />
            {error && (
              <p className="mt-1 text-xs text-destructive">{error}</p>
            )}
          </div>

          {/* Member selection */}
          {availableUsers.length > 0 && (
            <div>
              <p className="mb-2 text-xs text-muted-foreground">
                {t("group.selectMembers")}
              </p>
              <div className="max-h-40 overflow-y-auto space-y-1 border border-border rounded-lg p-2">
                {availableUsers.map((user) => (
                  <label
                    key={user}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer transition-colors",
                      selected.has(user)
                        ? "bg-accent text-foreground"
                        : "text-foreground/70 hover:bg-accent",
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-4 w-4 items-center justify-center rounded border transition-colors flex-shrink-0",
                        selected.has(user)
                          ? "border-accent bg-accent"
                          : "border-[hsl(220,2.5%,28%)]",
                      )}
                    >
                      {selected.has(user) && (
                        <Check className="h-3 w-3 text-white" />
                      )}
                    </div>
                    <input
                      type="checkbox"
                      checked={selected.has(user)}
                      onChange={() => toggleMember(user)}
                      className="sr-only"
                    />
                    <span className="text-sm">{user}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {availableUsers.length === 0 && (
            <p className="text-xs text-muted-foreground/50 text-center py-2">
              {t("group.noUsersAvailable")}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            {t("group.cancel")}
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim()}
            className="rounded-lg px-4 py-2 text-xs font-medium text-white transition-all duration-200 disabled:opacity-40"
            style={{ backgroundColor: "oklch(71.2% 0.194 13.428)" }}
          >
            <span className="flex items-center gap-1">
              <Plus className="h-3 w-3" />
              {t("group.create")}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
