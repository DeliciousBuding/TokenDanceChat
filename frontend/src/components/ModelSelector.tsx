import { useState, useCallback, useRef, useEffect } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useTranslation } from "@/i18n/context";
import { cn } from "@/lib/utils";
import { modelCatalog, type AssistantModel } from "@/lib/assistantRegistry";
import { AssistantIcon } from "@/components/AssistantIcon";

interface ModelSelectorProps {
  /** Currently selected model id */
  selectedModelId?: string;
  /** Called when a model is selected */
  onSelect: (model: AssistantModel) => void;
  /** Optional className for the trigger button */
  className?: string;
  /** Whether the selector is disabled */
  disabled?: boolean;
}

export function ModelSelector({
  selectedModelId,
  onSelect,
  className,
  disabled,
}: ModelSelectorProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const [pulseModelId, setPulseModelId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedModel = modelCatalog.find((m) => m.id === selectedModelId) ?? null;

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((prev) => Math.min(prev + 1, modelCatalog.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === "Enter" && selectedIdx >= 0) {
        e.preventDefault();
        handleSelect(modelCatalog[selectedIdx]);
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, selectedIdx]);

  const handleSelect = useCallback(
    (model: AssistantModel) => {
      onSelect(model);
      setOpen(false);
      // Visual feedback: pulse the newly selected model
      setPulseModelId(model.id);
      setTimeout(() => setPulseModelId(null), 600);
    },
    [onSelect],
  );

  const toggleOpen = useCallback(() => {
    if (disabled) return;
    setOpen((prev) => !prev);
    setSelectedIdx(modelCatalog.findIndex((m) => m.id === selectedModelId));
  }, [disabled, selectedModelId]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={toggleOpen}
        disabled={disabled}
        aria-label={t("model.selectModel")}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          "flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground/80 transition-all duration-200",
          "hover:border-ring/50 hover:bg-accent",
          "disabled:opacity-30 disabled:cursor-not-allowed",
          open && "border-ring/50 bg-accent",
          pulseModelId && "animate-pulse-once ring-2 ring-primary/40",
          className,
        )}
      >
        {selectedModel ? (
          <>
            <AssistantIcon model={selectedModel} size="sm" />
            <span className="truncate max-w-[120px]">{selectedModel.providerName}</span>
          </>
        ) : (
          <span className="text-muted-foreground">{t("model.selectModel")}</span>
        )}
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-muted-foreground/60 transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={t("model.selectModel")}
          className="absolute top-full left-0 right-0 z-30 mt-1 overflow-hidden rounded-lg border border-border bg-card shadow-2xl animate-scale-in"
          style={{ minWidth: "220px" }}
        >
          {modelCatalog.map((model, idx) => (
            <button
              key={model.id}
              role="option"
              aria-selected={model.id === selectedModelId}
              onClick={() => handleSelect(model)}
              onMouseEnter={() => setSelectedIdx(idx)}
              className={cn(
                "flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors",
                model.id === selectedModelId
                  ? "bg-accent text-foreground"
                  : idx === selectedIdx
                    ? "bg-accent/60 text-foreground"
                    : "text-foreground/70 hover:bg-accent hover:text-foreground",
              )}
            >
              <AssistantIcon model={model} size="sm" />
              <div className="min-w-0 flex-1">
                <span className="block truncate text-sm">{model.providerName}</span>
                <span className="block truncate text-[10px] text-muted-foreground/55">
                  {model.name} · {model.context}
                </span>
              </div>
              {model.id === selectedModelId && (
                <Check className="h-4 w-4 flex-shrink-0 text-primary" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
