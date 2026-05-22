import { describe, expect, it } from "vitest";
import { normalizeGroupInfoMembers } from "@/lib/groupInfo";

describe("normalizeGroupInfoMembers", () => {
  it("uses backend group_members roles from group_info messages", () => {
    expect(
      normalizeGroupInfoMembers({
        type: "group_info",
        group: "Team",
        group_members: [
          { username: "Alice", role: "owner" },
          { username: "Bob", role: "admin" },
          { username: "Eve", role: "member" },
        ],
      }),
    ).toEqual([
      { username: "Alice", role: "owner" },
      { username: "Bob", role: "admin" },
      { username: "Eve", role: "member" },
    ]);
  });

  it("keeps legacy members arrays compatible", () => {
    expect(
      normalizeGroupInfoMembers({
        type: "group_info",
        group: "Team",
        members: ["Alice", "Bob"],
      }),
    ).toEqual([
      { username: "Alice", role: "member" },
      { username: "Bob", role: "member" },
    ]);
  });

  it("defaults malformed member roles without dropping valid users", () => {
    expect(
      normalizeGroupInfoMembers({
        type: "group_info",
        group: "Team",
        group_members: [
          { username: "Alice", role: "superuser" },
          { username: "Bob" },
          { role: "owner" },
          null,
        ],
      }),
    ).toEqual([
      { username: "Alice", role: "member" },
      { username: "Bob", role: "member" },
    ]);
  });
});
