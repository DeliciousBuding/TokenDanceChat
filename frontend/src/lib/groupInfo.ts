import type { WSMessage } from "@/lib/api";

export interface GroupMemberRole {
  username: string;
  role: string;
}

const VALID_ROLES = new Set(["owner", "admin", "member"]);

function normalizeRole(role: unknown): string {
  return typeof role === "string" && VALID_ROLES.has(role) ? role : "member";
}

export function normalizeGroupInfoMembers(msg: WSMessage): GroupMemberRole[] {
  const source = Array.isArray(msg.group_members)
    ? msg.group_members
    : Array.isArray(msg.members)
      ? msg.members
      : [];

  return source.flatMap((member) => {
    if (typeof member === "string") {
      return [{ username: member, role: "member" }];
    }
    if (!member || typeof member !== "object") {
      return [];
    }
    const raw = member as Record<string, unknown>;
    return typeof raw.username === "string"
      ? [{ username: raw.username, role: normalizeRole(raw.role) }]
      : [];
  });
}
