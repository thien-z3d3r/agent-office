import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { AgentEvent } from "@agent-office/protocol";
import { evaluateCommandPolicy } from "../../domain/command-policy.ts";
import { PROVIDER_METADATA } from "../../domain/providers.ts";
import { canRoleUseTool, mapToolToAgentStatus } from "../../domain/roles.ts";
import type {
  AgentRunRequest,
  AgentRuntimePort,
  SecretStorePort,
  WorkspacePort,
} from "../../ports/index.ts";
import {
  defaultProviderInvoker,
  type ModelTurnResult,
  type ProviderModelInvoker,
} from "./provider-invokers.ts";
import { buildRoleSystemPrompt } from "./tool-parser.ts";

export { defaultProviderInvoker };
export type { ModelTurnResult, ProviderModelInvoker };

export class AiSdkRuntimeAdapter implements AgentRuntimePort {
  readonly kind = "ai-sdk" as const;
  private readonly secrets: SecretStorePort;
  private readonly workspace: WorkspacePort;
  private readonly invoker: ProviderModelInvoker;
  private readonly maxTurns: number;

  constructor(
    secrets: SecretStorePort,
    workspace: WorkspacePort,
    invoker: ProviderModelInvoker = defaultProviderInvoker,
    maxTurns: number = 6
  ) {
    this.secrets = secrets;
    this.workspace = workspace;
    this.invoker = invoker;
    this.maxTurns = maxTurns;
  }

