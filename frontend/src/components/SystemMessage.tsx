import { cn, formatTime } from "@/lib/utils";

interface SystemMessageProps {
  content: string;
  timestamp: number;
}

export function SystemMessage({ content, timestamp }: SystemMessageProps) {
  return (
    <div className="flex items-center justify-center px-4 py-2 animate-fade-in">
      <div className="flex items-center gap-3 max-w-md">
        {/* Left dot/line */}
        <div className="h-px flex-1 bg-[hsl(220,2.5%,18%)]" />

        {/* Content */}
        <div className="flex flex-col items-center">
          <span className="text-xs text-muted-foreground/70 font-normal">
            {content}
          </span>
          <span className="mt-0.5 text-[10px] text-muted-foreground/40">
            {formatTime(timestamp)}
          </span>
        </div>

        {/* Right dot/line */}
        <div className="h-px flex-1 bg-[hsl(220,2.5%,18%)]" />
      </div>
    </div>
  );
}
