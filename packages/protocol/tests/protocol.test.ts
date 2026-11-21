import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import {
  AgentEventSchema,
  OfficeConfigSchema,
  PROVIDER_DEFAULT_MODELS,
  RoleModelOverridesSchema,
  TicketSchema,
  createInitialOfficeState,
  normalizeRoleModels,
  officeReducer,
  resolveModelForRole,
  type AgentEvent,
} from "../src/index.ts";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

test("office.config.yaml validates against OfficeConfigSchema with single activeProvider and 8 roles", () => {
  const raw = fs.readFileSync(path.join(rootDir, "office.config.yaml"), "utf8");
  const parsedYaml = YAML.parse(raw);
  const result = OfficeConfigSchema.safeParse(parsedYaml);
  assert.equal(result.success, true, result.success ? "" : JSON.stringify(result.error.issues));
  if (result.success) {
    assert.equal(result.data.activeProvider, "antigravity");
    assert.equal(result.data.activeRuntime, "jcode");
    assert.equal(result.data.roles.length, 8);
    assert.equal(result.data.providers.antigravity?.jcodeProvider, "antigravity");
    assert.equal(result.data.providers.kimi_code?.baseUrl, "https://api.kimi.com/coding/v1");
    for (const role of result.data.roles) {
      assert.equal("provider" in role, false);
      assert.equal("runtime" in role, false);
      assert.equal("fallback" in role, false);
    }
  }
});

test("OfficeConfigSchema accepts minimal single-provider config without per-role providers or perProvider limits", () => {
  const minimal = {
    version: 1,
    activeProvider: "kimi_code",
    office: { name: "Minimal", targetRepo: "./repo", worktreesDir: "./wt" },
    limits: { concurrency: { total: 4 } },
    roles: ["em", "pm", "tl", "fe", "be", "qa", "reviewer", "devops"].map((id) => ({
      id,
      title: id.toUpperCase(),
      zone: `zone_${id}`,
      tint: "#112233",
      accessory: "clipboard",
      tools: ["read"],
      allowCommands: [],
    })),
  };
  const result = OfficeConfigSchema.safeParse(minimal);
  assert.equal(result.success, true, result.success ? "" : JSON.stringify(result.error.issues));
  if (result.success) {
    assert.equal(result.data.activeProvider, "kimi_code");
    assert.deepEqual(result.data.providers, {});
    assert.equal(result.data.limits.concurrency.total, 4);
  }
});

test("OfficeConfigSchema rejects invalid role count or malformed tint color", () => {
  const bad = {
    version: 1,
    office: { name: "Bad", targetRepo: "./repo", worktreesDir: "./wt" },
    providers: {},
    limits: { concurrency: { total: 2 } },
    roles: [],
  };
  const res = OfficeConfigSchema.safeParse(bad);
  assert.equal(res.success, false);
});

test("Legacy authorProvider fields in persisted tickets and events are stripped cleanly during replay", () => {
  const legacyTicket = {
    id: "T-LEGACY",
    title: "Legacy ticket",
    description: "Has authorProvider from older schema",
    size: "S",
    stage: "Done",
    assignee: "devops",
    authorRole: "be",
    authorProvider: "claude",
    reviewRounds: 0,
    qaBounces: 0,
    spentUsd: 0.01,
    comments: [],
    createdAt: 1000,
    updatedAt: 2000,
  };
  const parsedTicket = TicketSchema.parse(legacyTicket);
  assert.equal(parsedTicket.id, "T-LEGACY");
  assert.equal("authorProvider" in parsedTicket, false);

  const parsedEvent = AgentEventSchema.parse({
    id: "ev-legacy",
    ts: 2000,
    t: "ticket.upsert",
    ticket: legacyTicket,
  });
  assert.equal(parsedEvent.t, "ticket.upsert");
  if (parsedEvent.t === "ticket.upsert") {
    assert.equal("authorProvider" in parsedEvent.ticket, false);
  }
});

