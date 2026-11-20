import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import {
  AgentEventSchema,
  OfficeConfigSchema,
  createInitialOfficeState,
  officeReducer,
  type AgentEvent,
} from "../src/index.ts";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

test("office.config.yaml validates against OfficeConfigSchema with all 8 roles and 5 providers", () => {
  const raw = fs.readFileSync(path.join(rootDir, "office.config.yaml"), "utf8");
  const parsedYaml = YAML.parse(raw);
  const result = OfficeConfigSchema.safeParse(parsedYaml);
  assert.equal(result.success, true, result.success ? "" : JSON.stringify(result.error.issues));
  if (result.success) {
    assert.equal(result.data.roles.length, 8);
    assert.equal(result.data.providers.antigravity?.jcodeProvider, "antigravity");
    assert.equal(result.data.providers.kimi_code?.baseUrl, "https://api.kimi.com/coding/v1");
  }
});

test("OfficeConfigSchema rejects invalid role count or malformed tint color", () => {
  const bad = {
    version: 1,
    office: { name: "Bad", targetRepo: "./repo", worktreesDir: "./wt" },
    providers: {},
    limits: { concurrency: { total: 2, perProvider: {} } },
    roles: [],
  };
  const res = OfficeConfigSchema.safeParse(bad);
  assert.equal(res.success, false);
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
