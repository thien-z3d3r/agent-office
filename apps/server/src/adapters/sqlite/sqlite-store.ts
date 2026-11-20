import { DatabaseSync, type StatementSync } from "node:sqlite";
import crypto from "node:crypto";
import {
  AgentEventSchema,
  TicketSchema,
  type AgentEvent,
  type AgentRoleId,
  type Ticket,
} from "@agent-office/protocol";
import { MANAGED_SECRET_KEYS } from "../../domain/providers.ts";
import type { EventStorePort, SecretStorePort } from "../../ports/index.ts";

export class SQLiteOfficeStore implements EventStorePort, SecretStorePort {
  private readonly db: DatabaseSync;
  private readonly masterKey: Buffer;
  private stmtAppendEvent!: StatementSync;
  private stmtListEvents!: StatementSync;
  private stmtSaveTicket!: StatementSync;
  private stmtGetTicket!: StatementSync;
  private stmtListTickets!: StatementSync;
  private stmtSaveStageRun!: StatementSync;
  private stmtMarkInterrupted!: StatementSync;
  private stmtListInterrupted!: StatementSync;
  private stmtSetSecret!: StatementSync;
  private stmtGetSecret!: StatementSync;
  private stmtListSecrets!: StatementSync;

  constructor(
    dbPath: string = ":memory:",
    secretPassphrase: string = process.env["OFFICE_MASTER_KEY"] ??
      "agent-office-local-dev-key-change-me"
  ) {
    this.db = new DatabaseSync(dbPath);
    if (dbPath !== ":memory:") {
      this.db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
    }
    this.masterKey = crypto.scryptSync(secretPassphrase, "agent-office-salt-v1", 32);
    this.initSchema();
    this.prepareStatements();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        ts INTEGER NOT NULL,
        type TEXT NOT NULL,
        payload TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tickets (
        id TEXT PRIMARY KEY,
        stage TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        payload TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS stage_runs (
        run_id TEXT PRIMARY KEY,
        ticket_id TEXT NOT NULL,
        role_id TEXT NOT NULL,
        stage TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        ended_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS secrets (
        key_name TEXT PRIMARY KEY,
        iv TEXT NOT NULL,
        auth_tag TEXT NOT NULL,
        ciphertext TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
  }

  private prepareStatements(): void {
    this.stmtAppendEvent = this.db.prepare(
      `INSERT OR REPLACE INTO events (id, ts, type, payload) VALUES (?, ?, ?, ?)`
    );
    this.stmtListEvents = this.db.prepare(
      `SELECT payload FROM events ORDER BY seq ASC LIMIT ?`
    );
    this.stmtSaveTicket = this.db.prepare(
      `INSERT OR REPLACE INTO tickets (id, stage, updated_at, payload) VALUES (?, ?, ?, ?)`
    );
    this.stmtGetTicket = this.db.prepare(
      `SELECT payload FROM tickets WHERE id = ?`
    );
    this.stmtListTickets = this.db.prepare(
      `SELECT payload FROM tickets ORDER BY updated_at DESC`
    );
    this.stmtSaveStageRun = this.db.prepare(
      `INSERT OR REPLACE INTO stage_runs (run_id, ticket_id, role_id, stage, status, started_at, ended_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    this.stmtMarkInterrupted = this.db.prepare(
      `UPDATE stage_runs SET status = 'interrupted', ended_at = ? WHERE status = 'running'`
    );
    this.stmtListInterrupted = this.db.prepare(
      `SELECT run_id as runId, ticket_id as ticketId, role_id as roleId, stage FROM stage_runs WHERE status = 'interrupted'`
    );
    this.stmtSetSecret = this.db.prepare(
      `INSERT OR REPLACE INTO secrets (key_name, iv, auth_tag, ciphertext, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    );
    this.stmtGetSecret = this.db.prepare(
      `SELECT iv, auth_tag, ciphertext FROM secrets WHERE key_name = ?`
    );
    this.stmtListSecrets = this.db.prepare(
      `SELECT key_name, ciphertext FROM secrets`
    );
  }

  close(): void {
    this.db.close();
  }

  append(event: AgentEvent): void {
    const validated = AgentEventSchema.parse(event);
    this.stmtAppendEvent.run(
      validated.id,
      validated.ts,
      validated.t,
      JSON.stringify(validated)
    );
    if (validated.t === "ticket.upsert") {
      this.saveTicket(validated.ticket);
    }
  }

  listAll(limit: number = 1000): AgentEvent[] {
    const rows = this.stmtListEvents.all(limit) as Array<{ payload: string }>;
    return rows.map((r) => AgentEventSchema.parse(JSON.parse(r.payload)));
  }

  saveTicket(ticket: Ticket): void {
    const validated = TicketSchema.parse(ticket);
    this.stmtSaveTicket.run(
      validated.id,
      validated.stage,
      validated.updatedAt,
      JSON.stringify(validated)
    );
  }

  getTicket(id: string): Ticket | null {
    const row = this.stmtGetTicket.get(id) as { payload: string } | undefined;
    if (!row) return null;
    return TicketSchema.parse(JSON.parse(row.payload));
  }

  listTickets(): Ticket[] {
    const rows = this.stmtListTickets.all() as Array<{ payload: string }>;
    return rows.map((r) => TicketSchema.parse(JSON.parse(r.payload)));
  }

  saveStageRun(run: {
    runId: string;
    ticketId: string;
    roleId: AgentRoleId;
    stage: string;
    status: "running" | "completed" | "failed" | "interrupted";
    startedAt: number;
    endedAt?: number;
  }): void {
    this.stmtSaveStageRun.run(
      run.runId,
      run.ticketId,
      run.roleId,
      run.stage,
      run.status,
      run.startedAt,
      run.endedAt ?? null
    );
  }

  markInterruptedRunsOnStartup(): number {
    const res = this.stmtMarkInterrupted.run(Date.now());
    return Number(res.changes ?? 0);
  }

  listInterruptedRuns(): Array<{
    runId: string;
    ticketId: string;
    roleId: string;
    stage: string;
  }> {
    return this.stmtListInterrupted.all() as Array<{
      runId: string;
      ticketId: string;
      roleId: string;
      stage: string;
    }>;
  }

  setSecret(keyName: string, plaintext: string): void {
    // Normalize whitespace-only values to empty ciphertext so listConfiguredKeys can inspect length without decrypting.
    const normalizedPlaintext = plaintext.trim().length === 0 ? "" : plaintext;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.masterKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(normalizedPlaintext, "utf8"),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    this.stmtSetSecret.run(
      keyName,
      iv.toString("hex"),
      authTag.toString("hex"),
      encrypted.toString("hex"),
      Date.now()
    );
  }

  getSecret(keyName: string): string | null {
    const row = this.stmtGetSecret.get(keyName) as
      | { iv: string; auth_tag: string; ciphertext: string }
      | undefined;
    if (!row) {
      return process.env[keyName] ?? null;
    }
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      this.masterKey,
      Buffer.from(row.iv, "hex")
    );
    decipher.setAuthTag(Buffer.from(row.auth_tag, "hex"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(row.ciphertext, "hex")),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  }

  listConfiguredKeys(): Record<string, boolean> {
    const rows = this.stmtListSecrets.all() as Array<{
      key_name: string;
      ciphertext: string;
    }>;
    const dbMap = new Map(rows.map((r) => [r.key_name, r.ciphertext]));
    const result: Record<string, boolean> = {};
    for (const k of MANAGED_SECRET_KEYS) {
      const ciphertext = dbMap.get(k);
      if (ciphertext !== undefined) {
        result[k] = ciphertext.length > 0;
      } else {
        result[k] = Boolean(process.env[k]?.trim());
      }
    }
    return result;
  }
}
