import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { AgentRoleId } from "@agent-office/protocol";
import { SCRUBBED_SECRET_ENV_KEYS } from "../../domain/providers.ts";
import type { WorkspacePort } from "../../ports/index.ts";

const execFileAsync = promisify(execFile);

const GIT_DIFF_MAX_BUFFER_BYTES = 4 * 1024 * 1024;
const DEFAULT_DIFF_MAX_BYTES = 16_384;
const DEFAULT_DIFF_MAX_LINES = 300;
const DIFF_TRUNCATION_SUFFIX = "\n... [diff truncated]";

export function createScrubbedEnv(
  baseEnv: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  const clean: NodeJS.ProcessEnv = { ...baseEnv };
  for (const key of SCRUBBED_SECRET_ENV_KEYS) {
    delete clean[key];
  }
  return clean;
}

export function truncateDiffOutput(
  rawDiff: string,
  maxBytes: number = DEFAULT_DIFF_MAX_BYTES,
  maxLines: number = DEFAULT_DIFF_MAX_LINES
): string {
  const trimmed = rawDiff.trim();
  if (!trimmed) return "";

  const lines = trimmed.split("\n");
  let truncated = false;
  let result = trimmed;

  if (lines.length > maxLines) {
    result = lines.slice(0, maxLines).join("\n");
    truncated = true;
  }

  if (Buffer.byteLength(result, "utf8") > maxBytes) {
    const budget = Math.max(
      0,
      maxBytes - Buffer.byteLength(DIFF_TRUNCATION_SUFFIX, "utf8")
    );
    let buf = Buffer.from(result, "utf8").subarray(0, budget);
    while (buf.length > 0 && (buf[buf.length - 1]! & 0xc0) === 0x80) {
      buf = buf.subarray(0, buf.length - 1);
    }
    if (buf.length > 0 && (buf[buf.length - 1]! & 0x80) !== 0) {
      buf = buf.subarray(0, buf.length - 1);
    }
    result = buf.toString("utf8");
    truncated = true;
  }

  return truncated ? `${result}${DIFF_TRUNCATION_SUFFIX}` : result;
}

export class GitWorktreeAdapter implements WorkspacePort {
  private readonly targetRepoPath: string;
  private readonly worktreesRootPath: string;

  constructor(targetRepoPath: string, worktreesRootPath: string) {
    this.targetRepoPath = path.resolve(targetRepoPath);
    this.worktreesRootPath = path.resolve(worktreesRootPath);
    fs.mkdirSync(this.worktreesRootPath, { recursive: true });
  }

  async ensureWorktree(
    ticketId: string,
    roleId: AgentRoleId
  ): Promise<{ worktreePath: string; branch: string }> {
    const safeTicket = ticketId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const branch = `agent/${safeTicket}`;
    const worktreePath = path.join(
      this.worktreesRootPath,
      `${roleId}-${safeTicket}`
    );

    if (fs.existsSync(worktreePath)) {
      return { worktreePath, branch };
    }

    try {
      await execFileAsync("git", ["rev-parse", "--verify", branch], {
        cwd: this.targetRepoPath,
      });
    } catch {
      await execFileAsync("git", ["branch", branch, "main"], {
        cwd: this.targetRepoPath,
      });
    }

    try {
      await execFileAsync(
        "git",
        ["worktree", "add", "--force", worktreePath, branch],
        { cwd: this.targetRepoPath }
      );
    } catch {
      // Fallback: detached worktree at branch if branch is already checked out by another role
      await execFileAsync(
        "git",
        ["worktree", "add", "--force", "--detach", worktreePath, branch],
        { cwd: this.targetRepoPath }
      );
    }

    return { worktreePath, branch };
  }

  async getDiff(
    worktreePath: string,
    maxBytes: number = DEFAULT_DIFF_MAX_BYTES,
    maxLines: number = DEFAULT_DIFF_MAX_LINES
  ): Promise<string> {
    if (!fs.existsSync(worktreePath)) return "";
    try {
      await execFileAsync("git", ["add", "-N", "."], { cwd: worktreePath });
      const { stdout } = await execFileAsync("git", ["diff", "main"], {
        cwd: worktreePath,
        maxBuffer: GIT_DIFF_MAX_BUFFER_BYTES,
      });
      return truncateDiffOutput(stdout, maxBytes, maxLines);
    } catch {
      return "";
    }
  }

  async mergeBranchToMain(
    branch: string,
    commitMessage: string
  ): Promise<string> {
    await execFileAsync("git", ["checkout", "main"], {
      cwd: this.targetRepoPath,
    });
    const { stdout } = await execFileAsync(
      "git",
      ["merge", "--no-ff", "-m", commitMessage, branch],
      { cwd: this.targetRepoPath }
    );
    return stdout.trim();
  }

  async runShellCommand(
    worktreePath: string,
    command: string,
    timeoutMs: number = 15000
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const child = spawn("bash", ["-c", command], {
        cwd: fs.existsSync(worktreePath) ? worktreePath : this.targetRepoPath,
        env: createScrubbedEnv(process.env),
      });

      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        stderr += "\n[Command timed out]";
      }, timeoutMs);

      child.stdout.on("data", (chunk: Buffer) => {
        if (stdout.length < 32768) stdout += chunk.toString("utf8");
      });
      child.stderr.on("data", (chunk: Buffer) => {
        if (stderr.length < 32768) stderr += chunk.toString("utf8");
      });

      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({
          exitCode: code ?? 1,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
        });
      });
    });
  }
}
