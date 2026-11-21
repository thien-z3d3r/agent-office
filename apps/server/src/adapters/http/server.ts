import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import {
  ProviderIdSchema,
  RoleModelOverridesSchema,
  RuntimeKindSchema,
  type AgentRoleId,
  type ProviderId,
  type ProviderModelCatalog,
  type RuntimeKind,
  type TicketSize,
} from "@agent-office/protocol";
import type { OfficeOrchestrator } from "../../application/orchestrator.ts";
import {
  ALL_PROVIDER_IDS,
  mergeCuratedAndDiscoveredModels,
  validateModelString,
} from "../../domain/model-catalog.ts";
import {
  MANAGED_SECRET_KEY_SET,
  PROVIDER_METADATA,
} from "../../domain/providers.ts";
import type {
  ModelDiscoveryPort,
  SecretStorePort,
} from "../../ports/index.ts";
import { probeJcodeAuthStatus } from "../runtimes/jcode-runtime.ts";
import { createModelDiscoveryAdapter } from "../runtimes/model-discovery.ts";
import { loadJsonlFixture } from "../runtimes/scripted-runtime.ts";

const DEFAULT_MAX_BODY_BYTES = 1_048_576;

export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function readJsonBody(
  req: http.IncomingMessage,
  maxBytes: number = DEFAULT_MAX_BODY_BYTES
): Promise<Record<string, unknown>> {
  const contentLength = Number(req.headers["content-length"]);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new HttpError(413, `Request body exceeds ${maxBytes} byte limit`);
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buf.byteLength;
    if (totalBytes > maxBytes) {
      throw new HttpError(413, `Request body exceeds ${maxBytes} byte limit`);
    }
    chunks.push(buf);
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new HttpError(400, "Invalid JSON request body");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new HttpError(400, "JSON request body must be an object");
  }
  return parsed as Record<string, unknown>;
}

function sendJson(
  res: http.ServerResponse,
  status: number,
  payload: unknown
): void {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
    "access-control-allow-headers": "content-type,authorization",
  });
  res.end(JSON.stringify(payload));
}

