import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import {
  OfficeConfigSchema,
  type OfficeConfig,
  type RuntimeKind,
} from "@agent-office/protocol";
import { OfficeOrchestrator } from "./application/orchestrator.ts";
import type { AgentRuntimePort } from "./ports/index.ts";
import { SQLiteOfficeStore } from "./adapters/sqlite/sqlite-store.ts";
import { GitWorktreeAdapter } from "./adapters/git/git-worktree.ts";
import { ScriptedRuntimeAdapter } from "./adapters/runtimes/scripted-runtime.ts";
import { JcodeRuntimeAdapter } from "./adapters/runtimes/jcode-runtime.ts";
import { AiSdkRuntimeAdapter } from "./adapters/runtimes/ai-sdk-runtime.ts";
import { startOfficeHttpServer } from "./adapters/http/server.ts";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);

export function loadOfficeConfig(
  configPath: string = path.join(rootDir, "office.config.yaml")
): OfficeConfig {
  const raw = fs.readFileSync(configPath, "utf8");
  return OfficeConfigSchema.parse(YAML.parse(raw));
}

export function createOfficeSystem(options?: {
  dbPath?: string;
  configPath?: string;
  stepDelayMs?: number;
}) {
  const config = loadOfficeConfig(options?.configPath);
  const dbPath =
    options?.dbPath ?? path.join(rootDir, ".office-data", "office.sqlite3");
  if (dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const store = new SQLiteOfficeStore(dbPath);
  const targetRepo = path.resolve(rootDir, config.office.targetRepo);
  const worktreesDir = path.resolve(rootDir, config.office.worktreesDir);
  const workspace = new GitWorktreeAdapter(targetRepo, worktreesDir);

  const runtimes = new Map<RuntimeKind, AgentRuntimePort>();
  runtimes.set("scripted", new ScriptedRuntimeAdapter(options?.stepDelayMs ?? 120));
  runtimes.set("jcode", new JcodeRuntimeAdapter(store));
  runtimes.set("ai-sdk", new AiSdkRuntimeAdapter(store, workspace));

  const orchestrator = new OfficeOrchestrator({
    config,
    store,
    workspace,
    runtimes,
  });

  return {
    config,
    store,
    workspace,
    runtimes,
    orchestrator,
  };
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const sys = createOfficeSystem();
  const staticDir = path.join(rootDir, "apps/web/dist");
  const fixturesDir = path.join(rootDir, "apps/server/fixtures");
  const port = Number(process.env["PORT"] ?? sys.config.office.port);
  const host = process.env["HOST"] ?? sys.config.office.host;

  startOfficeHttpServer({
    orchestrator: sys.orchestrator,
    secrets: sys.store,
    fixturesDir,
    staticDir,
    host,
    port,
    accessToken: process.env["OFFICE_ACCESS_TOKEN"],
  }).then((handle) => {
    console.log(
      `Agent Office server running at http://${host}:${handle.port}`
    );
  });
}
