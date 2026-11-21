import { z } from "zod";

export const AgentRoleIdSchema = z.enum([
  "em",
  "pm",
  "tl",
  "fe",
  "be",
  "qa",
  "reviewer",
  "devops",
]);
export type AgentRoleId = z.infer<typeof AgentRoleIdSchema>;

export const AgentStatusSchema = z.enum([
  "idle",
  "thinking",
  "reading",
  "writing",
  "executing",
  "browsing",
  "waiting_approval",
  "handoff",
  "standup",
  "error",
  "done",
]);
export type AgentStatus = z.infer<typeof AgentStatusSchema>;

export const TicketSizeSchema = z.enum(["S", "M", "L"]);
export type TicketSize = z.infer<typeof TicketSizeSchema>;

export const TicketStageSchema = z.enum([
  "Triage",
  "Spec",
  "Design",
  "InProgress",
  "Review",
  "QA",
  "ReadyToMerge",
  "Done",
  "Escalated",
]);
export type TicketStage = z.infer<typeof TicketStageSchema>;

export const ProviderIdSchema = z.enum([
  "antigravity",
  "claude",
  "openai_oauth",
  "openai_api",
  "kimi_code",
  "gemini",
]);
export type ProviderId = z.infer<typeof ProviderIdSchema>;

export const RuntimeKindSchema = z.enum([
  "ai-sdk",
  "jcode",
  "claude-agent-sdk",
  "codex-sdk",
  "scripted",
]);
export type RuntimeKind = z.infer<typeof RuntimeKindSchema>;

export const TicketCommentSchema = z.object({
  id: z.string(),
  author: z.union([AgentRoleIdSchema, z.literal("director")]),
  stage: TicketStageSchema,
  body: z.string(),
  createdAt: z.number(),
});
export type TicketComment = z.infer<typeof TicketCommentSchema>;

export const TicketSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  description: z.string(),
  size: TicketSizeSchema,
  stage: TicketStageSchema,
  assignee: AgentRoleIdSchema.nullable(),
  authorRole: z.enum(["fe", "be"]).default("fe"),
  branch: z.string().optional(),
  worktreePath: z.string().optional(),
  specPath: z.string().optional(),
  adrPath: z.string().optional(),
  diffPreview: z.string().optional(),
  reviewRounds: z.number().int().nonnegative().default(0),
  qaBounces: z.number().int().nonnegative().default(0),
  spentUsd: z.number().nonnegative().default(0),
  escalationReason: z.string().optional(),
  comments: z.array(TicketCommentSchema).default([]),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Ticket = z.infer<typeof TicketSchema>;

export const ModelIdValueSchema = z
  .string()
  .refine(
    (s) => !/[\u0000-\u001f\u007f]/.test(s),
    "Model ID cannot contain control characters"
  )
  .transform((s) => s.trim())
  .pipe(
    z
      .string()
      .min(1, "Model ID cannot be empty")
      .max(160, "Model ID exceeds 160 character limit")
  );

const RoleOverrideValueSchema = ModelIdValueSchema.nullable();

export const RoleModelOverridesSchema = z
  .object({
    em: RoleOverrideValueSchema,
    pm: RoleOverrideValueSchema,
    tl: RoleOverrideValueSchema,
    fe: RoleOverrideValueSchema,
    be: RoleOverrideValueSchema,
    qa: RoleOverrideValueSchema,
    reviewer: RoleOverrideValueSchema,
    devops: RoleOverrideValueSchema,
  })
  .partial()
  .strict();
export type RoleModelOverrides = z.infer<typeof RoleModelOverridesSchema>;

export const RoleModelMapSchema = z
  .object({
    em: ModelIdValueSchema,
    pm: ModelIdValueSchema,
    tl: ModelIdValueSchema,
    fe: ModelIdValueSchema,
    be: ModelIdValueSchema,
    qa: ModelIdValueSchema,
    reviewer: ModelIdValueSchema,
    devops: ModelIdValueSchema,
  })
  .partial()
  .strict();
