import { useRef, useEffect, useState, useCallback } from "react";
import {
  X,
  MoreVertical,
  Shield,
  User,
  Crown,
  LogOut,
  Pencil,
  Plus,
  Copy,
  Trash2,
  KeyRound,
  Webhook,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/i18n/context";
import { useChatStore } from "@/stores/chatStore";
import { chatAPI } from "@/lib/api";

interface GroupInfoPanelProps {
  groupName: string | null;
  onClose: () => void;
}

export function GroupInfoPanel({ groupName, onClose }: GroupInfoPanelProps) {
  const { t } = useTranslation();
  const {
    username,
    groups,
    groupWebhooks,
    latestCreatedWebhook,
    clearLatestCreatedWebhook,
  } = useChatStore();
  const [isVisible, setIsVisible] = useState(false);
  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    targetUser: string;
    x: number;
    y: number;
  } | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [confirmAction, setConfirmAction] = useState<{
    type: "kick" | "leave";
    target?: string;
  } | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (groupName) {
      requestAnimationFrame(() => setIsVisible(true));
      // Request group info from server.
      chatAPI.sendGroupInfo(groupName);
    } else {
      setIsVisible(false);
    }
  }, [groupName]);

  useEffect(() => {
    if (renameOpen && renameInputRef.current) {
      renameInputRef.current.focus();
    }
  }, [renameOpen]);

  const group = groupName ? groups[groupName] : undefined;
  const webhooks = groupName ? groupWebhooks[groupName] ?? [] : [];
  const createdWebhook =
    groupName && latestCreatedWebhook?.group_name === groupName
      ? latestCreatedWebhook
      : null;
  const currentUserRole =
    group && username ? group.roles[username] ?? "member" : "member";
  const isOwner = currentUserRole === "owner";
  const isAdmin = currentUserRole === "admin";
  const canManageWebhooks = isOwner || isAdmin;

  useEffect(() => {
    if (groupName && canManageWebhooks) {
      chatAPI.sendWebhookList(groupName);
    }
  }, [groupName, canManageWebhooks]);

  // Close context menu on scroll or click outside.
  useEffect(() => {
    const handler = () => setContextMenu(null);
    window.addEventListener("click", handler);
    window.addEventListener("scroll", handler, true);
    return () => {
      window.removeEventListener("click", handler);
      window.removeEventListener("scroll", handler, true);
    };
  }, []);

  const handleClose = useCallback(() => {
    setIsVisible(false);
    setTimeout(onClose, 200);
  }, [onClose]);

  const handleWebhookCreate = useCallback(() => {
    if (!groupName || !canManageWebhooks) return;
    chatAPI.sendWebhookCreate(groupName);
  }, [groupName, canManageWebhooks]);

  const handleWebhookDelete = useCallback((webhookID: string) => {
    if (!groupName || !canManageWebhooks) return;
    chatAPI.sendWebhookDelete(groupName, webhookID);
  }, [groupName, canManageWebhooks]);

  const handleCopy = useCallback(async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedValue(value);
      window.setTimeout(() => setCopiedValue(null), 1500);
    } catch {
      setCopiedValue(null);
    }
  }, []);

  const handleKick = useCallback((targetUser: string) => {
    setContextMenu(null);
    setConfirmAction({ type: "kick", target: targetUser });
  }, []);

  const confirmKick = useCallback(() => {
    if (!groupName || !confirmAction?.target) return;
    chatAPI.sendGroupKick(groupName, confirmAction.target);
    setConfirmAction(null);
  }, [groupName, confirmAction]);

  const handleSetRole = useCallback((targetUser: string, role: string) => {
    if (!groupName) return;
    setContextMenu(null);
    chatAPI.sendGroupSetRole(groupName, targetUser, role);
  }, [groupName]);

  const handleTransfer = useCallback((newOwner: string) => {
    if (!groupName) return;
    setContextMenu(null);
    chatAPI.sendGroupTransfer(groupName, newOwner);
  }, [groupName]);

  const handleRename = useCallback(() => {
    if (!groupName) return;
    const trimmed = newName.trim();
    if (!trimmed || trimmed === groupName) {
      setRenameOpen(false);
      return;
    }
    chatAPI.sendGroupRename(groupName, trimmed);
    setRenameOpen(false);
    setNewName("");
  }, [groupName, newName]);

  const handleLeave = useCallback(() => {
    setConfirmAction({ type: "leave" });
  }, []);

  const confirmLeave = useCallback(() => {
    if (!groupName) return;
    chatAPI.sendGroupLeave(groupName);
    setConfirmAction(null);
    handleClose();
  }, [groupName, handleClose]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, targetUser: string) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ targetUser, x: e.clientX, y: e.clientY });
    },
    [],
  );

  const roleBadge = (role: string) => {
    if (role === "owner") {
      return (
        <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-500">
          <Crown className="h-2.5 w-2.5" />
          {t("group.owner")}
        </span>
      );
    }
    if (role === "admin") {
      return (
        <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-blue-500">
          <Shield className="h-2.5 w-2.5" />
          {t("group.admin")}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
        <User className="h-2.5 w-2.5" />
        {t("group.member")}
      </span>
    );
  };

  // Sort members: owner first, then admins, then members alphabetically.
  const sortedMembers = [...(group?.members ?? [])].sort((a, b) => {
    if (!group) return 0;
    const roleA = group.roles[a] ?? "member";
    const roleB = group.roles[b] ?? "member";
    const order: Record<string, number> = { owner: 0, admin: 1, member: 2 };
    const diff = (order[roleA] ?? 2) - (order[roleB] ?? 2);
    if (diff !== 0) return diff;
    return a.localeCompare(b);
  });

  const canManageUser = (targetUser: string, targetRole: string) => {
    if (targetUser === username) return false;
    if (isOwner) return true;
    if (isAdmin && targetRole === "member") return true;
    return false;
  };

  if (!groupName || !group) return null;

  const buildWebhookURL = (url: string, secret?: string) => {
    const path = `/api/webhook/${url}${secret ? `?secret=${secret}` : ""}`;
    if (typeof window === "undefined") return path;
    return `${window.location.origin}${path}`;
  };

  return (
    <>
      {/* Backdrop overlay */}
      <div
        className={cn(
          "fixed inset-0 z-30 bg-black/30 backdrop-blur-sm transition-opacity duration-200",
          isVisible ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Slide-in panel */}
      <div
        className={cn(
          "fixed bottom-0 right-0 top-0 z-40 flex w-full max-w-sm flex-col border-l border-border bg-background shadow-2xl transition-transform duration-300 ease-in-out",
          "md:static md:z-0 md:shadow-none",
          isVisible ? "translate-x-0" : "translate-x-full",
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-foreground truncate">
              {groupName}
            </h2>
            <p className="text-xs text-muted-foreground">
              {t("group.members")}: {group.members.length}
            </p>
          </div>
          <button
            onClick={handleClose}
            aria-label={t("thread.close")}
            className="ml-2 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Group actions */}
        <div className="border-b border-border/50 px-4 py-2 space-y-1">
          {isOwner && (
            <>
              {renameOpen ? (
                <div className="flex items-center gap-2">
                  <input
                    ref={renameInputRef}
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRename();
                      if (e.key === "Escape") { setRenameOpen(false); setNewName(""); }
                    }}
                    placeholder={t("group.renamePlaceholder")}
                    className="flex-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                  />
                  <button
                    onClick={handleRename}
                    className="rounded-lg px-2.5 py-1.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    {t("group.renameGroup")}
                  </button>
                  <button
                    onClick={() => { setRenameOpen(false); setNewName(""); }}
                    className="rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                  >
                    {t("forward.cancel")}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { setRenameOpen(true); setNewName(groupName); }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-foreground/70 hover:bg-muted hover:text-foreground transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  {t("group.renameGroup")}
                </button>
              )}
            </>
          )}
          <button
            onClick={handleLeave}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-destructive/70 hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            {t("group.leaveGroup")}
          </button>
        </div>

        {/* Webhook management */}
        {canManageWebhooks && (
          <div className="border-b border-border/50 px-4 py-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <Webhook className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground">
                    {t("group.webhooks")}
                  </p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {t("group.webhookDescription")}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleWebhookCreate}
                className="inline-flex flex-shrink-0 items-center gap-1 rounded-lg bg-primary px-2 py-1.5 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Plus className="h-3 w-3" />
                {t("group.createWebhook")}
              </button>
            </div>

            {createdWebhook && (
              <div className="rounded-lg border border-primary/25 bg-primary/5 p-2.5">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <KeyRound className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
                    <p className="text-[11px] font-medium text-foreground">
                      {t("group.webhookSecretOnce")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={clearLatestCreatedWebhook}
                    className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={t("thread.close")}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
                <div className="space-y-1.5">
                  <button
                    type="button"
                    onClick={() => handleCopy(buildWebhookURL(createdWebhook.url, createdWebhook.secret))}
                    className="flex w-full items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-left hover:bg-muted/60"
                    title={buildWebhookURL(createdWebhook.url, createdWebhook.secret)}
                  >
                    <Copy className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-[10px] font-mono text-foreground">
                      {buildWebhookURL(createdWebhook.url, createdWebhook.secret)}
                    </span>
                  </button>
                  <p className="text-[10px] text-muted-foreground">
                    {copiedValue === buildWebhookURL(createdWebhook.url, createdWebhook.secret)
                      ? t("group.webhookCopied")
                      : t("group.webhookSecretHint")}
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              {webhooks.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-2 py-2 text-[11px] text-muted-foreground">
                  {t("group.noWebhooks")}
                </p>
              ) : (
                webhooks.map((webhook) => {
                  const displayURL = buildWebhookURL(webhook.url);
                  return (
                    <div
                      key={webhook.id}
                      className="rounded-lg border border-border bg-card/60 px-2 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleCopy(displayURL)}
                          className="min-w-0 flex-1 truncate rounded-md bg-muted/50 px-2 py-1 text-left font-mono text-[10px] text-foreground hover:bg-muted"
                          title={displayURL}
                        >
                          {displayURL}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopy(displayURL)}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                          aria-label={t("group.copyWebhook")}
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleWebhookDelete(webhook.id)}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          aria-label={t("group.deleteWebhook")}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                      <p className="mt-1 truncate text-[10px] text-muted-foreground">
                        {t("group.webhookCreatedBy", { name: webhook.created_by || "-" })}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Member list */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
            {t("group.members")} &mdash; {group.members.length}
          </p>
          {sortedMembers.map((member) => {
            const role = group.roles[member] ?? "member";
            const isSelf = member === username;
            const showContextMenu = canManageUser(member, role);
            return (
              <div
                key={member}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors",
                  showContextMenu && "cursor-context-menu hover:bg-muted/50",
                )}
                onContextMenu={(e) => showContextMenu && handleContextMenu(e, member)}
              >
                {/* Avatar */}
                <div className="flex-shrink-0 h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                  {member.slice(0, 1).toUpperCase()}
                </div>
                {/* Name and role */}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-foreground truncate">
                    {member}
                    {isSelf && (
                      <span className="ml-1 text-[10px] text-muted-foreground/50">
                        ({t("sidebar.you")})
                      </span>
                    )}
                  </div>
                  {roleBadge(role)}
                </div>
                {/* Context menu trigger */}
                {showContextMenu && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleContextMenu(e as unknown as React.MouseEvent, member); }}
                    className="flex-shrink-0 rounded p-1 text-muted-foreground/40 hover:text-foreground hover:bg-muted transition-colors"
                    aria-label={t("message.contextMenu")}
                  >
                    <MoreVertical className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 rounded-lg border border-border bg-card shadow-2xl py-1 animate-scale-in"
          style={{ left: contextMenu.x, top: contextMenu.y, minWidth: "160px" }}
          onClick={(e) => e.stopPropagation()}
        >
          {isOwner && (
            <>
              <button
                className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground/80 hover:bg-accent transition-colors"
                onClick={() => handleTransfer(contextMenu.targetUser)}
              >
                <Crown className="h-3 w-3" />
                {t("group.transferOwnership")}
              </button>
              {group.roles[contextMenu.targetUser] === "admin" ? (
                <button
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground/80 hover:bg-accent transition-colors"
                  onClick={() => handleSetRole(contextMenu.targetUser, "member")}
                >
                  <User className="h-3 w-3" />
                  {t("group.demoteMember")}
                </button>
              ) : (
                <button
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground/80 hover:bg-accent transition-colors"
                  onClick={() => handleSetRole(contextMenu.targetUser, "admin")}
                >
                  <Shield className="h-3 w-3" />
                  {t("group.promoteAdmin")}
                </button>
              )}
              <div className="border-t border-border my-1" />
            </>
          )}
          {isAdmin && group.roles[contextMenu.targetUser] === "member" && (
            <>
              <button
                className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground/80 hover:bg-accent transition-colors"
                onClick={() => handleSetRole(contextMenu.targetUser, "admin")}
              >
                <Shield className="h-3 w-3" />
                {t("group.promoteAdmin")}
              </button>
              <div className="border-t border-border my-1" />
            </>
          )}
          <button
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-destructive/80 hover:bg-destructive/10 hover:text-destructive transition-colors"
            onClick={() => handleKick(contextMenu.targetUser)}
          >
            <LogOut className="h-3 w-3" />
            {t("group.kickMember")}
          </button>
        </div>
      )}

      {/* Confirm dialog */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="rounded-xl border border-border bg-card shadow-2xl p-5 max-w-xs w-full mx-4 animate-scale-in">
            <h3 className="text-sm font-semibold text-foreground">
              {confirmAction.type === "kick"
                ? t("group.kickConfirm", { name: confirmAction.target ?? "" })
                : t("group.leaveGroupConfirm")}
            </h3>
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setConfirmAction(null)}
                className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                {t("forward.cancel")}
              </button>
              <button
                onClick={confirmAction.type === "kick" ? confirmKick : confirmLeave}
                className="rounded-lg px-3 py-1.5 text-xs font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
              >
                {confirmAction.type === "kick" ? t("group.kickMember") : t("group.leaveGroup")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
