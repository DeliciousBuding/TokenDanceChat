import { useState, useCallback, useRef, useEffect, type KeyboardEvent } from "react";
import { Clock, X, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/i18n/context";

interface ScheduleButtonProps {
  onSchedule: (sendAt: number) => void;
  disabled?: boolean;
  scheduled: boolean;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

export function ScheduleButton({ onSchedule, disabled, scheduled }: ScheduleButtonProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedHour, setSelectedHour] = useState(12);
  const [selectedMinute, setSelectedMinute] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
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

  const handleOpen = useCallback(() => {
    // Initialize to one hour from now
    const now = new Date();
    const next = new Date(now.getTime() + 60 * 60 * 1000);
    setCalendarMonth(next);
    setSelectedDate(next);
    setSelectedHour(next.getHours());
    setSelectedMinute(Math.floor(next.getMinutes() / 5) * 5);
    setOpen(true);
  }, []);

  const handleConfirm = useCallback(() => {
    if (!selectedDate) return;
    const d = new Date(selectedDate);
    d.setHours(selectedHour, selectedMinute, 0, 0);
    const sendAt = d.getTime();
    if (sendAt <= Date.now()) return; // Must be in future
    onSchedule(sendAt);
    setOpen(false);
  }, [selectedDate, selectedHour, selectedMinute, onSchedule]);

  const prevMonth = useCallback(() => {
    setCalendarMonth((prev) => {
      const d = new Date(prev);
      d.setMonth(d.getMonth() - 1);
      return d;
    });
  }, []);

  const nextMonth = useCallback(() => {
    setCalendarMonth((prev) => {
      const d = new Date(prev);
      d.setMonth(d.getMonth() + 1);
      return d;
    });
  }, []);

  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;

  const isToday = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` === todayStr;

  const dayNames = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = Array.from({ length: 12 }, (_, i) => i * 5);

  // Quick presets
  const quickPresets = [
    { label: t("schedule.today"), getDate: () => { const d = new Date(); d.setHours(21, 0, 0, 0); return d; } },
    { label: t("schedule.tomorrow"), getDate: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d; } },
  ];

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
      if (e.key === "Enter" && open && selectedDate) {
        e.preventDefault();
        handleConfirm();
      }
    },
    [open, selectedDate, handleConfirm],
  );

  return (
    <div ref={containerRef} className="relative" onKeyDown={handleKeyDown}>
      <button
        type="button"
        onClick={handleOpen}
        disabled={disabled}
        aria-label={t("schedule.scheduleMessage")}
        data-visual="composer-tool"
        className={cn(
          "flex h-11 w-11 flex-shrink-0 cursor-pointer items-center justify-center rounded-xl transition-all duration-200 [&_svg]:h-[18px] [&_svg]:w-[18px]",
          scheduled
            ? "text-[var(--accent)] bg-[var(--accent)]/10 animate-pulse-once"
            : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]",
          "disabled:cursor-not-allowed disabled:opacity-30",
        )}
      >
        <Clock size={15} strokeWidth={1.5} className={cn(scheduled && "text-[var(--accent)]")} />
      </button>

      {open && (
        <div className="absolute bottom-full right-0 mb-2 z-30 w-80 overflow-hidden rounded-xl border border-border bg-card shadow-xl animate-scale-in">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">
              {t("schedule.scheduleMessage")}
            </h3>
            <button
              onClick={() => setOpen(false)}
              className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              aria-label={t("schedule.cancelSchedule")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Quick presets */}
          <div className="flex gap-2 px-4 py-2 border-b border-border/50">
            {quickPresets.map((preset) => {
              const d = preset.getDate();
              return (
                <button
                  key={preset.label}
                  onClick={() => {
                    setCalendarMonth(d);
                    setSelectedDate(d);
                    setSelectedHour(d.getHours());
                    setSelectedMinute(Math.floor(d.getMinutes() / 5) * 5);
                  }}
                  className={cn(
                    "flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                    selectedDate && isToday(d)
                      ? "bg-primary text-primary-foreground"
                      : "bg-accent text-muted-foreground hover:bg-secondary hover:text-foreground",
                  )}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          {/* Calendar */}
          <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <button
                onClick={prevMonth}
                className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                aria-label={t("a11y.prevMonth")}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="text-xs font-medium text-foreground">
                {calendarMonth.toLocaleDateString(
                  navigator.language.startsWith("zh") ? "zh-CN" : "en-US",
                  { year: "numeric", month: "long" },
                )}
              </span>
              <button
                onClick={nextMonth}
                className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                aria-label={t("a11y.nextMonth")}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Day names */}
            <div className="grid grid-cols-7 mb-1">
              {dayNames.map((name) => (
                <div key={name} className="text-center text-[10px] text-muted-foreground/50 py-1">
                  {name}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-0.5">
              {Array.from({ length: firstDay }, (_, i) => (
                <div key={`empty-${i}`} />
              ))}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const day = i + 1;
                const d = new Date(year, month, day);
                const dStr = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
                const selectedStr = selectedDate ? `${selectedDate.getFullYear()}-${selectedDate.getMonth()}-${selectedDate.getDate()}` : "";
                const isSelected = selectedStr === dStr;
                const isPast = d.getTime() < new Date(new Date().toDateString()).getTime();
                return (
                  <button
                    key={day}
                    onClick={() => !isPast && setSelectedDate(d)}
                    disabled={isPast}
                    className={cn(
                      "flex items-center justify-center h-8 w-full rounded-md text-xs transition-colors",
                      isSelected
                        ? "bg-primary text-primary-foreground font-semibold"
                        : isPast
                          ? "text-muted-foreground/20 cursor-not-allowed"
                          : "text-foreground/70 hover:bg-accent hover:text-foreground",
                    )}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Time picker */}
          <div className="px-4 py-3 border-t border-border/50">
            <label className="text-[10px] text-muted-foreground/60 mb-1.5 block">
              {t("schedule.sendAt")}
            </label>
            <div className="flex items-center gap-3">
              {/* Hour */}
              <div className="flex-1">
                <select
                  value={selectedHour}
                  onChange={(e) => setSelectedHour(Number(e.target.value))}
                  className="w-full rounded-lg border border-border bg-accent px-2 py-1.5 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                  aria-label={t("a11y.hour")}
                >
                  {hours.map((h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, "0")}
                    </option>
                  ))}
                </select>
              </div>
              <span className="text-muted-foreground/40 text-sm">:</span>
              {/* Minute */}
              <div className="flex-1">
                <select
                  value={selectedMinute}
                  onChange={(e) => setSelectedMinute(Number(e.target.value))}
                  className="w-full rounded-lg border border-border bg-accent px-2 py-1.5 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                  aria-label={t("a11y.minute")}
                >
                  {minutes.map((m) => (
                    <option key={m} value={m}>
                      {String(m).padStart(2, "0")}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Selected time preview */}
          {selectedDate && (
            <div className="px-4 pb-2">
              <p className="text-[10px] text-muted-foreground/50">
                {selectedDate.toLocaleDateString(
                  navigator.language.startsWith("zh") ? "zh-CN" : "en-US",
                  { weekday: "short", month: "short", day: "numeric" },
                )}
                {" "}
                {String(selectedHour).padStart(2, "0")}:{String(selectedMinute).padStart(2, "0")}
              </p>
            </div>
          )}

          {/* Confirm / Cancel */}
          <div className="flex gap-2 px-4 py-3 border-t border-border">
            <button
              onClick={() => setOpen(false)}
              className="flex-1 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              {t("schedule.cancelSchedule")}
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selectedDate}
              className={cn(
                "flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors",
                selectedDate
                  ? "bg-primary text-primary-foreground hover:brightness-110"
                  : "bg-muted text-muted-foreground cursor-not-allowed",
              )}
            >
              {t("schedule.confirmSchedule")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
