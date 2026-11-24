import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";
import type {
  AgentEvent,
  ProviderId,
  RoleConfig,
  RuntimeKind,
  Ticket,
} from "@agent-office/protocol";
import { SQLiteOfficeStore } from "../src/adapters/sqlite/sqlite-store.ts";
import {
  createScrubbedEnv,
  GitWorktreeAdapter,
  truncateDiffOutput,
} from "../src/adapters/git/git-worktree.ts";
import {
  clearJcodeAuthStatusCache,
  defaultLineStreamFactory,
  JcodeRuntimeAdapter,
  probeJcodeAuthStatus,
} from "../src/adapters/runtimes/jcode-runtime.ts";
import {
  createModelDiscoveryAdapter,
} from "../src/adapters/runtimes/model-discovery.ts";
import { AiSdkRuntimeAdapter } from "../src/adapters/runtimes/ai-sdk-runtime.ts";
import {
  ClaudeAgentSdkRuntimeAdapter,
  CodexSdkRuntimeAdapter,
} from "../src/adapters/runtimes/sdk-harnesses.ts";
import {
  createOfficeSystem,
  loadOfficeConfig,
} from "../src/index.ts";
import { OfficeOrchestrator } from "../src/application/orchestrator.ts";
import {
  runRoleStage,
  type StageRunnerContext,
} from "../src/application/stage-runner.ts";
import {
  buildSyncedTaskTableRows,
  buildUpdatedTaskRow,
} from "../src/application/task-table.ts";
import type { AgentRuntimePort, WorkspacePort } from "../src/ports/index.ts";
import { startOfficeHttpServer } from "../src/adapters/http/server.ts";
import { DEFAULT_WORKFLOW_LIMITS } from "../src/domain/ticket-machine.ts";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);

const sampleTicket: Ticket = {
  id: "T-77",
  title: "Create hello.txt with 42",
  description: "Write 42 into hello.txt",
  size: "S",
  stage: "InProgress",
  assignee: "be",
  authorRole: "be",
  reviewRounds: 0,
  qaBounces: 0,
  spentUsd: 0,
  comments: [],
  createdAt: 1000,
  updatedAt: 1000,
};

const beRole: RoleConfig = {
  id: "be",
  title: "Backend Engineer",
  zone: "dev_pod_be",
  tint: "#10b981",
  accessory: "coffee_mug",
  tools: ["read", "grep", "write", "apply_patch", "bash"],
  allowCommands: ["git status"],
};

test("JcodeRuntimeAdapter passes -p antigravity and --tools flags and converts NDJSON stream to AgentEvents", async () => {
  const store = new SQLiteOfficeStore(":memory:");
  let capturedArgs: string[] = [];

  const adapter = new JcodeRuntimeAdapter(
    store,
    "/home/skadi/.local/bin/jcode",
    async function* ({ cliArgs }) {
      capturedArgs = cliArgs;
      yield JSON.stringify({ type: "text_delta", delta: "Inspecting repo..." });
      yield JSON.stringify({
        type: "tool_start",
        id: "call-1",
        tool: "write",
        summary: "hello.txt",
      });
      yield JSON.stringify({
        type: "tool_end",
        id: "call-1",
        ok: true,
        preview: "Wrote 42 to hello.txt",
      });
      yield JSON.stringify({
        type: "usage",
        input_tokens: 310,
        output_tokens: 80,
        cost_usd: 0.002,
      });
    }
  );

  const events: AgentEvent[] = [];
  for await (const ev of adapter.run({
    runId: "r-jcode-1",
    ticket: sampleTicket,
    role: beRole,
    provider: "antigravity",
    runtime: "jcode",
    prompt: "Create hello.txt containing 42",
    worktreePath: "/tmp/wt-test",
    signal: new AbortController().signal,
    requestApproval: async () => true,
  })) {
    events.push(ev);
  }

  assert.ok(capturedArgs.includes("--ndjson"));
  assert.ok(capturedArgs.includes("antigravity"));
  assert.ok(capturedArgs.includes("--tools"));
  assert.ok(events.some((e) => e.t === "agent.text"));
  assert.ok(
    events.some((e) => e.t === "agent.status" && e.status === "writing")
  );
  assert.ok(
    events.some((e) => e.t === "usage" && e.provider === "antigravity")
  );
  assert.equal(events.at(-1)?.t, "agent.status");

  const authStatus = await probeJcodeAuthStatus();
  assert.ok(
    authStatus["antigravity"],
    "Expected jcode auth status to include antigravity provider entry"
  );
});

test("AiSdkRuntimeAdapter executes ReAct tool loop, enforces command policy approvals, and fails cleanly on missing key", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "office-aisdk-"));
  const store = new SQLiteOfficeStore(":memory:");
  const workspace = new GitWorktreeAdapter(
    path.join(rootDir, "sandbox-repo"),
    tmpDir
  );

  // Missing API key emits error status and rejects.
  const adapterNoKey = new AiSdkRuntimeAdapter(store, workspace);
  const errEvents: AgentEvent[] = [];
  await assert.rejects(async () => {
    for await (const ev of adapterNoKey.run({
      runId: "r-nokey",
      ticket: sampleTicket,
      role: beRole,
      provider: "kimi_code",
      runtime: "ai-sdk",
      prompt: "Test missing key",
      worktreePath: tmpDir,
      signal: new AbortController().signal,
      requestApproval: async () => true,
    })) {
      errEvents.push(ev);
    }
  });
  assert.ok(
    errEvents.some((e) => e.t === "agent.status" && e.status === "error")
  );

  // Configured API key writes hello.txt and gates unlisted shell commands on approval.
  store.setSecret("KIMI_API_KEY", "sk-kimi-test-key");
  let turnCount = 0;
  let approvalAskedFor = "";

  const adapterWithMockModel = new AiSdkRuntimeAdapter(
    store,
    workspace,
    async ({ provider }) => {
      assert.equal(provider, "kimi_code");
      turnCount++;
      if (turnCount === 1) {
        return {
          text: "Writing hello.txt and checking node version",
          toolCalls: [
            {
              id: "tc-write",
              tool: "write",
              args: { path: "hello.txt", content: "42" },
            },
            {
              id: "tc-cmd",
              tool: "run_command",
              args: { command: "echo approved-check" },
            },
          ],
          inTok: 120,
          outTok: 60,
          costUsd: 0.001,
        };
      }
      return {
        text: "All done!",
        toolCalls: [],
        inTok: 80,
        outTok: 20,
        costUsd: 0.0005,
      };
    }
  );

  const runEvents: AgentEvent[] = [];
  for await (const ev of adapterWithMockModel.run({
    runId: "r-kimi-1",
    ticket: sampleTicket,
    role: {
      ...beRole,
      tools: ["write", "run_command"],
    },
    provider: "kimi_code",
    runtime: "ai-sdk",
    prompt: "Create hello.txt with 42",
    worktreePath: tmpDir,
    signal: new AbortController().signal,
    requestApproval: async (req) => {
      approvalAskedFor = req.action;
      return true;
    },
  })) {
    runEvents.push(ev);
  }

  assert.equal(fs.readFileSync(path.join(tmpDir, "hello.txt"), "utf8"), "42");
  assert.equal(approvalAskedFor, "echo approved-check");
  assert.ok(
    runEvents.some((e) => e.t === "agent.status" && e.status === "done")
  );
});

