import type {
  AgentRoleId,
  AgentStatus,
  RoleConfig,
} from "@agent-office/protocol";
import { isPathInsideWorktree } from "./command-policy.ts";

export function mapToolToAgentStatus(toolName: string): AgentStatus {
  const lower = toolName.toLowerCase();
  if (
    lower === "read" ||
    lower === "grep" ||
    lower === "glob" ||
    lower === "list" ||
    lower === "git.diff" ||
    lower === "git.log"
  ) {
    return "reading";
  }
  if (
    lower === "write" ||
    lower === "edit" ||
    lower === "apply_patch" ||
    lower.startsWith("write:")
  ) {
    return "writing";
  }
  if (lower === "bash" || lower === "run_command" || lower === "shell") {
    return "executing";
  }
  if (lower === "web_fetch" || lower === "web_search" || lower === "browse") {
    return "browsing";
  }
  if (lower === "ask_agent" || lower === "board.assign") {
    return "handoff";
  }
  if (lower === "ask_director") {
    return "waiting_approval";
  }
  return "thinking";
}

function matchesGlobPattern(relPath: string, globPattern: string): boolean {
  const cleanRel = relPath.replace(/\\/g, "/").replace(/^\.\//, "");
  const regexStr =
    "^" +
    globPattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*\*/g, "___DOUBLE_STAR___")
      .replace(/\*/g, "[^/]*")
      .replace(/___DOUBLE_STAR___/g, ".*") +
    "$";
  return new RegExp(regexStr).test(cleanRel);
}

export function canRoleUseTool(
  role: RoleConfig,
  toolName: string,
  targetRelPath?: string,
  worktreePath: string = "/worktree"
): { allowed: boolean; reason: string } {
  if (targetRelPath && !isPathInsideWorktree(worktreePath, targetRelPath)) {
    return {
      allowed: false,
      reason: `Target path "${targetRelPath}" escapes worktree "${worktreePath}"`,
    };
  }

  for (const entry of role.tools) {
    if (entry === toolName) {
      return { allowed: true, reason: `Tool "${toolName}" permitted for ${role.id}` };
    }
    if (entry.startsWith(`${toolName}:`) && targetRelPath) {
      const glob = entry.slice(toolName.length + 1);
      if (matchesGlobPattern(targetRelPath, glob)) {
        return {
          allowed: true,
          reason: `Tool "${toolName}" on "${targetRelPath}" matches scoped rule "${entry}"`,
        };
      }
    }
  }

  return {
    allowed: false,
    reason: `Role "${role.id}" (${role.title}) is not permitted to use "${toolName}"${
      targetRelPath ? ` on "${targetRelPath}"` : ""
    }`,
  };
}

export function getJcodeToolsFlagForRole(roleId: AgentRoleId, role: RoleConfig): string {
  const mapped = new Set<string>();
  for (const t of role.tools) {
    const base = t.split(":")[0] ?? t;
    if (base === "read" || base === "git.diff" || base === "git.log") mapped.add("read");
    if (base === "grep") mapped.add("grep");
    if (base === "write") mapped.add("write");
    if (base === "apply_patch") mapped.add("apply_patch");
    if (base === "bash" || base === "run_command") mapped.add("bash");
  }
  return mapped.size > 0 ? Array.from(mapped).join(",") : "read";
}
