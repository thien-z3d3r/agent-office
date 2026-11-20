import path from "node:path";

export type PolicyDecisionTier = "allow" | "ask" | "deny";

export interface CommandPolicyEvaluation {
  decision: PolicyDecisionTier;
  risk: "low" | "medium" | "high";
  reason: string;
}

const HARD_DENY_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /(?:^|\s|;|&&|\|\||\|)(?:sudo|su|doas|pkexec|shutdown|reboot|poweroff|mkfs\b|fdisk\b|dd\s+if=)/i,
    reason: "Privilege escalation and destructive disk/system commands are hard-denied",
  },
  {
    pattern: /(?:curl|wget)\b[^|]*\|\s*(?:ba)?sh\b/i,
    reason: "Piping remote downloads into a shell (curl/wget | sh) is hard-denied",
  },
  {
    pattern: /\bgit\s+push\b[^\n]*(?:--force\b|-f\b|--force-with-lease\b)/i,
    reason: "Force-pushing git branches is hard-denied",
  },
  {
    pattern: /\brm\s+[^\n]*-[a-zA-Z]*[rR][a-zA-Z]*\s+(?:\/(?:\s|$)|~|\/home\/skadi(?:\s|\/?$)|\$HOME|\.\.)/,
    reason: "Recursive deletion of root, home directory, or parent paths is hard-denied",
  },
  {
    pattern: /(?:~\/\.ssh|\/\.ssh\b|~\/\.jcode|\/\.jcode\b|~\/\.gemini|\/\.gemini\b|\/etc\/shadow|\/etc\/passwd|antigravity_oauth\.json)/i,
    reason: "Accessing sensitive credential/key directories (~/.ssh, ~/.jcode, ~/.gemini, /etc/passwd, /etc/shadow) is hard-denied",
  },
  {
    pattern: /(?:^|\s)(?:printenv|env|export\s+-p|set)(?:\s|$)/,
    reason: "Dumping full process environment variables is hard-denied",
  },
  {
    pattern: /(?:^|\s|\/)\.\.(?:\/|$)/,
    reason: "Parent directory traversal (..) outside the worktree is hard-denied",
  },
];

const COMPOUND_SHELL_PATTERN = /(?:;|&&|\|\||\|(?!\|)|`|\$\(|\n|>|<)/;

function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .trim()
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

export function isPathInsideWorktree(
  worktreePath: string,
  candidatePath: string
): boolean {
  const root = path.posix.resolve(worktreePath.replace(/\\/g, "/"));
  const resolved = path.posix.resolve(root, candidatePath.replace(/\\/g, "/"));
  return resolved === root || resolved.startsWith(root + "/");
}

export function evaluateCommandPolicy(
  rawCommand: string,
  allowCommands: readonly string[],
  worktreePath: string = "/worktree"
): CommandPolicyEvaluation {
  const cmd = rawCommand.trim();
  if (!cmd) {
    return {
      decision: "deny",
      risk: "low",
      reason: "Empty command is denied",
    };
  }

  for (const rule of HARD_DENY_PATTERNS) {
    if (rule.pattern.test(cmd)) {
      return {
        decision: "deny",
        risk: "high",
        reason: rule.reason,
      };
    }
  }

  // Reject explicit absolute paths outside /dev/null and the role's worktree
  const tokens = cmd.split(/\s+/);
  for (const rawTok of tokens) {
    const tok = rawTok.replace(/^['"]|['"]$/g, "");
    if (tok.startsWith("/") && !tok.startsWith("/dev/null")) {
      if (!isPathInsideWorktree(worktreePath, tok)) {
        return {
          decision: "deny",
          risk: "high",
          reason: `Absolute path "${tok}" escapes worktree "${worktreePath}"`,
        };
      }
    }
  }

  if (COMPOUND_SHELL_PATTERN.test(cmd)) {
    return {
      decision: "ask",
      risk: "high",
      reason: "Compound shell expression (; && || | $() ` > <) requires Director approval",
    };
  }

  for (const pattern of allowCommands) {
    if (globToRegExp(pattern).test(cmd)) {
      return {
        decision: "allow",
        risk: "low",
        reason: `Matches role allowlist pattern "${pattern}"`,
      };
    }
  }

  return {
    decision: "ask",
    risk: "medium",
    reason: "Command is not in the role's allowCommands list; requires Director approval",
  };
}