test("ClaudeAgentSdkRuntimeAdapter and CodexSdkRuntimeAdapter map recorded SDK streams and block denied PreToolUse commands", async () => {
  const claudeAdapter = new ClaudeAgentSdkRuntimeAdapter(async function* () {
    yield { type: "assistant", text: "Checking files via Claude Agent SDK" };
    yield {
      type: "tool_use",
      callId: "c-bad",
      toolName: "Bash",
      input: { command: "rm -rf /" },
    };
    yield {
      type: "tool_use",
      callId: "c-ok",
      toolName: "Read",
      input: { path: "src/math.ts" },
    };
    yield {
      type: "tool_result",
      callId: "c-ok",
      ok: true,
      output: "export function add...",
    };
    yield {
      type: "result",
      subtype: "success",
      inTok: 500,
      outTok: 150,
      total_cost_usd: 0.004,
    };
  });

  const claudeEvents: AgentEvent[] = [];
  for await (const ev of claudeAdapter.run({
    runId: "r-cas",
    ticket: sampleTicket,
    role: beRole,
    provider: "claude",
    runtime: "claude-agent-sdk",
    prompt: "Audit repo",
    worktreePath: "/tmp/wt",
    signal: new AbortController().signal,
    requestApproval: async () => false,
  })) {
    claudeEvents.push(ev);
  }

  assert.ok(
    claudeEvents.some(
      (e) =>
        e.t === "tool.end" &&
        e.callId === "c-bad" &&
        e.ok === false &&
        e.preview?.includes("PreToolUse Blocked")
    )
  );
  assert.ok(
    claudeEvents.some((e) => e.t === "agent.status" && e.status === "done")
  );

  const codexAdapter = new CodexSdkRuntimeAdapter(async function* () {
    yield {
      type: "item.started",
      item: {
        id: "item-1",
        type: "file_change",
        summary: "Editing Component.tsx",
      },
    };
    yield {
      type: "item.completed",
      item: {
        id: "item-1",
        type: "file_change",
        text: "Updated Component.tsx",
        ok: true,
      },
    };
    yield {
      type: "turn.completed",
      turn: { status: "completed" },
      usage: { input_tokens: 450, output_tokens: 200 },
    };
  });

  const codexEvents: AgentEvent[] = [];
  for await (const ev of codexAdapter.run({
    runId: "r-cdx",
    ticket: sampleTicket,
    role: beRole,
    provider: "openai_oauth",
    runtime: "codex-sdk",
    prompt: "Update UI",
    worktreePath: "/tmp/wt",
    signal: new AbortController().signal,
    requestApproval: async () => true,
  })) {
    codexEvents.push(ev);
  }
  assert.ok(
    codexEvents.some((e) => e.t === "agent.status" && e.status === "writing")
  );
  assert.ok(
    codexEvents.some((e) => e.t === "usage" && e.provider === "openai_oauth")
  );
});

