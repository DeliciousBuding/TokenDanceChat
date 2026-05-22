import { memo, useMemo } from "react";
import { cn, avatarGradient } from "@/lib/utils";

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: "sm" | "md" | "lg";
  online?: boolean;
  className?: string;
  onClick?: () => void;
}

const sizeClasses = {
  sm: "h-7 w-7 text-[11px]",
  md: "h-8 w-8 text-xs",
  lg: "h-12 w-12 text-lg",
};

const onlineDotSizes = {
  sm: "h-2 w-2 -bottom-0.5 -right-0.5",
  md: "h-2.5 w-2.5 -bottom-0.5 -right-0.5",
  lg: "h-3 w-3 -bottom-0.5 -right-0.5",
};

const borderSizes = {
  sm: "border",
  md: "border-2",
  lg: "border-2",
};

export const Avatar = memo(function Avatar({
  src,
  name,
  size = "md",
  online,
  className,
  onClick,
}: AvatarProps) {
  const gradient = useMemo(() => avatarGradient(name), [name]);
  const initial = useMemo(() => {
    const displayName = name || "?";
    const ch = displayName.charAt(0);
    // Try to get first ASCII letter/Chinese char that is not empty.
    return ch || "?";
  }, [name]);

  const Comp = onClick ? "button" : "div";

  return (
    <Comp
      onClick={onClick}
      className={cn(
        "relative flex-shrink-0",
        onClick && "cursor-pointer hover:scale-110 transition-transform",
        className,
      )}
      aria-label={name}
    >
      {src ? (
        <img
          src={src}
          alt={name}
          className={cn(
            "rounded-full object-cover ring-1 ring-white/10",
            sizeClasses[size],
          )}
          onError={(e) => {
            // Hide broken image and show initials fallback.
            (e.target as HTMLImageElement).style.display = "none";
            const fallback = (e.target as HTMLImageElement).nextElementSibling;
            if (fallback) {
              (fallback as HTMLElement).style.display = "flex";
            }
          }}
        />
      ) : null}
      <div
        className={cn(
          "flex items-center justify-center rounded-full font-semibold text-white",
          sizeClasses[size],
          src ? "hidden" : "flex",
        )}
        style={{ background: gradient }}
      >
        {initial.toUpperCase()}
      </div>
      {/* Fallback div (hidden initially, shown when img errors) */}
      {src && (
        <div
          className={cn(
            "hidden items-center justify-center rounded-full font-semibold text-white",
            sizeClasses[size],
          )}
          style={{ background: gradient }}
          aria-hidden="true"
        >
          {initial.toUpperCase()}
        </div>
      )}
      {online && (
        <span
          className={cn(
            "absolute rounded-full bg-online animate-pulse-dot",
            borderSizes[size],
            "border-card",
            onlineDotSizes[size],
          )}
          role="status"
          aria-label="Online"
        />
      )}
    </Comp>
  );
});
