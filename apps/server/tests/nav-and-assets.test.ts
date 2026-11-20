import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createOfficeNavGrid,
  findGridPath,
  IntentQueue,
  resolveCharacterIntent,
  worldToCell,
} from "../../web/src/scene/nav-and-intent.ts";
import { checkAssetBudgets } from "../../../assets/scripts/check_budgets.ts";
import { createOfficeSystem } from "../src/index.ts";
import { startOfficeHttpServer } from "../src/adapters/http/server.ts";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);

test("Grid A* finds obstacle-free path around office desks and returns null when goal cell is blocked", () => {
  const grid = createOfficeNavGrid();
  const pathPoints = findGridPath(
    grid,
    { x: -9.8, z: 4.5 },
    { x: 5.5, z: -7.6 }
  );
  assert.ok(pathPoints && pathPoints.length > 5);
  for (const pt of pathPoints) {
    const cell = worldToCell(grid, pt);
    assert.equal(
      grid.blocked.has(`${cell.c},${cell.r}`),
      false,
      `Path stepped onto blocked desk cell ${cell.c},${cell.r}`
    );
  }

  // Destination inside meeting table footprint (0.0, 1.5) is blocked -> returns null
  const blockedGoal = findGridPath(
    grid,
    { x: -9.8, z: 4.5 },
    { x: 0.0, z: 1.5 }
  );
  assert.equal(blockedGoal, null);
});

test("IntentQueue enforces 600ms minimum dwell and collapses backlogs larger than 3", () => {
  const pmRole = {
    id: "pm" as const,
    title: "Product Manager",
    zone: "planning_pod_pm",
    tint: "#ec4899",
    accessory: "sticky_pad",
    runtime: "ai-sdk" as const,
    provider: "kimi_code" as const,
    fallback: { runtime: "ai-sdk" as const, provider: "gemini" as const },
    tools: ["read"],
    allowCommands: [],
  };

  const makeIntent = (
    status: "idle" | "thinking" | "reading" | "writing" | "done" | "error"
  ) =>
    resolveCharacterIntent(pmRole, {
      id: "pm",
      status,
      detail: "",
      currentTicketId: null,
      targetZone: null,
      streamBuffer: "",
      activeTool: null,
      inTok: 0,
      outTok: 0,
      costUsd: 0,
    });

  const q = new IntentQueue(600, 3);
  const first = q.enqueue(makeIntent("idle"), 1000);
  assert.equal(first.status, "idle");

  // Rapid burst within 100ms (before 600ms dwell expires): push 5 intents
  q.enqueue(makeIntent("thinking"), 1100);
  q.enqueue(makeIntent("reading"), 1150);
  q.enqueue(makeIntent("writing"), 1200);
  q.enqueue(makeIntent("error"), 1250);
  const stillFirst = q.enqueue(makeIntent("done"), 1300);

  // Dwell keeps current at "idle", while backlog > 3 collapsed to 1 ("done")
  assert.equal(stillFirst.status, "idle");
  assert.equal(q.getQueueLength(), 1);

  // At t=1700 (>= 600ms dwell), advances directly to collapsed latest intent "done"
  const afterDwell = q.tick(1700);
  assert.equal(afterDwell.status, "done");
  assert.equal(afterDwell.arrivalClip, "Cheer");
});

test("Blender GLB asset budget checker passes on exported models and fails on empty directory", () => {
  const modelsDir = path.join(rootDir, "apps/web/public/models");
  const validErrors = checkAssetBudgets(modelsDir);
  assert.deepEqual(validErrors, []);

  const invalidErrors = checkAssetBudgets(os.tmpdir());
  assert.ok(invalidErrors.length >= 2);
});

test("Built 3D web application and GLB models are served over HTTP alongside fixture replay", async () => {
  const sys = createOfficeSystem({ dbPath: ":memory:" });
  const handle = await startOfficeHttpServer({
    orchestrator: sys.orchestrator,
    secrets: sys.store,
    fixturesDir: path.join(rootDir, "apps/server/fixtures"),
    staticDir: path.join(rootDir, "apps/web/dist"),
    host: "127.0.0.1",
    port: 0,
  });

  try {
    const baseUrl = `http://127.0.0.1:${handle.port}`;
    const htmlRes = await fetch(`${baseUrl}/`);
    assert.equal(htmlRes.status, 200);
    const htmlText = await htmlRes.text();
    assert.ok(htmlText.includes("Agent Office"));

    const modelNames = [
      "character_base.glb",
      "office_kit.glb",
      "desk_props.glb",
      "kitchen.glb",
      "lounge.glb",
      "plants.glb",
      "dog-corgi.glb",
    ];
    for (const modelName of modelNames) {
      const glbRes = await fetch(`${baseUrl}/models/${modelName}`);
      assert.equal(glbRes.status, 200, `Failed to serve ${modelName}`);
      assert.equal(glbRes.headers.get("content-type"), "model/gltf-binary");
      const glbBuf = Buffer.from(await glbRes.arrayBuffer());
      assert.equal(glbBuf.readUInt32LE(0), 0x46546c67);
    }

    const providerRes = await fetch(`${baseUrl}/api/provider`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "kimi_code" }),
    });
    assert.equal(providerRes.status, 200);
    assert.equal(sys.orchestrator.getSnapshot().activeProvider, "kimi_code");

    const fixtureRes = await fetch(`${baseUrl}/api/fixtures/l-ticket-handoff`, {
      method: "POST",
    });
    assert.equal(fixtureRes.status, 200);
    const snapAfterFixture = sys.orchestrator.getSnapshot();
    assert.equal(snapAfterFixture.tickets["T-202"]?.stage, "Done");
    const taskRows = Object.values(snapAfterFixture.taskTable);
    assert.ok(taskRows.length >= 6);
    for (const row of taskRows) {
      assert.equal(row.provider, "kimi_code");
      assert.ok(row.subAgentId.startsWith("sub-kimi_code-"));
    }

    const standupRes = await fetch(`${baseUrl}/api/standup`, {
      method: "POST",
    });
    assert.equal(standupRes.status, 200);
    const standupJson = (await standupRes.json()) as {
      ok: boolean;
      event: { summary: string };
    };
    assert.equal(standupJson.ok, true);
    assert.ok(standupJson.event.summary.includes("Daily Standup"));
  } finally {
    await handle.close();
  }
});
