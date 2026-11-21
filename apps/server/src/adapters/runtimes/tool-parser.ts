import crypto from "node:crypto";
import type { RoleConfig } from "@agent-office/protocol";

export interface ParsedToolCall {
  id: string;
  tool: string;
  args: Record<string, string>;
}

export function parseStructuredToolBlocks(text: string): ParsedToolCall[] {
  const calls: ParsedToolCall[] = [];
  const regex = /```tool\s*\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1]!.trim()) as {
        tool?: string;
        args?: Record<string, string>;
      };
      if (parsed.tool) {
        calls.push({
          id: crypto.randomUUID(),
          tool: parsed.tool,
          args: parsed.args ?? {},
        });
      }
    } catch {
      // Skip malformed JSON fences in model prose without failing the turn.
    }
  }
  return calls;
}

export function buildRoleSystemPrompt(role: RoleConfig): string {
  return [
    `You are the ${role.title} (${role.id}) in Agent Office.`,
    `Allowed tools: ${role.tools.join(", ")}.`,
    `To invoke a tool, emit a fenced block:`,
    "```tool",
    `{"tool":"write","args":{"path":"relative/path.txt","content":"..."}}`,
    "```",
    `When finished with your stage without further tool calls, provide your concise summary.`,
  ].join("\n");
}