test("Full HTTP + WebSocket + Orchestrator lifecycle: creates worktree, pauses for Director merge approval, ships ticket, and never leaks secrets", async () => {
  const scrubbed = createScrubbedEnv({
    PATH: "/usr/bin",
    ANTHROPIC_API_KEY: "sk-ant-secret",
    OPENAI_API_KEY: "sk-proj-secret",
    KIMI_API_KEY: "sk-kimi-secret",
    GEMINI_API_KEY: "AIza-secret",
    OFFICE_MASTER_KEY: "master-secret",
  });
  assert.equal(scrubbed["ANTHROPIC_API_KEY"], undefined);
  assert.equal(scrubbed["OPENAI_API_KEY"], undefined);
  assert.equal(scrubbed["KIMI_API_KEY"], undefined);
  assert.equal(scrubbed["GEMINI_API_KEY"], undefined);
  assert.equal(scrubbed["OFFICE_MASTER_KEY"], undefined);

  const sys = createOfficeSystem({ dbPath: ":memory:", stepDelayMs: 5 });
  sys.store.setSecret("ANTHROPIC_API_KEY", "sk-ant-top-secret-value");

  await assert.rejects(() =>
    startOfficeHttpServer({
      orchestrator: sys.orchestrator,
      secrets: sys.store,
      fixturesDir: path.join(rootDir, "apps/server/fixtures"),
      host: "0.0.0.0",
      port: 0,
    })
  );

  const handle = await startOfficeHttpServer({
    orchestrator: sys.orchestrator,
    secrets: sys.store,
    fixturesDir: path.join(rootDir, "apps/server/fixtures"),
    host: "127.0.0.1",
    port: 0,
  });

  try {
    const baseUrl = `http://127.0.0.1:${handle.port}`;

    const settingsRes = await fetch(`${baseUrl}/api/settings`);
    const settingsText = await settingsRes.text();
    assert.equal(
      settingsText.includes("sk-ant-top-secret-value"),
      false,
      "GET /api/settings must never contain raw secret material"
    );
    const settingsJson = JSON.parse(settingsText) as {
      configuredKeys: Record<string, boolean>;
    };
    assert.equal(settingsJson.configuredKeys["ANTHROPIC_API_KEY"], true);

    const wsMessages: Array<Record<string, unknown>> = [];
    const ws = new WebSocket(`ws://127.0.0.1:${handle.port}/ws`);
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
    });
    ws.on("message", (data) => {
      wsMessages.push(JSON.parse(data.toString("utf8")));
    });

    // Submit an S-size ticket (pauses at ReadyToMerge waiting for Director merge approval)
    const createRes = await fetch(`${baseUrl}/api/tickets`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Add divide(a,b) helper",
        description: "Safe division helper in math.ts",
        size: "S",
        authorRole: "fe",
        mode: "scripted",
        autoApproveMerge: false,
      }),
    });
    assert.equal(createRes.status, 201);
    const { ticket } = (await createRes.json()) as { ticket: Ticket };

    let mergeReqId: string | null = null;
    for (let i = 0; i < 60; i++) {
      const snap = sys.orchestrator.getSnapshot();
      const pending = Object.values(snap.approvals).find(
        (a) => a.ticketId === ticket.id && a.kind === "merge"
      );
      if (pending) {
        mergeReqId = pending.reqId;
        break;
      }
      await new Promise((r) => setTimeout(r, 20));
    }
    assert.ok(mergeReqId, "Expected ticket to pause for Director merge approval");

    const approveRes = await fetch(`${baseUrl}/api/approvals/${mergeReqId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ approved: true, note: "LGTM, ship to main" }),
    });
    assert.equal(approveRes.status, 200);

    let finalStage = "";
    for (let i = 0; i < 40; i++) {
      finalStage =
        sys.orchestrator.getSnapshot().tickets[ticket.id]?.stage ?? "";
      if (finalStage === "Done") break;
      await new Promise((r) => setTimeout(r, 20));
    }
    assert.equal(finalStage, "Done");

    const standupRes = await fetch(`${baseUrl}/api/standup`, {
      method: "POST",
    });
    assert.equal(standupRes.status, 200);
    assert.equal(sys.orchestrator.getSnapshot().agents.em.status, "standup");
    assert.ok(wsMessages.length >= 5);

    ws.close();
  } finally {
    await handle.close();
  }
});

test("stage-runner preserves startedAt < endedAt and coalesces agent.text deltas while preserving causal order", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ao-stage-runner-"));
  const dbPath = path.join(tmpDir, "stage.sqlite3");
  const store = new SQLiteOfficeStore(dbPath, "stage-test-key");
  const config = loadOfficeConfig(path.join(rootDir, "office.config.yaml"));
  const emitted: AgentEvent[] = [];

  const ctx: StageRunnerContext = {
    config,
    store,
    workspace: {
      ensureWorktree: async () => ({ worktreePath: tmpDir, branch: "agent/T-STAGE" }),
      getDiff: async () => "",
      mergeBranchToMain: async () => "",
      runShellCommand: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
    },
    runtimes: new Map([
      [
        "scripted",
        {
          kind: "scripted",
          async *run(req) {
            await new Promise((r) => setTimeout(r, 15));
            for (let i = 0; i < 10; i++) {
              yield {
                id: `txt-${i}`,
                ts: Date.now(),
                t: "agent.text",
                agentId: req.role.id,
                runId: req.runId,
                ticketId: req.ticket.id,
                delta: `chunk-${i} `,
              };
            }
            yield {
              id: "tool-1",
              ts: Date.now(),
              t: "tool.start",
              agentId: req.role.id,
              runId: req.runId,
              ticketId: req.ticket.id,
              callId: "call-1",
              tool: "read",
              summary: "file.ts",
            };
            yield {
              id: "txt-after",
              ts: Date.now(),
              t: "agent.text",
              agentId: req.role.id,
              runId: req.runId,
              ticketId: req.ticket.id,
              delta: "final summary",
            };
          },
        },
      ],
    ]),
    getSnapshot: () => ({
      activeProvider: "kimi_code",
      activeRuntime: "scripted",
      activeModel: null,
      roleModels: {},
      agents: {} as StageRunnerContext["getSnapshot"] extends () => infer S
        ? S extends { agents: infer A }
          ? A
          : never
        : never,
      tickets: {},
      taskTable: {},
      approvals: {},
      lastStandup: null,
      totalCostUsd: 0,
      eventCount: 0,
    }),
    emit: (ev) => emitted.push(ev),
    getRole: (id) => config.roles.find((r) => r.id === id)!,
    getWorkflowLimits: () => DEFAULT_WORKFLOW_LIMITS,
    updateTaskRow: () => {},
    requestApproval: async () => true,
  };

  try {
    await runRoleStage(ctx, {
      ticket: { ...sampleTicket, id: "T-STAGE" },
      roleId: "be",
      prompt: "Coalesce test",
      mode: "scripted",
    });

    const textEvents = emitted.filter((e) => e.t === "agent.text");
    assert.equal(textEvents.length, 2);
    assert.ok(textEvents[0]!.t === "agent.text" && textEvents[0]!.delta.includes("chunk-0 chunk-1"));
    assert.ok(textEvents[1]!.t === "agent.text" && textEvents[1]!.delta === "final summary");

    const toolStartIdx = emitted.findIndex((e) => e.t === "tool.start");
    const firstTextIdx = emitted.findIndex((e) => e.t === "agent.text");
    assert.ok(firstTextIdx >= 0 && firstTextIdx < toolStartIdx);
    store.close();

    const rawDb = new DatabaseSync(dbPath);
    try {
      const row = rawDb
        .prepare("SELECT started_at, ended_at, status FROM stage_runs WHERE ticket_id = ?")
        .get("T-STAGE") as { started_at: number; ended_at: number; status: string };
      assert.equal(row.status, "completed");
      assert.ok(
        row.started_at < row.ended_at,
        `Expected started_at (${row.started_at}) < ended_at (${row.ended_at})`
      );
    } finally {
      rawDb.close();
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("HTTP server enforces 413/400 JSON body limits, Cache-Control headers, and path traversal safety", async () => {
  const tmpStatic = fs.mkdtempSync(path.join(os.tmpdir(), "ao-static-"));
  fs.mkdirSync(path.join(tmpStatic, "assets"), { recursive: true });
  fs.mkdirSync(path.join(tmpStatic, "models"), { recursive: true });
  fs.writeFileSync(path.join(tmpStatic, "index.html"), "<html>Agent Office</html>");
  fs.writeFileSync(path.join(tmpStatic, "assets", "app-abc123.js"), "console.log(1);");
  fs.writeFileSync(path.join(tmpStatic, "models", "dog-corgi.glb"), "glTF");

  const sys = createOfficeSystem({ dbPath: ":memory:" });
  const handle = await startOfficeHttpServer({
    orchestrator: sys.orchestrator,
    secrets: sys.store,
    fixturesDir: path.join(rootDir, "apps/server/fixtures"),
    staticDir: tmpStatic,
    host: "127.0.0.1",
    port: 0,
  });

  try {
    const baseUrl = `http://127.0.0.1:${handle.port}`;

    const badJson = await fetch(`${baseUrl}/api/provider`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{bad-json",
    });
    assert.equal(badJson.status, 400);

    const oversized = await fetch(`${baseUrl}/api/tickets`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Big", description: "x".repeat(1_100_000) }),
    });
    assert.equal(oversized.status, 413);

    const htmlRes = await fetch(`${baseUrl}/`);
    assert.equal(htmlRes.status, 200);
    assert.equal(htmlRes.headers.get("cache-control"), "no-cache");

    const assetRes = await fetch(`${baseUrl}/assets/app-abc123.js`);
    assert.equal(assetRes.status, 200);
    assert.equal(
      assetRes.headers.get("cache-control"),
      "public, max-age=31536000, immutable"
    );

    const modelRes = await fetch(`${baseUrl}/models/dog-corgi.glb`);
    assert.equal(modelRes.status, 200);
    assert.equal(modelRes.headers.get("cache-control"), "public, max-age=86400");

    const traversalRes = await fetch(`${baseUrl}/../package.json`);
    assert.equal(traversalRes.status, 404);
  } finally {
    await handle.close();
    fs.rmSync(tmpStatic, { recursive: true, force: true });
  }
});

test("truncateDiffOutput caps oversized diffs by line count and byte budget", () => {
  const manyLines = Array.from({ length: 400 }, (_, i) => `+line ${i}`).join("\n");
  const cappedLines = truncateDiffOutput(manyLines);
  assert.ok(cappedLines.endsWith("\n... [diff truncated]"));
  assert.ok(cappedLines.split("\n").length <= 302);

  const wideLine = "a".repeat(20_000);
  const cappedBytes = truncateDiffOutput(wideLine, 16_384, 300);
  assert.ok(cappedBytes.endsWith("\n... [diff truncated]"));
  assert.ok(Buffer.byteLength(cappedBytes, "utf8") <= 16_384);
});