test("AgentEventSchema rejects malformed events and officeReducer deterministically folds valid events", () => {
  const invalid = AgentEventSchema.safeParse({ t: "agent.status", agentId: "unknown_role" });
  assert.equal(invalid.success, false);

  const events: AgentEvent[] = [
    {
      id: "e1",
      ts: 1000,
      t: "ticket.upsert",
      ticket: {
        id: "T-1",
        title: "Add multiply helper",
        description: "Implement multiply(a,b) in math.ts",
        size: "S",
        stage: "InProgress",
        assignee: "fe",
        authorRole: "fe",
        reviewRounds: 0,
        qaBounces: 0,
        spentUsd: 0,
        comments: [],
        createdAt: 1000,
        updatedAt: 1000,
      },
    },
    {
      id: "e2",
      ts: 1010,
      t: "agent.status",
      agentId: "fe",
      runId: "run-1",
      ticketId: "T-1",
      status: "writing",
      detail: "Editing src/math.ts",
    },
    {
      id: "e3",
      ts: 1020,
      t: "handoff",
      from: "fe",
      to: "reviewer",
      ticketId: "T-1",
      stage: "Review",
      note: "Ready for diff review",
    },
    {
      id: "e4",
      ts: 1030,
      t: "usage",
      agentId: "fe",
      runId: "run-1",
      ticketId: "T-1",
      provider: "openai_oauth",
      inTok: 400,
      outTok: 120,
      costUsd: 0.012,
    },
  ];

  let state = createInitialOfficeState();
  for (const ev of events) {
    const checked = AgentEventSchema.parse(ev);
    state = officeReducer(state, checked);
  }

  assert.equal(state.eventCount, 4);
  assert.equal(state.tickets["T-1"]?.title, "Add multiply helper");
  assert.equal(state.agents.fe.status, "handoff");
  assert.equal(state.agents.reviewer.currentTicketId, "T-1");
  assert.equal(state.totalCostUsd, 0.012);
});

test("officeReducer preserves untouched map references while remaining strictly immutable", () => {
  const initial = createInitialOfficeState();
  assert.equal(initial.activeModel, null);

  const afterText = officeReducer(initial, {
    id: "e-text",
    ts: 2000,
    t: "agent.text",
    agentId: "fe",
    runId: "run-1",
    ticketId: "T-1",
    delta: "hello ",
  });

  assert.notEqual(afterText, initial);
  assert.notEqual(afterText.agents, initial.agents);
  assert.notEqual(afterText.agents.fe, initial.agents.fe);
  assert.equal(afterText.agents.be, initial.agents.be);
  assert.equal(afterText.tickets, initial.tickets);
  assert.equal(afterText.taskTable, initial.taskTable);
  assert.equal(afterText.approvals, initial.approvals);
  assert.equal(initial.agents.fe.streamBuffer, "");
  assert.equal(afterText.agents.fe.streamBuffer, "hello ");

  const afterProvider = officeReducer(afterText, {
    id: "e-prov",
    ts: 2010,
    t: "provider.changed",
    provider: "kimi_code",
    runtime: "ai-sdk",
  });
  assert.equal(afterProvider.agents, afterText.agents);
  assert.equal(afterProvider.tickets, afterText.tickets);
  assert.equal(afterProvider.taskTable, afterText.taskTable);
  assert.equal(afterProvider.approvals, afterText.approvals);
  assert.equal(afterProvider.activeProvider, "kimi_code");
  assert.equal(afterProvider.activeRuntime, "ai-sdk");
  assert.equal(afterProvider.activeModel, null);

  const afterModelSet = officeReducer(afterProvider, {
    id: "e-prov-model",
    ts: 2015,
    t: "provider.changed",
    provider: "claude",
    runtime: "ai-sdk",
    model: "claude-opus-4-1",
  });
  assert.equal(afterModelSet.activeProvider, "claude");
  assert.equal(afterModelSet.activeModel, "claude-opus-4-1");

  const afterProviderResetModel = officeReducer(afterModelSet, {
    id: "e-prov-reset",
    ts: 2018,
    t: "provider.changed",
    provider: "gemini",
    runtime: "ai-sdk",
  });
  assert.equal(afterProviderResetModel.activeProvider, "gemini");
  assert.equal(afterProviderResetModel.activeModel, null);

  const afterTicket = officeReducer(afterProvider, {
    id: "e-tkt",
    ts: 2020,
    t: "ticket.upsert",
    ticket: {
      id: "T-2",
      title: "Preserve refs",
      description: "Check untouched maps",
      size: "S",
      stage: "InProgress",
      assignee: "fe",
      authorRole: "fe",
      reviewRounds: 0,
      qaBounces: 0,
      spentUsd: 0,
      comments: [],
      createdAt: 2020,
      updatedAt: 2020,
    },
  });
  assert.notEqual(afterTicket.tickets, afterProvider.tickets);
  assert.equal(afterTicket.agents, afterProvider.agents);
  assert.equal(afterTicket.taskTable, afterProvider.taskTable);
  assert.equal(afterTicket.approvals, afterProvider.approvals);
  assert.equal(afterProvider.tickets["T-2"], undefined);

  const afterEmptyTasks = officeReducer(afterTicket, {
    id: "e-empty-tasks",
    ts: 2030,
    t: "task.table.set",
    ticketId: "T-2",
    rows: [],
  });
  assert.equal(afterEmptyTasks.taskTable, afterTicket.taskTable);
  assert.equal(afterEmptyTasks.agents, afterTicket.agents);

  const afterUnknownApproval = officeReducer(afterEmptyTasks, {
    id: "e-unknown-res",
    ts: 2040,
    t: "approval.res",
    reqId: "missing-req",
    approved: true,
    resolvedBy: "director",
  });
  assert.equal(afterUnknownApproval.approvals, afterEmptyTasks.approvals);
  assert.equal(afterUnknownApproval.agents, afterEmptyTasks.agents);
});

