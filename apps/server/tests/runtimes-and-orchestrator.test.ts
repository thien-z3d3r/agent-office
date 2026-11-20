import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";
import type { AgentEvent, RoleConfig, Ticket } from "@agent-office/protocol";
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
import { AiSdkRuntimeAdapter } from "../src/adapters/runtimes/ai-sdk-runtime.ts";
import {
  ClaudeAgentSdkRuntimeAdapter,
  CodexSdkRuntimeAdapter,
} from "../src/adapters/runtimes/sdk-harnesses.ts";
import {
  createOfficeSystem,
  loadOfficeConfig,
} from "../src/index.ts";
import { runRoleStage, type StageRunnerContext } from "../src/application/stage-runner.ts";
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
  runtime: "jcode",
  provider: "antigravity",
  fallback: { runtime: "ai-sdk", provider: "kimi_code" },
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

  // 1. Missing API key emits error status and throws
  const adapterNoKey = new AiSdkRuntimeAdapter(store, workspace);
  const errEvents: AgentEvent[] = [];
  await assert.rejects(async () => {
    for await (const ev of adapterNoKey.run({
      runId: "r-nokey",
      ticket: sampleTicket,
      role: { ...beRole, runtime: "ai-sdk", provider: "kimi_code" },
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

  // 2. With API key configured, writes hello.txt=42 and gates unlisted shell command on requestApproval
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
      runtime: "ai-sdk",
      provider: "kimi_code",
      tools: ["write", "run_command"],
    },
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