test("defaultLineStreamFactory drains >64 KiB stderr without pipe deadlock and probeJcodeAuthStatus caches results", async () => {
  const lines: string[] = [];
  const script = [
    "process.stderr.write('e'.repeat(90000));",
    "process.stdout.write(JSON.stringify({ type: 'text', delta: 'ok1' }) + '\\n');",
    "process.stdout.write(JSON.stringify({ type: 'text', delta: 'ok2' }) + '\\n');",
  ].join("");

  for await (const line of defaultLineStreamFactory({
    binary: process.execPath,
    cliArgs: ["-e", script],
    cwd: os.tmpdir(),
    env: process.env,
    signal: new AbortController().signal,
  })) {
    lines.push(line);
  }
  assert.equal(lines.length, 2);

  clearJcodeAuthStatusCache();
  const first = await probeJcodeAuthStatus();
  const second = await probeJcodeAuthStatus();
  assert.equal(first, second);
});

function createMemoryWorkspace(worktreePath: string): WorkspacePort {
  return {
    ensureWorktree: async (ticketId, roleId) => ({
      worktreePath,
      branch: `agent/${roleId}/${ticketId}`,
    }),
    getDiff: async () => "+export const ok = true;",
    mergeBranchToMain: async () => "merged",
    runShellCommand: async () => ({ exitCode: 0, stdout: "ok", stderr: "" }),
  };
}

test("Single-provider L-ticket executes all spawned role sub-agents on one provider with zero second-provider calls", async () => {
  const store = new SQLiteOfficeStore(":memory:");
  store.setSecret("KIMI_API_KEY", "sk-kimi-only");
  const config = {
    ...loadOfficeConfig(path.join(rootDir, "office.config.yaml")),
    activeProvider: "kimi_code" as const,
    activeRuntime: "ai-sdk" as const,
    activeModel: "kimi-custom-model",
  };

  const seenInvocations: Array<{
    role: string;
    provider: ProviderId;
    model?: string;
  }> = [];

  const mockAiSdk: AgentRuntimePort = {
    kind: "ai-sdk",
    async *run(req) {
      seenInvocations.push({
        role: req.role.id,
        provider: req.provider,
        model: req.model,
      });
      yield {
        id: crypto.randomUUID(),
        ts: Date.now(),
        t: "agent.status",
        agentId: req.role.id,
        runId: req.runId,
        ticketId: req.ticket.id,
        status: "done",
        detail: "Completed",
        targetZone: req.role.zone,
      };
    },
  };

  const orch = new OfficeOrchestrator({
    config,
    store,
    workspace: createMemoryWorkspace("/tmp/wt-single"),
    runtimes: new Map([["ai-sdk", mockAiSdk]]),
  });

  const { ticket, completion } = await orch.submitTicket({
    title: "Build single-provider L feature",
    description: "End-to-end single-provider L ticket",
    size: "L",
    authorRole: "be",
    mode: "live",
    autoApproveMerge: true,
  });

  const finalTicket = await completion;
  assert.equal(finalTicket.stage, "Done");
  assert.deepEqual(
    seenInvocations.map((i) => i.role),
    ["em", "pm", "tl", "be", "reviewer", "qa", "devops"]
  );
  for (const call of seenInvocations) {
    assert.equal(call.provider, "kimi_code");
    assert.equal(call.model, "kimi-custom-model");
  }

  const rows = Object.values(orch.getSnapshot().taskTable).filter(
    (r) => r.ticketId === ticket.id
  );
  assert.equal(rows.length, 7);
  for (const row of rows) {
    assert.equal(row.provider, "kimi_code");
    assert.equal(row.subAgentId, `sub-kimi_code-${row.role}-${row.order}`);
    assert.equal(row.status, "done");
  }
});

test("Live mode fails cleanly with zero cross-provider fallback and zero silent scripted fallback", async () => {
  const store = new SQLiteOfficeStore(":memory:");
  const config = {
    ...loadOfficeConfig(path.join(rootDir, "office.config.yaml")),
    activeProvider: "claude" as const,
    activeRuntime: "ai-sdk" as const,
  };

  let aiSdkAttempts = 0;
  let jcodeAttempts = 0;

  const failingAiSdk: AgentRuntimePort = {
    kind: "ai-sdk",
    async *run() {
      aiSdkAttempts++;
      throw new Error("401 unauthorized");
    },
  };
  const spyJcode: AgentRuntimePort = {
    kind: "jcode",
    async *run() {
      jcodeAttempts++;
    },
  };

  const orch = new OfficeOrchestrator({
    config,
    store,
    workspace: createMemoryWorkspace("/tmp/wt-no-fallback"),
    runtimes: new Map<RuntimeKind, AgentRuntimePort>([
      ["ai-sdk", failingAiSdk],
      ["jcode", spyJcode],
    ]),
  });

  const { ticket, completion } = await orch.submitTicket({
    title: "Fail cleanly without fallback",
    description: "Verify no fallback to jcode or another provider",
    size: "S",
    authorRole: "fe",
    mode: "live",
  });

  const escalated = await completion;
  assert.equal(aiSdkAttempts, 1);
  assert.equal(jcodeAttempts, 0);
  assert.equal(escalated.stage, "Escalated");
  assert.ok(escalated.escalationReason?.includes("claude"));
  assert.ok(escalated.escalationReason?.includes("ai-sdk"));
  const emRow = Object.values(orch.getSnapshot().taskTable).find(
    (r) => r.ticketId === ticket.id && r.role === "em"
  );
  assert.equal(emRow?.status, "failed");

  // Unregistered activeRuntime in live mode must escalate instead of falling back to scripted.
  let scriptedRan = false;
  const spyScripted: AgentRuntimePort = {
    kind: "scripted",
    async *run() {
      scriptedRan = true;
    },
  };
  const orchUnregistered = new OfficeOrchestrator({
    config: {
      ...config,
      activeProvider: "antigravity",
      activeRuntime: "jcode",
    },
    store: new SQLiteOfficeStore(":memory:"),
    workspace: createMemoryWorkspace("/tmp/wt-no-scripted"),
    runtimes: new Map([["scripted", spyScripted]]),
  });

  const res2 = await orchUnregistered.submitTicket({
    title: "Missing live runtime",
    description: "Should not fall back to scripted",
    size: "S",
    authorRole: "be",
    mode: "live",
  });
  const escalated2 = await res2.completion;
  assert.equal(scriptedRan, false);
  assert.equal(escalated2.stage, "Escalated");
  assert.ok(escalated2.escalationReason?.includes("not registered"));
});