export type RoleModelMap = z.infer<typeof RoleModelMapSchema>;

export const ModelTierSchema = z.enum([
  "flagship",
  "balanced",
  "fast",
  "reasoning",
  "coding",
  "custom",
]);
export type ModelTier = z.infer<typeof ModelTierSchema>;

export const ModelCatalogEntrySchema = z.object({
  id: ModelIdValueSchema,
  label: z.string().min(1),
  tier: ModelTierSchema,
  capabilitySummary: z.string().min(1),
  contextWindow: z.number().int().positive().optional(),
  maxOutputTokens: z.number().int().positive().optional(),
  isDefault: z.boolean().optional(),
  source: z.enum(["curated", "live", "custom"]),
  available: z.boolean(),
});
export type ModelCatalogEntry = z.infer<typeof ModelCatalogEntrySchema>;

export const ProviderModelCatalogSchema = z.object({
  provider: ProviderIdSchema,
  defaultModel: ModelIdValueSchema,
  activeModel: ModelIdValueSchema.nullable(),
  roleModels: RoleModelMapSchema,
  source: z.enum(["curated", "live"]),
  models: z.array(ModelCatalogEntrySchema),
  discoveredAt: z.string().min(1),
});
export type ProviderModelCatalog = z.infer<typeof ProviderModelCatalogSchema>;

export const ModelsCatalogResponseSchema = z.object({
  activeProvider: ProviderIdSchema,
  activeRuntime: RuntimeKindSchema,
  activeModel: ModelIdValueSchema.nullable(),
  roleModels: RoleModelMapSchema,
  providers: z.record(ProviderIdSchema, ProviderModelCatalogSchema),
});
export type ModelsCatalogResponse = z.infer<typeof ModelsCatalogResponseSchema>;