  async *run(req: AgentRunRequest): AsyncIterable<AgentEvent> {
    const uid = () => crypto.randomUUID();
    const provider = req.providerOverride ?? req.role.provider;
    const providerMeta = PROVIDER_METADATA[provider];
    const keyName = providerMeta.envKey;
    const apiKey = this.secrets.getSecret(keyName);

    if (!apiKey || !apiKey.trim()) {
      const errMsg = `Missing ${keyName} for role ${req.role.id} (${provider})`;
      yield {
        id: uid(),
        ts: Date.now(),
        t: "agent.status",
        agentId: req.role.id,
        runId: req.runId,
        ticketId: req.ticket.id,
        status: "error",
        detail: errMsg,
        targetZone: req.role.zone,
      };
      throw new Error(errMsg);
    }

    const model = req.role.model ?? providerMeta.defaultModel;
    const systemPrompt = buildRoleSystemPrompt(req.role);

    const messages: Array<{ role: "user" | "assistant"; content: string }> = [
      { role: "user", content: req.prompt },
    ];

    for (let turn = 0; turn < this.maxTurns; turn++) {
      yield {
        id: uid(),
        ts: Date.now(),
        t: "agent.status",
        agentId: req.role.id,
        runId: req.runId,
        ticketId: req.ticket.id,
        status: "thinking",
        detail: `${req.role.title} thinking (${provider} - turn ${turn + 1})`,
        targetZone: req.role.zone,
      };

      let turnRes: ModelTurnResult;
      try {
        turnRes = await this.invoker({
          provider,
          apiKey,
          model,
          systemPrompt,
          messages,
          signal: req.signal,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        yield {
          id: uid(),
          ts: Date.now(),
          t: "agent.status",
          agentId: req.role.id,
          runId: req.runId,
          ticketId: req.ticket.id,
          status: "error",
          detail: `${provider} error: ${msg}`,
          targetZone: req.role.zone,
        };
        throw err;
      }

      if (turnRes.text) {
        yield {
          id: uid(),
          ts: Date.now(),
          t: "agent.text",
          agentId: req.role.id,
          runId: req.runId,
          ticketId: req.ticket.id,
          delta: turnRes.text + "\n",
        };
      }

      yield {
        id: uid(),
        ts: Date.now(),
        t: "usage",
        agentId: req.role.id,
        runId: req.runId,
        ticketId: req.ticket.id,
        provider,
        inTok: turnRes.inTok,
        outTok: turnRes.outTok,
        costUsd: turnRes.costUsd,
      };

      const calls = turnRes.toolCalls ?? [];
      if (calls.length === 0) {
        break;
      }

      messages.push({ role: "assistant", content: turnRes.text });
      const observations: string[] = [];

      for (const call of calls) {
        const targetPath = call.args["path"];
        const permission = canRoleUseTool(
          req.role,
          call.tool,
          targetPath,
          req.worktreePath
        );

        yield {
          id: uid(),
          ts: Date.now(),
          t: "tool.start",
          agentId: req.role.id,
          runId: req.runId,
          ticketId: req.ticket.id,
          callId: call.id,
          tool: call.tool,
          summary: targetPath ?? call.args["command"] ?? call.tool,
        };

        if (!permission.allowed) {
          yield {
            id: uid(),
            ts: Date.now(),
            t: "tool.end",
            agentId: req.role.id,
            runId: req.runId,
            ticketId: req.ticket.id,
            callId: call.id,
            ok: false,
            preview: permission.reason,
          };
          observations.push(`Tool ${call.tool} DENIED: ${permission.reason}`);
          continue;
        }

        const status = mapToolToAgentStatus(call.tool);
        yield {
          id: uid(),
          ts: Date.now(),
          t: "agent.status",
          agentId: req.role.id,
          runId: req.runId,
          ticketId: req.ticket.id,
          status,
          detail: `${call.tool}: ${targetPath ?? call.args["command"] ?? ""}`,
          targetZone: req.role.zone,
        };

        if (call.tool === "write" && targetPath) {
          const full = path.resolve(req.worktreePath, targetPath);
          fs.mkdirSync(path.dirname(full), { recursive: true });
          fs.writeFileSync(full, call.args["content"] ?? "", "utf8");
          yield {
            id: uid(),
            ts: Date.now(),
            t: "tool.end",
            agentId: req.role.id,
            runId: req.runId,
            ticketId: req.ticket.id,
            callId: call.id,
            ok: true,
            preview: `Wrote ${targetPath}`,
          };
          observations.push(`Wrote ${targetPath} successfully.`);
        } else if (call.tool === "read" && targetPath) {
          const full = path.resolve(req.worktreePath, targetPath);
          const content = fs.existsSync(full)
            ? fs.readFileSync(full, "utf8").slice(0, 4000)
            : "[File not found]";
          yield {
            id: uid(),
            ts: Date.now(),
            t: "tool.end",
            agentId: req.role.id,
            runId: req.runId,
            ticketId: req.ticket.id,
            callId: call.id,
            ok: fs.existsSync(full),
            preview: `Read ${targetPath} (${content.length} chars)`,
          };
          observations.push(`Content of ${targetPath}:\n${content}`);
        } else if (call.tool === "run_command" || call.tool === "bash") {
          const command = call.args["command"] ?? "";
          const policy = evaluateCommandPolicy(
            command,
            req.role.allowCommands,
            req.worktreePath
          );

          if (policy.decision === "deny") {
            yield {
              id: uid(),
              ts: Date.now(),
              t: "tool.end",
              agentId: req.role.id,
              runId: req.runId,
              ticketId: req.ticket.id,
              callId: call.id,
              ok: false,
              preview: `Policy DENY: ${policy.reason}`,
            };
            observations.push(`Command DENIED by policy: ${policy.reason}`);
            continue;
          }

          if (policy.decision === "ask") {
            const approved = await req.requestApproval({
              kind: "command",
              action: command,
              risk: policy.risk,
              reason: policy.reason,
            });
            if (!approved) {
              yield {
                id: uid(),
                ts: Date.now(),
                t: "tool.end",
                agentId: req.role.id,
                runId: req.runId,
                ticketId: req.ticket.id,
                callId: call.id,
                ok: false,
                preview: `Director rejected command: ${command}`,
              };
              observations.push(`Command rejected by Director: ${command}`);
              continue;
            }
          }

          const execRes = await this.workspace.runShellCommand(
            req.worktreePath,
            command
          );
          const ok = execRes.exitCode === 0;
          yield {
            id: uid(),
            ts: Date.now(),
            t: "tool.end",
            agentId: req.role.id,
            runId: req.runId,
            ticketId: req.ticket.id,
            callId: call.id,
            ok,
            preview: (execRes.stdout || execRes.stderr || `exit ${execRes.exitCode}`).slice(
              0,
              140
            ),
          };
          observations.push(
            `Exit ${execRes.exitCode}\nstdout: ${execRes.stdout}\nstderr: ${execRes.stderr}`
          );
        } else {
          yield {
            id: uid(),
            ts: Date.now(),
            t: "tool.end",
            agentId: req.role.id,
            runId: req.runId,
            ticketId: req.ticket.id,
            callId: call.id,
            ok: true,
            preview: `Executed ${call.tool}`,
          };
          observations.push(`Tool ${call.tool} completed.`);
        }
      }

      messages.push({
        role: "user",
        content: `Tool observations:\n${observations.join("\n---\n")}`,
      });
    }

    yield {
      id: uid(),
      ts: Date.now(),
      t: "agent.status",
      agentId: req.role.id,
      runId: req.runId,
      ticketId: req.ticket.id,
      status: "done",
      detail: `${req.role.title} completed stage ${req.ticket.stage}`,
      targetZone: req.role.zone,
    };
  }
}