test("JcodeRuntimeAdapter scrubs unrelated secrets and passes -m model; AiSdkRuntimeAdapter rejects OAuth providers", async () => {
  const store = new SQLiteOfficeStore(":memory:");
  store.setSecret("ANTHROPIC_API_KEY", "sk-ant-secret");
  store.setSecret("KIMI_API_KEY", "sk-kimi-secret");
  store.setSecret("OPENAI_API_KEY", "sk-openai-secret");

  const prevGemini = process.env["GEMINI_API_KEY"];
  const prevMaster = process.env["OFFICE_MASTER_KEY"];
  process.env["GEMINI_API_KEY"] = "leaked-env-gemini";
  process.env["OFFICE_MASTER_KEY"] = "leaked-master";

  try {
    let capturedArgs: string[] = [];
    let capturedEnv: NodeJS.ProcessEnv = {};

    const adapter = new JcodeRuntimeAdapter(
      store,
      "/home/skadi/.local/bin/jcode",
      async function* ({ cliArgs, env }) {
        capturedArgs = cliArgs;
        capturedEnv = env;
        yield JSON.stringify({ type: "text", delta: "ok" });
      }
    );

    // OAuth provider receives zero secret env keys.
    for await (const _ev of adapter.run({
      runId: "r-oauth",
      ticket: sampleTicket,
      role: beRole,
      provider: "antigravity",
      runtime: "jcode",
      model: "gemini-2.5-pro",
      prompt: "Check OAuth isolation",
      worktreePath: "/tmp/wt",
      signal: new AbortController().signal,
      requestApproval: async () => true,
    })) {
      void _ev;
    }
    assert.ok(capturedArgs.includes("-m"));
    assert.ok(capturedArgs.includes("gemini-2.5-pro"));
    assert.equal(capturedEnv["ANTHROPIC_API_KEY"], undefined);
    assert.equal(capturedEnv["KIMI_API_KEY"], undefined);
    assert.equal(capturedEnv["OPENAI_API_KEY"], undefined);
    assert.equal(capturedEnv["GEMINI_API_KEY"], undefined);
    assert.equal(capturedEnv["OFFICE_MASTER_KEY"], undefined);

    // API-key provider receives only its own envKey.
    for await (const _ev of adapter.run({
      runId: "r-kimi-jcode",
      ticket: sampleTicket,
      role: beRole,
      provider: "kimi_code",
      runtime: "jcode",
      prompt: "Check single API key isolation",
      worktreePath: "/tmp/wt",
      signal: new AbortController().signal,
      requestApproval: async () => true,
    })) {
      void _ev;
    }
    assert.equal(capturedEnv["KIMI_API_KEY"], "sk-kimi-secret");
    assert.equal(capturedEnv["ANTHROPIC_API_KEY"], undefined);
    assert.equal(capturedEnv["OPENAI_API_KEY"], undefined);
    assert.equal(capturedEnv["GEMINI_API_KEY"], undefined);

    // AiSdkRuntimeAdapter rejects jcode-oauth providers cleanly.
    const aiSdk = new AiSdkRuntimeAdapter(
      store,
      createMemoryWorkspace("/tmp/wt")
    );
    await assert.rejects(async () => {
      for await (const _ev of aiSdk.run({
        runId: "r-invalid-oauth",
        ticket: sampleTicket,
        role: beRole,
        provider: "antigravity",
        runtime: "ai-sdk",
        prompt: "Should fail",
        worktreePath: "/tmp/wt",
        signal: new AbortController().signal,
        requestApproval: async () => true,
      })) {
        void _ev;
      }
    }, /jcode OAuth/);
  } finally {
    if (prevGemini === undefined) delete process.env["GEMINI_API_KEY"];
    else process.env["GEMINI_API_KEY"] = prevGemini;
    if (prevMaster === undefined) delete process.env["OFFICE_MASTER_KEY"];
    else process.env["OFFICE_MASTER_KEY"] = prevMaster;
  }
});

test("buildSyncedTaskTableRows preserves existing row statuses on mid-ticket provider switch and buildUpdatedTaskRow refreshes subAgentId", () => {
  const inProgressTicket: Ticket = {
    ...sampleTicket,
    id: "T-SYNC",
    size: "M",
    stage: "InProgress",
    assignee: "be",
    authorRole: "be",
  };

  const initialRows = buildSyncedTaskTableRows(inProgressTicket, "claude");
  assert.deepEqual(
    initialRows.map((r) => [r.role, r.status]),
    [
      ["em", "done"],
      ["be", "running"],
      ["reviewer", "queued"],
      ["qa", "queued"],
      ["devops", "queued"],
    ]
  );

  const tableMap = Object.fromEntries(initialRows.map((r) => [r.id, r]));
  const syncedAfterSwitch = buildSyncedTaskTableRows(
    inProgressTicket,
    "kimi_code",
    tableMap
  );
  assert.deepEqual(
    syncedAfterSwitch.map((r) => [r.role, r.status, r.provider, r.subAgentId]),
    [
      ["em", "done", "kimi_code", "sub-kimi_code-em-1"],
      ["be", "running", "kimi_code", "sub-kimi_code-be-2"],
      ["reviewer", "queued", "kimi_code", "sub-kimi_code-reviewer-3"],
      ["qa", "queued", "kimi_code", "sub-kimi_code-qa-4"],
      ["devops", "queued", "kimi_code", "sub-kimi_code-devops-5"],
    ]
  );

  const updated = buildUpdatedTaskRow(
    tableMap,
    "T-SYNC",
    "be",
    "gemini",
    "done",
    "Completed"
  );
  assert.equal(updated?.provider, "gemini");
  assert.equal(updated?.subAgentId, "sub-gemini-be-2");
  assert.equal(updated?.status, "done");
});

