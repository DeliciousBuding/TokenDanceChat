import { useState, useCallback, useEffect } from "react";
import { X, Copy, Plus, Loader2, Key, Check } from "lucide-react";
import { useTranslation } from "@/i18n/context";
import { useChatStore } from "@/stores/chatStore";
import { generateInviteCode, listInviteCodes, type InviteCode } from "@/lib/api";

interface InviteCodeManagerProps {
  open: boolean;
  onClose: () => void;
}

export function InviteCodeManager({ open, onClose }: InviteCodeManagerProps) {
  const { t } = useTranslation();
  const { username } = useChatStore();
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [maxUses, setMaxUses] = useState(5);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const fetchCodes = useCallback(async () => {
    if (!username) return;
    setLoading(true);
    setError("");
    try {
      const result = await listInviteCodes(username);
      setCodes(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load invite codes");
    } finally {
      setLoading(false);
    }
  }, [username]);

  useEffect(() => {
    if (open && username) {
      fetchCodes();
    }
  }, [open, username, fetchCodes]);

  const handleGenerate = useCallback(async () => {
    if (!username) return;
    setGenerating(true);
    setError("");
    try {
      const result = await generateInviteCode(username, maxUses);
      setCodes((prev) => [
        {
          code: result.code,
          creator: username,
          max_uses: maxUses,
          use_count: 0,
          created_at: Date.now(),
        },
        ...prev,
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate invite code");
    } finally {
      setGenerating(false);
    }
  }, [username, maxUses]);

  const handleCopy = useCallback(async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch {
      // Clipboard API may not be available; ignore silently.
    }
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-fade-in">
      <div
        className="relative w-full max-w-md mx-4 rounded-xl border border-border bg-card p-6 shadow-2xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Key className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">
              {t("invite.inviteCodes")}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label={t("a11y.close")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Generate section */}
        <div className="mb-4 flex items-end gap-2">
          <div className="flex-1">
            <label className="mb-1 block text-[10px] font-medium text-muted-foreground">
              {t("invite.maxUses")}
            </label>
            <input
              type="number"
              value={maxUses}
              onChange={(e) => setMaxUses(Math.max(1, Math.min(999, parseInt(e.target.value) || 1)))}
              min={1}
              max={999}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-primary/50"
            />
          </div>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:brightness-110 transition-all duration-200 disabled:opacity-50"
          >
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {t("invite.generateCode")}
          </button>
        </div>

        {error && (
          <p className="mb-4 text-xs text-destructive animate-fade-in" role="alert">
            {error}
          </p>
        )}

        {/* Codes list */}
        <div className="max-h-64 overflow-y-auto space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : codes.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("invite.noCodes")}
            </p>
          ) : (
            codes.map((c) => (
              <div
                key={c.code}
                className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2.5 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <code className="text-sm font-mono text-foreground tracking-wider">
                    {c.code}
                  </code>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {t("invite.usesLeft")
                      .replace("{{used}}", String(c.use_count))
                      .replace("{{max}}", String(c.max_uses))}
                  </p>
                </div>
                <button
                  onClick={() => handleCopy(c.code)}
                  className="ml-2 rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  aria-label={t("invite.copyCode")}
                  title={t("invite.copyCode")}
                >
                  {copiedCode === c.code ? (
                    <Check className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Backdrop click to close */}
      <div className="absolute inset-0 -z-10" onClick={onClose} />
    </div>
  );
}
