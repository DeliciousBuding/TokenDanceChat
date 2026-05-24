import { X } from "lucide-react";
import { useTranslation } from "@/i18n/context";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "destructive" | "default";
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onCancel}
      />

      {/* Dialog */}
      <div
        className="relative z-10 w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-2xl animate-scale-in"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
      >
        {/* Close button */}
        <button
          onClick={onCancel}
          className="absolute top-3 right-3 rounded-full p-1 text-muted-foreground/50 hover:text-muted-foreground hover:bg-accent transition-colors"
          aria-label={t("a11y.close")}
        >
          <X className="h-3.5 w-3.5" />
        </button>

        <h3 className="text-sm font-semibold text-foreground mb-1">{title}</h3>
        {message && (
          <p className="text-xs text-muted-foreground/70 leading-relaxed mb-4">
            {message}
          </p>
        )}

        <div className="flex items-center gap-2 justify-end">
          <button
            onClick={onCancel}
            className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={
              variant === "destructive"
                ? "rounded-lg px-3 py-1.5 text-xs font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
                : "rounded-lg px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground hover:brightness-110 transition-colors"
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
