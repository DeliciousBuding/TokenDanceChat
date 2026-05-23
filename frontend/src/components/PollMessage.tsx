import { memo, useMemo, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/stores/chatStore";
import { chatAPI, type PollData } from "@/lib/api";
import { useTranslation } from "@/i18n/context";

interface PollMessageProps {
  poll: PollData;
  messageId: string;
}

export const PollMessage = memo(function PollMessage({ poll, messageId }: PollMessageProps) {
  const { t } = useTranslation();
  const username = useChatStore((s) => s.username);
  const [selectedOptions, setSelectedOptions] = useState<Set<number>>(new Set());
  const [hasVoted, setHasVoted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Compute which options the current user has voted for from the poll data.
  const userVotedIndices = useMemo(() => {
    if (!username) return new Set<number>();
    const indices = new Set<number>();
    if (poll.voters) {
      for (const [idxStr, voters] of Object.entries(poll.voters)) {
        const idx = Number(idxStr);
        if (voters.includes(username)) {
          indices.add(idx);
        }
      }
    }
    return indices;
  }, [poll.voters, username]);

  const totalVotes = useMemo(() => {
    return Object.values(poll.votes).reduce((sum, count) => sum + count, 0);
  }, [poll.votes]);

  const handleOptionClick = useCallback(
    (index: number) => {
      if (poll.is_closed) return;

      if (poll.multiple_choice) {
        setSelectedOptions((prev) => {
          const next = new Set(prev);
          if (userVotedIndices.has(index) || next.has(index)) {
            next.delete(index);
          } else {
            next.add(index);
          }
          return next;
        });
      } else {
        setSelectedOptions(new Set([index]));
      }
    },
    [poll.is_closed, poll.multiple_choice, userVotedIndices],
  );

  const handleVote = useCallback(async () => {
    if (selectedOptions.size === 0) return;
    setError(null);
    try {
      for (const idx of selectedOptions) {
        await chatAPI.sendPollVote(messageId, idx);
      }
      setHasVoted(true);
      setSelectedOptions(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [selectedOptions, messageId]);

  const handleClosePoll = useCallback(async () => {
    setError(null);
    try {
      await chatAPI.sendPollClose(messageId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [messageId]);

  const isOwnPoll = poll.creator === username;
  const isClosed = poll.is_closed;

  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3 w-full max-w-[380px] shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-primary flex-shrink-0"
        >
          <path d="M3 3v18h18" />
          <path d="M7 16h2" />
          <path d="M11 10h2" />
          <path d="M15 7h2" />
          <path d="M7 12h2" />
          <path d="M11 14h2" />
          <path d="M15 10h2" />
        </svg>
        <span className="text-sm font-semibold text-foreground">
          {poll.question}
        </span>
        {isClosed && (
          <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {t("poll.finalResults")}
          </span>
        )}
      </div>

      {/* Options */}
      <div className="space-y-1.5">
        {poll.options.map((option, idx) => {
          const voteCount = poll.votes[idx] || 0;
          const percentage = totalVotes > 0 ? (voteCount / totalVotes) * 100 : 0;
          const isUserVoted = userVotedIndices.has(idx);
          const isSelected = !isClosed && selectedOptions.has(idx);
          const showBar = totalVotes > 0 || isClosed;
          const barWidth = isClosed ? Math.max(percentage, 2) : percentage;

          return (
            <div key={idx} className="relative">
              <button
                onClick={() => handleOptionClick(idx)}
                disabled={isClosed || (hasVoted && !poll.multiple_choice)}
                className={cn(
                  "relative z-10 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors",
                  "border border-transparent",
                  isUserVoted
                    ? "bg-primary/10 border-primary/30 text-foreground"
                    : isSelected
                      ? "bg-accent border-primary/30 text-foreground"
                      : "hover:bg-accent text-foreground/80",
                  (isClosed || (hasVoted && !poll.multiple_choice))
                    ? "cursor-default"
                    : "cursor-pointer",
                )}
              >
                {/* Background bar */}
                {showBar && barWidth > 0 && (
                  <div
                    className={cn(
                      "absolute inset-0 rounded-lg transition-all duration-500 ease-out",
                      isUserVoted
                        ? "bg-primary/10"
                        : "bg-primary/5",
                    )}
                    style={{ width: `${barWidth}%` }}
                  />
                )}

                <span className="relative z-10 flex items-center gap-2 truncate flex-1">
                  {isUserVoted && (
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-primary flex-shrink-0"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                  {!isUserVoted && isSelected && (
                    <div className="flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-full border-2 border-primary">
                      <div className="h-2 w-2 rounded-full bg-primary" />
                    </div>
                  )}
                  <span className="truncate">{option}</span>
                </span>

                {(showBar || isClosed) && (
                  <span className="relative z-10 ml-2 text-xs tabular-nums text-muted-foreground flex-shrink-0">
                    {Math.round(percentage)}%
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="mt-2.5 flex items-center gap-2">
        {/* Vote count */}
        <span className="text-xs text-muted-foreground/60">
          {t("poll.votes", { count: totalVotes })}
        </span>

        {/* Vote button (only shows when options are selected and poll is not closed) */}
        {!isClosed && !hasVoted && selectedOptions.size > 0 && (
          <button
            onClick={handleVote}
            className="ml-auto rounded-lg bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:brightness-110 transition-all"
          >
            {t("poll.vote")}
          </button>
        )}

        {/* Close button (only poll creator can see) */}
        {!isClosed && isOwnPoll && (
          <button
            onClick={handleClosePoll}
            className="ml-auto rounded-lg border border-border px-2.5 py-1 text-xxs text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-colors"
          >
            {t("poll.closed")}
          </button>
        )}
      </div>

      {/* Error feedback */}
      {error && (
        <p className="text-xs text-destructive mt-1 animate-fade-in" role="alert">
          {error}
        </p>
      )}
    </div>
  );
});