test("HTTP /api/settings & /api/provider validate runtime/model compatibility and orchestrator persists provider.changed over config defaults", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ao-prov-replay-"));
  const dbPath = path.join(tmpDir, "office.sqlite3");

  try {
    const config = {
      ...loadOfficeConfig(path.join(rootDir, "office.config.yaml")),
      activeProvider: "kimi_code" as const,
      activeRuntime: "ai-sdk" as const,
      activeModel: "kimi-init",
    };

    const store1 = new SQLiteOfficeStore(dbPath, "test-replay-key");
    const orch1 = new OfficeOrchestrator({
      config,
      store: store1,
      workspace: createMemoryWorkspace(tmpDir),
      runtimes: new Map(),
    });
    assert.equal(orch1.getSnapshot().activeProvider, "kimi_code");
    assert.equal(orch1.getSnapshot().activeRuntime, "ai-sdk");
    assert.equal(orch1.getSnapshot().activeModel, "kimi-init");

    const handle = await startOfficeHttpServer({
      orchestrator: orch1,
      secrets: store1,
      fixturesDir: path.join(rootDir, "apps/server/fixtures"),
      host: "127.0.0.1",
      port: 0,
    });

    try {
      const baseUrl = `http://127.0.0.1:${handle.port}`;
      const getRes = await fetch(`${baseUrl}/api/settings`);
      assert.equal(getRes.status, 200);
      const settingsJson = (await getRes.json()) as {
        activeProvider: string;
        activeRuntime: string;
        activeModel: string | null;
      };
      assert.equal(settingsJson.activeProvider, "kimi_code");
      assert.equal(settingsJson.activeRuntime, "ai-sdk");
      assert.equal(settingsJson.activeModel, "kimi-init");

      const badRuntime = await fetch(`${baseUrl}/api/provider`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "claude", runtime: "bogus-rt" }),
      });
      assert.equal(badRuntime.status, 400);

      const incompatible = await fetch(`${baseUrl}/api/provider`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "antigravity", runtime: "ai-sdk" }),
      });
      assert.equal(incompatible.status, 400);

      for (const nonObjectBody of ["null", "[]", '"claude"', "42"]) {
        const nonObjRes = await fetch(`${baseUrl}/api/provider`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: nonObjectBody,
        });
        assert.equal(nonObjRes.status, 400);
        const errJson = (await nonObjRes.json()) as { error?: string };
        assert.equal(errJson.error, "JSON request body must be an object");
      }

      const validSwitch = await fetch(`${baseUrl}/api/provider`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: "claude",
          runtime: "ai-sdk",
          model: "claude-opus-4-1",
        }),
      });
      assert.equal(validSwitch.status, 200);
    } finally {
      await handle.close();
      store1.close();
    }

    // Restart with original config: persisted provider.changed overrides config defaults.
    const store2 = new SQLiteOfficeStore(dbPath, "test-replay-key");
    const orch2 = new OfficeOrchestrator({
      config,
      store: store2,
      workspace: createMemoryWorkspace(tmpDir),
      runtimes: new Map(),
    });
    assert.equal(orch2.getSnapshot().activeProvider, "claude");
    assert.equal(orch2.getSnapshot().activeRuntime, "ai-sdk");
    assert.equal(orch2.getSnapshot().activeModel, "claude-opus-4-1");
    store2.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("OfficeOrchestrator.setActiveProvider preserves Done ticket rows and active agent targetZone", async () => {
  const store = new SQLiteOfficeStore(":memory:");
  store.setSecret("ANTHROPIC_API_KEY", "sk-ant-test");
  store.setSecret("KIMI_API_KEY", "sk-kimi-test");

  const config = {
    ...loadOfficeConfig(path.join(rootDir, "office.config.yaml")),
    activeProvider: "claude" as const,
    activeRuntime: "ai-sdk" as const,
  };

  let releaseBe!: () => void;
  const bePaused = new Promise<void>((resolve) => {
    releaseBe = resolve;
  });
  let markBeRunning!: () => void;
  const beStarted = new Promise<void>((resolve) => {
    markBeRunning = resolve;
  });

  const gatedAiSdk: AgentRuntimePort = {
    kind: "ai-sdk",
    async *run(req) {
      if (req.ticket.id === "T-2" && req.role.id === "be") {
        yield {
          id: crypto.randomUUID(),
          ts: Date.now(),
          t: "agent.status",
          agentId: "be",
          runId: req.runId,
          ticketId: req.ticket.id,
          status: "writing",
          detail: "Editing backend file",
          targetZone: "dev_pod_be",
        };
        markBeRunning();
        await bePaused;
      }
      yield {
        id: crypto.randomUUID(),
        ts: Date.now(),
        t: "agent.status",
        agentId: req.role.id,
        runId: req.runId,
        ticketId: req.ticket.id,
        status: "done",
        detail: "Completed",
        targetZone: req.role.zone,
      };
    },
  };

  const orch = new OfficeOrchestrator({
    config,
    store,
    workspace: createMemoryWorkspace("/tmp/wt-multi-sync"),
    runtimes: new Map([["ai-sdk", gatedAiSdk]]),
  });

  const t1Res = await orch.submitTicket({
    title: "Completed ticket",
    description: "Finish under claude",
    size: "S",
    authorRole: "be",
    mode: "live",
    autoApproveMerge: true,
  });
  const t1Done = await t1Res.completion;
  assert.equal(t1Done.stage, "Done");

  const t2Res = await orch.submitTicket({
    title: "Active ticket",
    description: "Pause mid-be",
    size: "S",
    authorRole: "be",
    mode: "live",
    autoApproveMerge: true,
  });
  await beStarted;

  orch.setActiveProvider("kimi_code", "ai-sdk", "kimi-k2");

  const snapAfterSwitch = orch.getSnapshot();
  const t1Rows = Object.values(snapAfterSwitch.taskTable).filter(
    (r) => r.ticketId === t1Done.id
  );
  assert.ok(t1Rows.length > 0);
  for (const row of t1Rows) {
    assert.equal(row.provider, "claude");
    assert.equal(row.subAgentId, `sub-claude-${row.role}-${row.order}`);
  }

  const t2BeRow = Object.values(snapAfterSwitch.taskTable).find(
    (r) => r.ticketId === t2Res.ticket.id && r.role === "be"
  );
  assert.equal(t2BeRow?.provider, "kimi_code");
  assert.equal(t2BeRow?.status, "running");

  assert.equal(snapAfterSwitch.agents.be.currentTicketId, t2Res.ticket.id);
  assert.equal(snapAfterSwitch.agents.be.status, "writing");
  assert.equal(snapAfterSwitch.agents.be.targetZone, "dev_pod_be");

  releaseBe();
  const t2Done = await t2Res.completion;
  assert.equal(t2Done.stage, "Done");
  store.close();
});

