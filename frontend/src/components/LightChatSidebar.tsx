import { Bot, DoorOpen, Hash, LogIn, LogOut, Settings, X } from "lucide-react";
import { AssistantIcon } from "@/components/AssistantIcon";
import { useServerConfig } from "@/hooks/useServerConfig";
import { useTranslation } from "@/i18n/context";
import { assistants, modelDisplayName } from "@/lib/assistantRegistry";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/stores/chatStore";

export type ChatSpace = "public" | string;

interface LightChatSidebarProps {
  activeSpace: ChatSpace;
  activeAssistantId: string;
  onSelectSpace: (space: ChatSpace) => void;
  onClose?: () => void;
  onOpenSettings: () => void;
  onDisconnect: () => void;
}

export function LightChatSidebar({
  activeSpace,
  activeAssistantId,
  onSelectSpace,
  onClose,
  onOpenSettings,
  onDisconnect,
}: LightChatSidebarProps) {
  const { t } = useTranslation();
  const { connected, username, isGuest, setShowAuthModal } = useChatStore();
  const serverConfig = useServerConfig();
  const modelLabel = modelDisplayName(serverConfig?.model || assistants[0].model.id);
  const displayName = username || t("join.buttonJoin");
  const statusText = connected
    ? isGuest
      ? t("sidebar.guestMode")
      : t("sidebar.online")
    : t("sidebar.connecting");

  return (
    <aside
      className="td-chat-sidebar flex h-full w-[288px] flex-col border-r border-[var(--border-base)]"
      aria-label={t("chat.publicChat")}
      data-visual="light-chat-sidebar"
    >
      <div className="td-chat-sidebar-header flex items-center gap-3 border-b border-[var(--border-base)] px-4 py-4">
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-[var(--border-glass)] bg-[var(--surface)] shadow-[var(--shadow-hairline)]">
          <img
            src="/tokendance-mark-transparent.svg"
            alt="TokenDance"
            className="h-8 w-8"
            draggable={false}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-[var(--text-primary)]">TokenDanceChat</p>
          <p className="truncate text-[11px] text-[var(--text-secondary)]">{t("chat.subtitle")}</p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={t("a11y.closeSidebar")}
            className="td-chat-header-action flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[var(--radius-control)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 py-4 scrollbar-thin">
        <section aria-label={t("sidebar.publicChat")}>
          <SectionLabel icon={<Hash className="h-3 w-3" />}>{t("sidebar.publicChat")}</SectionLabel>
          <SpaceButton
            active={activeSpace === "public"}
            icon={<Hash className="h-4 w-4" />}
            title={t("sidebar.publicChat")}
            subtitle={t("sidebar.publicChatSub")}
            onClick={() => onSelectSpace("public")}
          />
        </section>

        <section aria-label={t("sidebar.aiAssistants")}>
          <SectionLabel icon={<Bot className="h-3 w-3" />}>{t("sidebar.aiAssistants")}</SectionLabel>
          <div className="space-y-1.5">
            {assistants.map((assistant) => (
              <SpaceButton
                key={assistant.id}
                active={activeSpace === assistant.id || (activeSpace !== "public" && activeAssistantId === assistant.id)}
                icon={<AssistantIcon assistant={assistant} size="sm" />}
                title={assistant.name}
                subtitle={`${assistant.label} · ${modelLabel}`}
                onClick={() => onSelectSpace(assistant.id)}
              />
            ))}
          </div>
        </section>
      </div>

      <div className="td-chat-sidebar-footer border-t border-[var(--border-base)] px-3 py-3">
        <div className="td-chat-stream-card td-chat-stream-card-muted mb-2 flex items-center gap-2 px-3 py-2">
          <div
            className={cn(
              "h-2 w-2 rounded-full",
              connected ? "bg-[var(--success)]" : "bg-[var(--warning)]",
            )}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-medium text-[var(--text-primary)]">
              {displayName}
            </p>
            <p className="truncate text-[10px] text-[var(--text-tertiary)]">
              {statusText}
            </p>
          </div>
        </div>
        {isGuest && (
          <button
            type="button"
            onClick={() => setShowAuthModal(true)}
            className="mb-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-[var(--accent)]/10 px-3 text-[12px] font-medium text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/18"
            title={t("auth.guestUpgradeHint")}
          >
            <LogIn className="h-4 w-4" />
            {t("auth.loginOrRegister")}
          </button>
        )}
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={onOpenSettings}
            className="td-chat-header-action flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <Settings className="h-4 w-4" />
            {t("settings.openSettings")}
          </button>
          <button
            type="button"
            onClick={onDisconnect}
            className="td-chat-header-action flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] text-[12px] text-[var(--text-secondary)] hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="h-4 w-4" />
            {t("chat.leave")}
          </button>
        </div>
      </div>
    </aside>
  );
}

function SectionLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-1.5 flex items-center gap-1.5 px-2 text-[10px] font-semibold uppercase tracking-normal text-[var(--text-tertiary)]">
      {icon}
      {children}
    </div>
  );
}

interface SpaceButtonProps {
  active: boolean;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
}

function SpaceButton({ active, icon, title, subtitle, onClick }: SpaceButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "td-chat-list-row flex min-h-14 w-full items-center gap-3 rounded-[var(--radius-panel)] px-3 py-2 text-left transition-colors",
        active
          ? "border border-[var(--accent)]/25 bg-[var(--accent)]/10 text-[var(--text-primary)] shadow-[var(--td-shadow-sm)]"
          : "border border-transparent text-[var(--text-secondary)] hover:border-[var(--border-base)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]",
      )}
      aria-pressed={active}
    >
      <span
        className={cn(
          "flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[var(--radius-control)]",
          active ? "bg-[var(--accent)]/10 text-[var(--accent)]" : "bg-[var(--bg-1)] text-[var(--text-secondary)]",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold">{title}</span>
        <span className="block truncate text-[11px] text-[var(--text-tertiary)]">{subtitle}</span>
      </span>
      {active && <DoorOpen className="h-3.5 w-3.5 flex-shrink-0 text-[var(--accent)]" />}
    </button>
  );
}