export const TaskStatusSchema = z.enum([
  "queued",
  "running",
  "waiting_approval",
  "done",
  "failed",
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TaskTableRowSchema = z.object({
  id: z.string().min(1),
  ticketId: z.string().min(1),
  order: z.number().int().nonnegative(),
  role: AgentRoleIdSchema,
  provider: ProviderIdSchema,
  subAgentId: z.string().min(1),
  model: z.string().trim().min(1).nullable().optional(),
  title: z.string().min(1),
  artifactOrCmd: z.string(),
  status: TaskStatusSchema,
  outputPreview: z.string().default(""),
  updatedAt: z.number().int().nonnegative(),
});
export type TaskTableRow = z.infer<typeof TaskTableRowSchema>;

export const ProviderConfigSchema = z.object({
  authMode: z.enum(["jcode-oauth", "api-key"]),
  binary: z.string().optional(),
  envKey: z.string().optional(),
  baseUrl: z.string().url().optional(),
  jcodeProvider: z.string(),
});
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

export const RoleConfigSchema = z.object({
  id: AgentRoleIdSchema,
  title: z.string().min(1),
  zone: z.string().min(1),
  tint: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  accessory: z.string().min(1),
  tools: z.array(z.string()),
  allowCommands: z.array(z.string()),
});
export type RoleConfig = z.infer<typeof RoleConfigSchema>;

export const OfficeConfigSchema = z.object({
  version: z.literal(1),
  activeProvider: ProviderIdSchema.default("antigravity"),
  activeRuntime: RuntimeKindSchema.optional(),
  activeModel: z.string().trim().min(1).nullable().optional(),
  roleModels: RoleModelOverridesSchema.optional(),
  office: z.object({
    name: z.string().min(1),
    host: z.string().default("127.0.0.1"),
    port: z.number().int().positive().default(4173),
    targetRepo: z.string().min(1),
    worktreesDir: z.string().min(1),
  }),
  providers: z.record(ProviderIdSchema, ProviderConfigSchema).default({}),
  limits: z.object({
    reviewRounds: z.number().int().positive().default(3),
    qaBounces: z.number().int().positive().default(2),
    askAgentPerStage: z.number().int().positive().default(3),
    maxTurnsPerStage: z.number().int().positive().default(25),
    ticketUsd: z.number().positive().default(2.0),
    dailyUsd: z.number().positive().default(15.0),
    concurrency: z.object({
      total: z.number().int().positive().default(4),
    }),
  }),
  roles: z.array(RoleConfigSchema).length(8),
});
export type OfficeConfig = z.infer<typeof OfficeConfigSchema>;

const BaseEventFields = {
  id: z.string(),
  ts: z.number(),
};

export const AgentEventSchema = z.discriminatedUnion("t", [
  z.object({
    ...BaseEventFields,
    t: z.literal("agent.status"),
    agentId: AgentRoleIdSchema,
    runId: z.string(),
    ticketId: z.string().optional(),
    status: AgentStatusSchema,
    detail: z.string().optional(),
    targetZone: z.string().optional(),
  }),
  z.object({
    ...BaseEventFields,
    t: z.literal("agent.text"),
    agentId: AgentRoleIdSchema,
    runId: z.string(),
    ticketId: z.string().optional(),
    delta: z.string(),
  }),
  z.object({
    ...BaseEventFields,
    t: z.literal("tool.start"),
    agentId: AgentRoleIdSchema,
    runId: z.string(),
    ticketId: z.string().optional(),
    callId: z.string(),
    tool: z.string(),
    summary: z.string(),
  }),
  z.object({
    ...BaseEventFields,
    t: z.literal("tool.end"),
    agentId: AgentRoleIdSchema,
    runId: z.string(),
    ticketId: z.string().optional(),
    callId: z.string(),
    ok: z.boolean(),
    preview: z.string().optional(),
  }),
  z.object({
    ...BaseEventFields,
    t: z.literal("approval.req"),
    reqId: z.string(),
    agentId: AgentRoleIdSchema,
    runId: z.string(),
    ticketId: z.string(),
    kind: z.enum(["command", "merge", "escalation"]),
    action: z.string(),
    risk: z.enum(["low", "medium", "high"]),
    reason: z.string(),
  }),
  z.object({
    ...BaseEventFields,
    t: z.literal("approval.res"),
    reqId: z.string(),
    approved: z.boolean(),
    resolvedBy: z.literal("director"),
    note: z.string().optional(),
  }),
  z.object({
    ...BaseEventFields,
    t: z.literal("handoff"),
    from: AgentRoleIdSchema,
    to: AgentRoleIdSchema,
    ticketId: z.string(),
    stage: TicketStageSchema,
    note: z.string(),
  }),
  z.object({
    ...BaseEventFields,
    t: z.literal("ticket.upsert"),
    ticket: TicketSchema,
  }),
  z.object({
    ...BaseEventFields,
    t: z.literal("standup.summary"),
    summary: z.string(),
    activeTickets: z.number().int().nonnegative(),
  }),
  z.object({
    ...BaseEventFields,
    t: z.literal("usage"),
    agentId: AgentRoleIdSchema,
    runId: z.string(),
    ticketId: z.string().optional(),
    provider: ProviderIdSchema,
    inTok: z.number().int().nonnegative(),
    outTok: z.number().int().nonnegative(),
    costUsd: z.number().nonnegative(),
  }),
  z.object({
    ...BaseEventFields,
    t: z.literal("provider.changed"),
    provider: ProviderIdSchema,
    runtime: RuntimeKindSchema,
    model: z.string().trim().min(1).nullable().optional(),
    roleModels: RoleModelOverridesSchema.optional(),
  }),
  z.object({
    ...BaseEventFields,
    t: z.literal("task.table.set"),
    ticketId: z.string(),
    rows: z.array(TaskTableRowSchema),
  }),
  z.object({
    ...BaseEventFields,
    t: z.literal("task.row.updated"),
    row: TaskTableRowSchema,
  }),
]);
export type AgentEvent = z.infer<typeof AgentEventSchema>;