test("officeReducer task.table.set protects active-ticket agents and terminal-ticket state", () => {
  let state = createInitialOfficeState();
  state = officeReducer(state, {
    id: "t1-upsert",
    ts: 1000,
    t: "ticket.upsert",
    ticket: {
      id: "T-1",
      title: "Completed ticket",
      description: "Done",
      size: "S",
      stage: "Done",
      assignee: null,
      authorRole: "be",
      reviewRounds: 0,
      qaBounces: 0,
      spentUsd: 0.01,
      comments: [],
      createdAt: 1000,
      updatedAt: 1000,
    },
  });
  state = officeReducer(state, {
    id: "t2-upsert",
    ts: 1010,
    t: "ticket.upsert",
    ticket: {
      id: "T-2",
      title: "Active ticket",
      description: "Running",
      size: "S",
      stage: "InProgress",
      assignee: "be",
      authorRole: "be",
      reviewRounds: 0,
      qaBounces: 0,
      spentUsd: 0,
      comments: [],
      createdAt: 1010,
      updatedAt: 1010,
    },
  });
  state = officeReducer(state, {
    id: "t2-be-status",
    ts: 1020,
    t: "agent.status",
    agentId: "be",
    runId: "run-t2",
    ticketId: "T-2",
    status: "writing",
    detail: "Implementing T-2",
    targetZone: "dev_pod_be",
  });
  state = officeReducer(state, {
    id: "t2-table",
    ts: 1025,
    t: "task.table.set",
    ticketId: "T-2",
    rows: [
      {
        id: "T-2:be",
        ticketId: "T-2",
        order: 2,
        role: "be",
        provider: "claude",
        subAgentId: "sub-claude-be-2",
        title: "Implement T-2",
        artifactOrCmd: "src/t2.ts",
        status: "running",
        outputPreview: "",
        updatedAt: 1025,
      },
    ],
  });

  const beforeSync = state;
  const afterDoneSync = officeReducer(beforeSync, {
    id: "t1-sync",
    ts: 1030,
    t: "task.table.set",
    ticketId: "T-1",
    rows: [
      {
        id: "T-1:be",
        ticketId: "T-1",
        order: 2,
        role: "be",
        provider: "kimi_code",
        subAgentId: "sub-kimi_code-be-2",
        title: "Implement T-1",
        artifactOrCmd: "src/t1.ts",
        status: "done",
        outputPreview: "Done",
        updatedAt: 1030,
      },
    ],
  });

  assert.equal(afterDoneSync.taskTable["T-1:be"]?.provider, "kimi_code");
  assert.equal(afterDoneSync.agents, beforeSync.agents);
  assert.equal(afterDoneSync.agents.be.currentTicketId, "T-2");
  assert.equal(afterDoneSync.agents.be.status, "writing");
  assert.equal(afterDoneSync.agents.be.targetZone, "dev_pod_be");
  assert.equal(afterDoneSync.agents.be.subAgentId, "sub-claude-be-2");

  // Submitting a queued third ticket T-3 must not hijack an agent actively working on T-2.
  const afterQueuedT3 = officeReducer(afterDoneSync, {
    id: "t3-upsert",
    ts: 1040,
    t: "ticket.upsert",
    ticket: {
      id: "T-3",
      title: "Queued ticket",
      description: "Waiting",
      size: "S",
      stage: "Triage",
      assignee: "em",
      authorRole: "be",
      reviewRounds: 0,
      qaBounces: 0,
      spentUsd: 0,
      comments: [],
      createdAt: 1040,
      updatedAt: 1040,
    },
  });
  const afterT3Table = officeReducer(afterQueuedT3, {
    id: "t3-table",
    ts: 1045,
    t: "task.table.set",
    ticketId: "T-3",
    rows: [
      {
        id: "T-3:be",
        ticketId: "T-3",
        order: 2,
        role: "be",
        provider: "claude",
        subAgentId: "sub-claude-be-2",
        title: "Implement T-3",
        artifactOrCmd: "src/t3.ts",
        status: "queued",
        outputPreview: "",
        updatedAt: 1045,
      },
    ],
  });
  assert.equal(afterT3Table.taskTable["T-3:be"]?.status, "queued");
  assert.equal(afterT3Table.agents, afterQueuedT3.agents);
  assert.equal(afterT3Table.agents.be.currentTicketId, "T-2");
  assert.equal(afterT3Table.agents.be.targetZone, "dev_pod_be");
});