test("createModelDiscoveryAdapter caches live results, deduplicates concurrent calls, and falls back to curated on timeout/missing key", async () => {
  const store = new SQLiteOfficeStore(":memory:");
  store.setSecret("ANTHROPIC_API_KEY", "sk-ant-live-key");

  let now = 1_000_000;
  let fetchCalls = 0;
  let jcodeCalls = 0;
  let shouldFailFetch = false;

  const discovery = createModelDiscoveryAdapter(store, undefined, {
    nowFn: () => now,
    ttlMs: 30_000,
    errorTtlMs: 5_000,
    execFileFn: async (_bin, args) => {
      jcodeCalls += 1;
      assert.equal(args[0], "model");
      assert.equal(args[1], "list");
      return {
        stdout: JSON.stringify({
          models: ["default", "gemini-2.5-pro", "gemini-3-flash"],
          routes: [
            { model: "gemini-2.5-pro", available: true },
            { model: "gemini-3-flash", available: true },
            { model: "unavailable-model", available: false },
          ],
        }),
        stderr: "",
      };
    },
    fetchFn: async (url) => {
      fetchCalls += 1;
      assert.equal(url, "https://api.anthropic.com/v1/models");
      if (shouldFailFetch) {
        throw new Error("Simulated timeout");
      }
      return new Response(
        JSON.stringify({
          data: [
            { id: "claude-sonnet-4-5-20250929" },
            { id: "claude-opus-4-6-preview" },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    },
  });

  // Concurrent calls for the same provider share a single in-flight probe.
  const [c1, c2] = await Promise.all([
    discovery.discoverModels("claude"),
    discovery.discoverModels("claude"),
  ]);
  assert.equal(fetchCalls, 1);
  assert.equal(c1.source, "live");
  assert.deepEqual(c1.discoveredIds, [
    "claude-sonnet-4-5-20250929",
    "claude-opus-4-6-preview",
  ]);
  assert.deepEqual(c2, c1);

  // Subsequent call within TTL hits cache.
  now += 10_000;
  const c3 = await discovery.discoverModels("claude");
  assert.equal(fetchCalls, 1);
  assert.deepEqual(c3, c1);

  // forceRefresh bypasses TTL cache.
  const c4 = await discovery.discoverModels("claude", { forceRefresh: true });
  assert.equal(fetchCalls, 2);
  assert.equal(c4.source, "live");

  // clearCache forces re-fetch and handles error fallback to curated.
  shouldFailFetch = true;
  discovery.clearCache("claude");
  const fallback = await discovery.discoverModels("claude");
  assert.equal(fetchCalls, 3);
  assert.equal(fallback.source, "curated");
  assert.deepEqual(fallback.discoveredIds, []);

  // Missing API key returns curated immediately with zero network calls.
  const openaiNoKey = await discovery.discoverModels("openai_api");
  assert.equal(fetchCalls, 3);
  assert.equal(openaiNoKey.source, "curated");

  // jcode-oauth provider parses available routes and drops unavailable/"default".
  const ag = await discovery.discoverModels("antigravity");
  assert.equal(jcodeCalls, 1);
  assert.equal(ag.source, "live");
  assert.deepEqual(ag.discoveredIds, ["gemini-2.5-pro", "gemini-3-flash"]);

  store.close();
});

test("HTTP model catalog and override endpoints validate inputs, persist across SQLite replay, and reset on provider switch", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ao-http-models-"));
  const dbPath = path.join(tmpDir, "office.sqlite3");

  const startSystem = async () => {
    const sys = createOfficeSystem({ dbPath, stepDelayMs: 5 });
    const discovery = createModelDiscoveryAdapter(sys.store, sys.config.providers, {
      execFileFn: async () => ({
        stdout: JSON.stringify({
          routes: [
            { model: "gemini-2.5-pro", available: true },
            { model: "gemini-live-extra", available: true },
          ],
        }),
        stderr: "",
      }),
      fetchFn: async () =>
        new Response(
          JSON.stringify({
            data: [{ id: "claude-opus-4-5-20251101" }, { id: "claude-live-new" }],
          }),
          { status: 200 }
        ),
    });
    const srv = await startOfficeHttpServer({
      orchestrator: sys.orchestrator,
      secrets: sys.store,
      fixturesDir: path.join(rootDir, "apps/server/fixtures"),
      host: "127.0.0.1",
      port: 0,
      modelDiscovery: discovery,
    });
    return { sys, srv };
  };

  let ctx1 = await startSystem();
  try {
    const base = `http://127.0.0.1:${ctx1.srv.port}`;

    // GET /api/models returns all 6 providers.
    const allRes = await fetch(`${base}/api/models`);
    assert.equal(allRes.status, 200);
    const allJson = (await allRes.json()) as {
      activeProvider: string;
      providers: Record<string, { source: string; models: Array<{ id: string }> }>;
    };
    assert.equal(allJson.activeProvider, "antigravity");
    assert.equal(Object.keys(allJson.providers).length, 6);
    assert.equal(allJson.providers["antigravity"]?.source, "live");
    assert.ok(
      allJson.providers["antigravity"]?.models.some(
        (m) => m.id === "gemini-live-extra"
      )
    );

    // Invalid provider id returns 400.
    const badProvRes = await fetch(`${base}/api/providers/bogus/models`);
    assert.equal(badProvRes.status, 400);

    // Switch to claude + set secret + verify live discovery & cache invalidation.
    const secretRes = await fetch(`${base}/api/settings/secrets`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ keyName: "ANTHROPIC_API_KEY", value: "sk-ant-ok" }),
    });
    assert.equal(secretRes.status, 200);

    const claudeCatalogRes = await fetch(`${base}/api/providers/claude/models`);
    assert.equal(claudeCatalogRes.status, 200);
    const claudeCatalog = (await claudeCatalogRes.json()) as {
      source: string;
      models: Array<{ id: string }>;
    };
    assert.equal(claudeCatalog.source, "live");
    assert.ok(claudeCatalog.models.some((m) => m.id === "claude-live-new"));

    // Invalid roleModels / model / resetRoles return 400.
    const badRoleRes = await fetch(`${base}/api/provider/models`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roleModels: { hacker: "bad-model" } }),
    });
    assert.equal(badRoleRes.status, 400);

    const badResetRes = await fetch(`${base}/api/provider/models`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resetRoles: "yes" }),
    });
    assert.equal(badResetRes.status, 400);

    // Switch provider to claude and set default model + per-role overrides.
    const switchRes = await fetch(`${base}/api/provider`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: "claude",
        runtime: "ai-sdk",
        model: "claude-haiku-4-5-20251001",
        roleModels: {
          tl: "claude-opus-4-5-20251101",
          fe: "claude-sonnet-4-5-20250929",
        },
      }),
    });
    assert.equal(switchRes.status, 200);

    // Partial PATCH updates one role while keeping existing roleModels.
    const patchRes = await fetch(`${base}/api/provider/models`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        roleModels: { be: "claude-opus-4-1-20250805", fe: null },
      }),
    });
    assert.equal(patchRes.status, 200);
    const patchJson = (await patchRes.json()) as {
      activeModel: string | null;
      roleModels: Record<string, string>;
    };
    assert.equal(patchJson.activeModel, "claude-haiku-4-5-20251001");
    assert.deepEqual(patchJson.roleModels, {
      tl: "claude-opus-4-5-20251101",
      be: "claude-opus-4-1-20250805",
    });

    // Reject control characters and malformed percent-encoding with HTTP 400.
    const badCtrlRes = await fetch(`${base}/api/provider/models`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "claude\x1b[31mevil" }),
    });
    assert.equal(badCtrlRes.status, 400);

    const badUriRes = await fetch(`${base}/api/providers/%ZZ/models`);
    assert.equal(badUriRes.status, 400);

    // Same-provider runtime switch without model preserves activeModel and roleModels.
    const sameProvRes = await fetch(`${base}/api/provider`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "claude", runtime: "jcode" }),
    });
    assert.equal(sameProvRes.status, 200);
    assert.equal(
      ctx1.sys.orchestrator.getSnapshot().activeModel,
      "claude-haiku-4-5-20251001"
    );

    // Emit >2,000 events before a final provider.changed to verify full SQLite replay.
    for (let i = 0; i < 2005; i += 1) {
      ctx1.sys.store.append({
        id: `replay-bulk-${i}`,
        ts: Date.now() + i,
        t: "agent.text",
        agentId: "fe",
        runId: "run-bulk",
        delta: ".",
      });
    }
    const postBulkRes = await fetch(`${base}/api/provider`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: "claude",
        runtime: "ai-sdk",
        model: "claude-haiku-4-5-20251001",
        roleModels: {
          tl: "claude-opus-4-5-20251101",
          be: "claude-opus-4-1-20250805",
        },
      }),
    });
    assert.equal(postBulkRes.status, 200);
  } finally {
    await ctx1.srv.close();
    ctx1.sys.store.close();
  }

  // Reopen SQLite from disk and verify model + roleModels replay accurately.
  const ctx2 = await startSystem();
  try {
    const base2 = `http://127.0.0.1:${ctx2.srv.port}`;
    const settingsRes = await fetch(`${base2}/api/settings`);
    assert.equal(settingsRes.status, 200);
    const settings = (await settingsRes.json()) as {
      activeProvider: string;
      activeModel: string | null;
      roleModels: Record<string, string>;
    };
    assert.equal(settings.activeProvider, "claude");
    assert.equal(settings.activeModel, "claude-haiku-4-5-20251001");
    assert.deepEqual(settings.roleModels, {
      tl: "claude-opus-4-5-20251101",
      be: "claude-opus-4-1-20250805",
    });

    // Switching to another provider clears stale overrides automatically.
    const switchGemini = await fetch(`${base2}/api/provider`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "gemini", runtime: "ai-sdk" }),
    });
    assert.equal(switchGemini.status, 200);
    const afterSwitch = ctx2.sys.orchestrator.getSnapshot();
    assert.equal(afterSwitch.activeProvider, "gemini");
    assert.equal(afterSwitch.activeModel, null);
    assert.deepEqual(afterSwitch.roleModels, {});
  } finally {
    await ctx2.srv.close();
    ctx2.sys.store.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("StageRunner and JcodeRuntimeAdapter pass resolved per-role -m <model> across all 8 roles on a single active provider", async () => {
  const store = new SQLiteOfficeStore(":memory:");
  store.setSecret("ANTHROPIC_API_KEY", "sk-ant-per-role");

  const config = {
    ...loadOfficeConfig(path.join(rootDir, "office.config.yaml")),
    activeProvider: "claude" as const,
    activeRuntime: "jcode" as const,
    activeModel: "claude-haiku-4-5-20251001",
    roleModels: {
      em: "claude-sonnet-4-5-20250929",
      pm: "claude-opus-4-1-20250805",
      tl: "claude-opus-4-5-20251101",
      fe: "claude-sonnet-4-5-20250929",
      be: "claude-opus-4-5-20251101",
      qa: "claude-sonnet-4-5-20250929",
      reviewer: "claude-opus-4-1-20250805",
      // devops intentionally unset to test fallback to activeModel
    },
  };

  const spawnedCalls: Array<{
    roleId: string;
    cliArgs: string[];
    modelFlag: string | undefined;
  }> = [];

  const jcodeAdapter = new JcodeRuntimeAdapter(
    store,
    "/home/skadi/.local/bin/jcode",
    async function* ({ cliArgs }) {
      const mIndex = cliArgs.indexOf("-m");
      const modelFlag = mIndex >= 0 ? cliArgs[mIndex + 1] : undefined;
      const roleMatch = cliArgs.join(" ").match(/--tools\s+\S+/);
      spawnedCalls.push({
        roleId: roleMatch ? roleMatch[0] : "",
        cliArgs,
        modelFlag,
      });
      yield JSON.stringify({ type: "assistant", text: "Stage completed" });
      yield JSON.stringify({
        type: "result",
        usage: { input_tokens: 100, output_tokens: 50 },
        cost_usd: 0.001,
      });
    }
  );

  const orch = new OfficeOrchestrator({
    config,
    store,
    workspace: createMemoryWorkspace("/tmp/wt-per-role-models"),
    runtimes: new Map([["jcode", jcodeAdapter]]),
  });

  // L-size FE ticket exercises em, pm, tl, fe, reviewer, qa, devops (7 roles).
  const largeRes = await orch.submitTicket({
    title: "Per-role model test L",
    description: "Verify per-role -m flags",
    size: "L",
    authorRole: "fe",
    mode: "live",
    autoApproveMerge: true,
  });
  const largeDone = await largeRes.completion;
  assert.equal(largeDone.stage, "Done");

  // S-size BE ticket exercises be role as well.
  const smallRes = await orch.submitTicket({
    title: "Per-role model test S",
    description: "Verify BE role override",
    size: "S",
    authorRole: "be",
    mode: "live",
    autoApproveMerge: true,
  });
  const smallDone = await smallRes.completion;
  assert.equal(smallDone.stage, "Done");

  const expectedByOrder = [
    "claude-sonnet-4-5-20250929", // em
    "claude-opus-4-1-20250805", // pm
    "claude-opus-4-5-20251101", // tl
    "claude-sonnet-4-5-20250929", // fe
    "claude-opus-4-1-20250805", // reviewer
    "claude-sonnet-4-5-20250929", // qa
    "claude-haiku-4-5-20251001", // devops (falls back to activeModel)
    "claude-sonnet-4-5-20250929", // em (ticket 2)
    "claude-opus-4-5-20251101", // be
    "claude-opus-4-1-20250805", // reviewer (ticket 2)
    "claude-haiku-4-5-20251001", // devops (ticket 2)
  ];
  assert.deepEqual(
    spawnedCalls.map((c) => c.modelFlag),
    expectedByOrder
  );

  // Verify TaskTableRow.model records resolved models per role.
  const snap = orch.getSnapshot();
  assert.equal(
    snap.taskTable[`${largeRes.ticket.id}-TASK-3`]?.model,
    "claude-opus-4-5-20251101"
  );
  assert.equal(
    snap.taskTable[`${largeRes.ticket.id}-TASK-7`]?.model,
    "claude-haiku-4-5-20251001"
  );
  assert.equal(
    snap.taskTable[`${smallRes.ticket.id}-TASK-2`]?.model,
    "claude-opus-4-5-20251101"
  );

  store.close();
});

test("OfficeOrchestrator.resolveApproval clears replayed and fixture approvals even without an in-memory promise", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ao-approval-replay-"));
  const dbPath = path.join(tmpDir, "office.sqlite3");
  const sys = createOfficeSystem({ dbPath, stepDelayMs: 5 });

  sys.orchestrator.emit({
    id: "ev-req-1",
    ts: Date.now(),
    t: "approval.req",
    reqId: "req-fixture-1",
    agentId: "tl",
    runId: "run-fixture-1",
    ticketId: "T-99",
    kind: "merge",
    action: "Merge agent/T-99 -> main",
    risk: "medium",
    reason: "Fixture approval gate",
  });

  assert.ok(sys.orchestrator.getSnapshot().approvals["req-fixture-1"]);
  assert.equal(
    sys.orchestrator.resolveApproval("req-fixture-1", false, "Denied in test"),
    true
  );
  assert.equal(
    sys.orchestrator.getSnapshot().approvals["req-fixture-1"],
    undefined
  );
  assert.equal(sys.orchestrator.getSnapshot().agents.tl.status, "error");
  assert.equal(sys.orchestrator.resolveApproval("req-unknown", true), false);

  sys.store.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