function resolveCacheControl(pathname: string, ext: string): string {
  if (pathname.startsWith("/assets/")) {
    return "public, max-age=31536000, immutable";
  }
  if (pathname.startsWith("/models/")) {
    return "public, max-age=86400";
  }
  if (ext === ".html" || pathname === "/") {
    return "no-cache";
  }
  return "no-cache";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export interface OfficeServerHandle {
  server: http.Server;
  port: number;
  close: () => Promise<void>;
}

export async function startOfficeHttpServer(args: {
  orchestrator: OfficeOrchestrator;
  secrets: SecretStorePort;
  fixturesDir: string;
  staticDir?: string;
  host?: string;
  port?: number;
  accessToken?: string;
  modelDiscovery?: ModelDiscoveryPort;
}): Promise<OfficeServerHandle> {
  const { orchestrator, secrets, fixturesDir, staticDir } = args;
  const modelDiscovery =
    args.modelDiscovery ??
    createModelDiscoveryAdapter(secrets, orchestrator.getConfig().providers);
  const resolvedStaticDir = staticDir ? path.resolve(staticDir) : null;
  const host = args.host ?? orchestrator.getConfig().office.host ?? "127.0.0.1";
  const requestedPort = args.port ?? orchestrator.getConfig().office.port ?? 4173;
  const isLoopback = host === "127.0.0.1" || host === "localhost" || host === "::1";

  if (!isLoopback && !args.accessToken) {
    throw new Error(
      `Binding to non-loopback host "${host}" requires OFFICE_ACCESS_TOKEN to be set`
    );
  }

  const buildProviderCatalog = async (
    provider: ProviderId,
    forceRefresh: boolean
  ): Promise<ProviderModelCatalog> => {
    const snap = orchestrator.getSnapshot();
    const discovery = await modelDiscovery.discoverModels(provider, {
      forceRefresh,
    });
    const isCurrent = provider === snap.activeProvider;
    return {
      provider,
      defaultModel: PROVIDER_METADATA[provider].defaultModel,
      activeModel: isCurrent ? snap.activeModel ?? null : null,
      roleModels: isCurrent ? snap.roleModels : {},
      source: discovery.source,
      models: mergeCuratedAndDiscoveredModels(
        provider,
        discovery.discoveredIds
      ),
      discoveredAt: discovery.discoveredAt,
    };
  };

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === "OPTIONS") {
        sendJson(res, 204, {});
        return;
      }

      if (args.accessToken) {
        const auth = req.headers["authorization"];
        if (auth !== `Bearer ${args.accessToken}`) {
          sendJson(res, 401, { error: "Unauthorized: valid Bearer token required" });
          return;
        }
      }

      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

      if (req.method === "GET" && url.pathname === "/api/health") {
        sendJson(res, 200, {
          ok: true,
          office: orchestrator.getConfig().office.name,
        });
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/state") {
        sendJson(res, 200, {
          state: orchestrator.getSnapshot(),
          roles: orchestrator.getConfig().roles,
          limits: orchestrator.getConfig().limits,
        });
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/settings") {
        const snap = orchestrator.getSnapshot();
        const jcodeAuth = await probeJcodeAuthStatus();
        sendJson(res, 200, {
          activeProvider: snap.activeProvider,
          activeRuntime: snap.activeRuntime,
          activeModel: snap.activeModel ?? null,
          roleModels: snap.roleModels,
          configuredKeys: secrets.listConfiguredKeys(),
          jcodeAuth,
          providers: orchestrator.getConfig().providers,
        });
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/models") {
        const forceRefresh = url.searchParams.get("refresh") === "1";
        const snap = orchestrator.getSnapshot();
        const catalogs = await Promise.all(
          ALL_PROVIDER_IDS.map((providerId) =>
            buildProviderCatalog(providerId, forceRefresh)
          )
        );
        const providers = {} as Record<ProviderId, ProviderModelCatalog>;
        for (const cat of catalogs) {
          providers[cat.provider] = cat;
        }
        sendJson(res, 200, {
          activeProvider: snap.activeProvider,
          activeRuntime: snap.activeRuntime,
          activeModel: snap.activeModel ?? null,
          roleModels: snap.roleModels,
          providers,
        });
        return;
      }

      const providerModelsMatch = url.pathname.match(
        /^\/api\/providers\/([^/]+)\/models$/
      );
      if (req.method === "GET" && providerModelsMatch) {
        let rawProvider = "";
        try {
          rawProvider = decodeURIComponent(providerModelsMatch[1] ?? "");
        } catch {
          sendJson(res, 400, { error: "Invalid provider id" });
          return;
        }
        const parsedProvider = ProviderIdSchema.safeParse(rawProvider);
        if (!parsedProvider.success) {
          sendJson(res, 400, { error: "Invalid provider id" });
          return;
        }
        const forceRefresh = url.searchParams.get("refresh") === "1";
        const snap = orchestrator.getSnapshot();
        const catalog = await buildProviderCatalog(
          parsedProvider.data,
          forceRefresh
        );
        sendJson(res, 200, {
          ...catalog,
          activeProvider: snap.activeProvider,
          activeRuntime: snap.activeRuntime,
        });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/settings/secrets") {
        const body = await readJsonBody(req);
        const keyName = String(body["keyName"] ?? "");
        const value = String(body["value"] ?? "");
        if (!MANAGED_SECRET_KEY_SET.has(keyName)) {
          sendJson(res, 400, { error: `Unsupported secret key "${keyName}"` });
          return;
        }
        secrets.setSecret(keyName, value);
        modelDiscovery.clearCache();
        sendJson(res, 200, {
          ok: true,
          configuredKeys: secrets.listConfiguredKeys(),
        });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/tickets") {
        const body = await readJsonBody(req);
        const title = String(body["title"] ?? "").trim();
        const description = String(body["description"] ?? "").trim();
        if (!title) {
          sendJson(res, 400, { error: "Ticket title is required" });
          return;
        }
        const size = (body["size"] as TicketSize | undefined) ?? "S";
        const authorRole = (body["authorRole"] as "fe" | "be" | undefined) ?? "fe";
        const mode = (body["mode"] as "scripted" | "live" | undefined) ?? "scripted";
        const autoApproveMerge = Boolean(body["autoApproveMerge"] ?? false);

        const { ticket } = await orchestrator.submitTicket({
          title,
          description,
          size,
          authorRole,
          mode,
          autoApproveMerge,
        });
        sendJson(res, 201, { ticket });
        return;
      }

      if (req.method === "POST" && url.pathname.startsWith("/api/approvals/")) {
        const reqId = url.pathname.slice("/api/approvals/".length);
        const body = await readJsonBody(req);
        const approved = Boolean(body["approved"]);
        const note = body["note"] ? String(body["note"]) : undefined;
        const found = orchestrator.resolveApproval(reqId, approved, note);
        if (!found) {
          sendJson(res, 404, { error: `Approval request "${reqId}" not found` });
          return;
        }
        sendJson(res, 200, { ok: true, reqId, approved });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/standup") {
        const event = orchestrator.triggerStandup();
        sendJson(res, 200, { ok: true, event });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/provider") {
        const body = await readJsonBody(req);
        const parsedProvider = ProviderIdSchema.safeParse(body["provider"]);
        if (!parsedProvider.success) {
          sendJson(res, 400, { error: "Invalid provider id" });
          return;
        }
        let runtime: RuntimeKind | undefined;
        if (body["runtime"] !== undefined && body["runtime"] !== null) {
          const parsedRuntime = RuntimeKindSchema.safeParse(body["runtime"]);
          if (!parsedRuntime.success) {
            sendJson(res, 400, { error: "Invalid runtime kind" });
            return;
          }
          runtime = parsedRuntime.data;
        }
        let model: string | null | undefined;
        if (body["model"] !== undefined) {
          const modelCheck = validateModelString(body["model"]);
          if (!modelCheck.ok) {
            sendJson(res, 400, { error: modelCheck.error });
            return;
          }
          model = modelCheck.value;
        }
        let roleModels:
          | Partial<Record<AgentRoleId, string | null>>
          | undefined;
        if (body["roleModels"] !== undefined) {
          if (!isPlainObject(body["roleModels"])) {
            sendJson(res, 400, { error: "Invalid roleModels map" });
            return;
          }
          const parsedRoles = RoleModelOverridesSchema.safeParse(
            body["roleModels"]
          );
          if (!parsedRoles.success) {
            sendJson(res, 400, { error: "Invalid roleModels map" });
            return;
          }
          roleModels = parsedRoles.data;
        }
        try {
          const event = orchestrator.setActiveProvider(
            parsedProvider.data,
            runtime,
            model,
            roleModels
          );
          sendJson(res, 200, { ok: true, event });
        } catch (err) {
          throw new HttpError(
            400,
            err instanceof Error ? err.message : String(err)
          );
        }
        return;
      }

      if (
        (req.method === "POST" || req.method === "PATCH") &&
        (url.pathname === "/api/provider/models" ||
          (req.method === "POST" && url.pathname === "/api/models"))
      ) {
        const body = await readJsonBody(req);
        let model: string | null | undefined;
        if (body["model"] !== undefined) {
          const modelCheck = validateModelString(body["model"]);
          if (!modelCheck.ok) {
            sendJson(res, 400, { error: modelCheck.error });
            return;
          }
          model = modelCheck.value;
        }

        let roleModels:
          | Partial<Record<AgentRoleId, string | null>>
          | undefined;
        if (body["roleModels"] !== undefined) {
          if (!isPlainObject(body["roleModels"])) {
            sendJson(res, 400, { error: "Invalid roleModels override map" });
            return;
          }
          const parsedRoles = RoleModelOverridesSchema.safeParse(
            body["roleModels"]
          );
          if (!parsedRoles.success) {
            sendJson(res, 400, { error: "Invalid roleModels override map" });
            return;
          }
          roleModels = parsedRoles.data;
        }

        let resetRoles: boolean | undefined;
        if (body["resetRoles"] !== undefined) {
          if (typeof body["resetRoles"] !== "boolean") {
            sendJson(res, 400, { error: "resetRoles must be a boolean" });
            return;
          }
          resetRoles = body["resetRoles"];
        }

        const event = orchestrator.setModelConfig({
          model,
          roleModels,
          resetRoles,
        });
        const snap = orchestrator.getSnapshot();
        sendJson(res, 200, {
          ok: true,
          activeProvider: snap.activeProvider,
          activeRuntime: snap.activeRuntime,
          activeModel: snap.activeModel ?? null,
          roleModels: snap.roleModels,
          event,
        });
        return;
      }

      if (req.method === "POST" && url.pathname.startsWith("/api/fixtures/")) {
        const name = url.pathname
          .slice("/api/fixtures/".length)
          .replace(/[^a-zA-Z0-9_-]/g, "");
        const filePath = path.join(fixturesDir, `${name}.jsonl`);
        if (!fs.existsSync(filePath)) {
          sendJson(res, 404, { error: `Fixture "${name}" not found` });
          return;
        }
        const events = loadJsonlFixture(filePath);
        const touchedTickets = new Set<string>();
        for (const ev of events) {
          if (ev.t === "ticket.upsert") touchedTickets.add(ev.ticket.id);
          orchestrator.emit({
            ...ev,
            id: `${ev.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            ts: Date.now(),
          });
        }
        for (const ticketId of touchedTickets) {
          orchestrator.syncTaskTableForTicket(ticketId);
        }
        sendJson(res, 200, { ok: true, replayed: events.length });
        return;
      }

      if (req.method === "GET" && resolvedStaticDir) {
        const relPath = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
        const resolved = path.resolve(resolvedStaticDir, relPath);
        if (
          resolved === resolvedStaticDir ||
          resolved.startsWith(resolvedStaticDir + path.sep)
        ) {
          let stat: fs.Stats | null = null;
          try {
            stat = fs.statSync(resolved);
          } catch {
            stat = null;
          }
          if (stat?.isFile()) {
            const ext = path.extname(resolved).toLowerCase();
            const mime =
              ext === ".html"
                ? "text/html"
                : ext === ".js"
                  ? "application/javascript"
                  : ext === ".css"
                    ? "text/css"
                    : ext === ".glb"
                      ? "model/gltf-binary"
                      : ext === ".json"
                        ? "application/json"
                        : "application/octet-stream";
            res.writeHead(200, {
              "content-type": mime,
              "cache-control": resolveCacheControl(url.pathname, ext),
            });
            fs.createReadStream(resolved).pipe(res);
            return;
          }
        }
      }

      sendJson(res, 404, { error: "Not found" });
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      sendJson(res, status, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  const wss = new WebSocketServer({ server, path: "/ws" });
  const unsubscribeBroadcast = orchestrator.subscribe((event) => {
    if (wss.clients.size === 0) return;
    const payload = JSON.stringify({ type: "event", event });
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  });

  wss.on("connection", (ws: WebSocket, req) => {
    if (!isLoopback) {
      const origin = req.headers.origin ?? "";
      if (origin && !origin.includes(host) && !origin.includes("localhost")) {
        ws.close(1008, "Origin not allowed");
        return;
      }
    }

    ws.send(
      JSON.stringify({
        type: "snapshot",
        state: orchestrator.getSnapshot(),
        roles: orchestrator.getConfig().roles,
        limits: orchestrator.getConfig().limits,
      })
    );
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(requestedPort, host, () => resolve());
  });

  const addr = server.address();
  const actualPort = typeof addr === "object" && addr ? addr.port : requestedPort;

  return {
    server,
    port: actualPort,
    close: () =>
      new Promise<void>((resolve) => {
        unsubscribeBroadcast();
        for (const client of wss.clients) {
          client.terminate();
        }
        wss.close(() => {
          server.close(() => resolve());
        });
      }),
  };
}