test("RoleModelOverridesSchema, normalizeRoleModels, and resolveModelForRole enforce precedence and strict keys", () => {
  const valid = RoleModelOverridesSchema.safeParse({
    tl: "claude-opus-4-5-20251101",
    fe: null,
  });
  assert.equal(valid.success, true);

  const invalidKey = RoleModelOverridesSchema.safeParse({
    unknown_role: "gpt-5",
  });
  assert.equal(invalidKey.success, false);

  const invalidNewline = RoleModelOverridesSchema.safeParse({
    tl: "gpt-5\nbad",
  });
  assert.equal(invalidNewline.success, false);

  assert.deepEqual(
    normalizeRoleModels({
      tl: "  claude-opus-4-5-20251101  ",
      fe: null,
      be: undefined,
    }),
    { tl: "claude-opus-4-5-20251101" }
  );

  assert.equal(
    resolveModelForRole({
      provider: "claude",
      roleId: "tl",
      activeModel: "claude-haiku-4-5-20251001",
      roleModels: { tl: "claude-opus-4-5-20251101" },
    }),
    "claude-opus-4-5-20251101"
  );
  assert.equal(
    resolveModelForRole({
      provider: "claude",
      roleId: "fe",
      activeModel: "claude-haiku-4-5-20251001",
      roleModels: { tl: "claude-opus-4-5-20251101" },
    }),
    "claude-haiku-4-5-20251001"
  );
  assert.equal(
    resolveModelForRole({
      provider: "openai_oauth",
      roleId: "be",
      activeModel: null,
      roleModels: {},
    }),
    PROVIDER_DEFAULT_MODELS.openai_oauth
  );
  assert.equal(PROVIDER_DEFAULT_MODELS.openai_oauth, "gpt-5.4");
});

test("officeReducer resets roleModels on cross-provider switch, preserves on same-provider runtime switch, and propagates task row models", () => {
  let state = createInitialOfficeState();
  assert.deepEqual(state.roleModels, {});
  assert.equal(state.agents.tl.model, null);

  state = officeReducer(state, {
    id: "ev-models-1",
    ts: 1000,
    t: "provider.changed",
    provider: "claude",
    runtime: "ai-sdk",
    model: "claude-sonnet-4-5-20250929",
    roleModels: { tl: "claude-opus-4-5-20251101", fe: null },
  });
  assert.equal(state.activeProvider, "claude");
  assert.equal(state.activeModel, "claude-sonnet-4-5-20250929");
  assert.deepEqual(state.roleModels, { tl: "claude-opus-4-5-20251101" });

  // Same-provider runtime change without roleModels preserves existing roleModels.
  state = officeReducer(state, {
    id: "ev-models-2",
    ts: 1010,
    t: "provider.changed",
    provider: "claude",
    runtime: "claude-agent-sdk",
    model: "claude-sonnet-4-5-20250929",
  });
  assert.equal(state.activeRuntime, "claude-agent-sdk");
  assert.deepEqual(state.roleModels, { tl: "claude-opus-4-5-20251101" });

  // Cross-provider switch without roleModels clears stale overrides.
  state = officeReducer(state, {
    id: "ev-models-3",
    ts: 1020,
    t: "provider.changed",
    provider: "gemini",
    runtime: "ai-sdk",
  });
  assert.equal(state.activeProvider, "gemini");
  assert.equal(state.activeModel, null);
  assert.deepEqual(state.roleModels, {});

  // Task table row model propagates to agent live state.
  state = officeReducer(state, {
    id: "ev-task-model",
    ts: 1030,
    t: "task.table.set",
    ticketId: "T-M1",
    rows: [
      {
        id: "T-M1:tl",
        ticketId: "T-M1",
        order: 1,
        role: "tl",
        provider: "gemini",
        subAgentId: "sub-gemini-tl-1",
        model: "gemini-2.5-pro",
        title: "Design",
        artifactOrCmd: "docs/adr.md",
        status: "running",
        outputPreview: "",
        updatedAt: 1030,
      },
    ],
  });
  assert.equal(state.taskTable["T-M1:tl"]?.model, "gemini-2.5-pro");
  assert.equal(state.agents.tl.model, "gemini-2.5-pro");
});

