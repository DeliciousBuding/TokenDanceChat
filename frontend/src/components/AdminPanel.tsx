import { useEffect, useState } from "react";
import { X, Users, MessageSquare, Hash, Group, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

interface AdminStats {
  total_messages: number;
  active_connections: number;
  rooms: number;
  groups: number;
  friends: number;
  registered_users: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function AdminPanel({ open, onClose }: Props) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/admin/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const cards = [
    { key: "messages", icon: MessageSquare, value: stats?.total_messages ?? "-", color: "text-blue-400" },
    { key: "connections", icon: Activity, value: stats?.active_connections ?? "-", color: "text-green-400" },
    { key: "users", icon: Users, value: stats?.registered_users ?? "-", color: "text-violet-400" },
    { key: "rooms", icon: Hash, value: stats?.rooms ?? "-", color: "text-amber-400" },
    { key: "groups", icon: Group, value: stats?.groups ?? "-", color: "text-rose-400" },
    { key: "friends", icon: Users, value: stats?.friends ?? "-", color: "text-cyan-400" },
  ];

  return (
    <div
      className="fixed inset-0 z-[160] flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="animate-scale-in rounded-xl border border-border bg-card shadow-2xl w-[400px] max-h-[520px] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Admin Dashboard</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Stats grid */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {loading ? (
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-lg bg-muted animate-pulse h-24" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {cards.map(({ key, icon: Icon, value, color }) => (
                <div
                  key={key}
                  className={cn(
                    "rounded-lg border border-border bg-card p-4 hover:bg-accent/30 transition-colors"
                  )}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Icon className={cn("h-4 w-4", color)} />
                    <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">
                      {key}
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-foreground tabular-nums">
                    {value}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-4 py-2 text-center">
          <span className="text-[10px] text-muted-foreground/40">
            TokenDanceChat Server Stats
          </span>
        </div>
      </div>
    </div>
  );
}
