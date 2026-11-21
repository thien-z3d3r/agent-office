import type {
  AgentEvent,
  OfficeStateSnapshot,
  ProviderId,
  RoleConfig,
  RuntimeKind,
  TicketSize,
} from "@agent-office/protocol";

export interface JcodeAuthInfo {
  provider: string;
  status: string;
  authKind: string;
  detail: string;
}

export interface OfficeSettingsResponse {
  activeProvider?: ProviderId;
  activeRuntime?: RuntimeKind;
  activeModel?: string | null;
  configuredKeys: Record<string, boolean>;
  jcodeAuth: Record<string, JcodeAuthInfo>;
}

export interface SubmitTicketInput {
  title: string;
  description: string;
  size: TicketSize;
  authorRole: "fe" | "be";
  mode: "scripted" | "live";
}

export type FixtureName = "s-ticket" | "l-ticket-handoff" | "escalation";

async function readApiError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body?.error === "string" && body.error.trim().length > 0) {
      return body.error;
    }
  } catch {
  }
  return `Request failed (${res.status}${res.statusText ? ` ${res.statusText}` : ""})`;
}

async function ensureOk(res: Response): Promise<Response> {
  if (!res.ok) {
    throw new Error(await readApiError(res));
  }
  return res;
}

export async function fetchOfficeSettings(): Promise<OfficeSettingsResponse> {
  const res = await ensureOk(await fetch("/api/settings"));
  const data = (await res.json()) as Partial<OfficeSettingsResponse>;
  return {
    activeProvider: data.activeProvider,
    activeRuntime: data.activeRuntime,
    activeModel: data.activeModel ?? null,
    configuredKeys: data.configuredKeys ?? {},
    jcodeAuth: data.jcodeAuth ?? {},
  };
}

export async function postSecretKey(keyName: string, value: string): Promise<void> {
  await ensureOk(
    await fetch("/api/settings/secrets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ keyName, value }),
    })
  );
}

export async function postTicket(input: SubmitTicketInput): Promise<string | null> {
  const res = await ensureOk(
    await fetch("/api/tickets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    })
  );
  const data = (await res.json()) as { ticket?: { id?: string } };
  return typeof data.ticket?.id === "string" ? data.ticket.id : null;
}

export async function postApproval(reqId: string, approved: boolean): Promise<void> {
  await ensureOk(
    await fetch(`/api/approvals/${encodeURIComponent(reqId)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ approved }),
    })
  );
}

export async function postStandup(): Promise<void> {
  await ensureOk(await fetch("/api/standup", { method: "POST" }));
}

export async function postFixture(name: FixtureName): Promise<void> {
  await ensureOk(await fetch(`/api/fixtures/${name}`, { method: "POST" }));
}

export type ProviderChangedEvent = Extract<
  AgentEvent,
  { t: "provider.changed" }
>;

export async function postActiveProvider(
  provider: ProviderId,
  runtime?: RuntimeKind,
  model?: string | null
): Promise<ProviderChangedEvent | null> {
  const body: {
    provider: ProviderId;
    runtime?: RuntimeKind;
    model?: string | null;
  } = { provider };
  if (runtime !== undefined) body.runtime = runtime;
  if (model !== undefined) body.model = model;
  const res = await ensureOk(
    await fetch("/api/provider", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );
  try {
    const data = (await res.json()) as { event?: unknown };
    const ev = data?.event as Partial<ProviderChangedEvent> | undefined;
    if (ev && ev.t === "provider.changed" && ev.provider && ev.runtime) {
      return ev as ProviderChangedEvent;
    }
  } catch {
  }
  return null;
}

type ServerMessage =
  | { type: "snapshot"; state: OfficeStateSnapshot; roles?: RoleConfig[] }
  | { type: "event"; event: AgentEvent };

function parseServerMessage(raw: unknown): ServerMessage | null {
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ServerMessage> | null;
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.type === "snapshot" && parsed.state && typeof parsed.state === "object") {
      return parsed as ServerMessage;
    }
    if (parsed.type === "event" && parsed.event && typeof parsed.event === "object") {
      return parsed as ServerMessage;
    }
  } catch {
  }
  return null;
}

export interface SocketHandlers {
  onOpen: () => void;
  onClose: () => void;
  onSnapshot: (state: OfficeStateSnapshot, roles?: RoleConfig[]) => void;
  onEvent: (event: AgentEvent) => void;
}

const WS_BASE_RECONNECT_MS = 1000;
const WS_MAX_RECONNECT_MS = 15_000;

export function connectOfficeSocket(handlers: SocketHandlers): () => void {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/ws`;
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  let attempt = 0;

  const scheduleReconnect = () => {
    if (closed || reconnectTimer !== null) return;
    const exp = Math.min(WS_MAX_RECONNECT_MS, WS_BASE_RECONNECT_MS * 2 ** attempt);
    attempt = Math.min(attempt + 1, 6);
    const jittered = Math.round(exp * (0.85 + Math.random() * 0.3));
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, jittered);
  };

  const connect = () => {
    if (closed) return;
    const socket = new WebSocket(wsUrl);
    ws = socket;

    socket.onopen = () => {
      if (closed || ws !== socket) return;
      attempt = 0;
      handlers.onOpen();
    };

    socket.onclose = () => {
      if (ws === socket) ws = null;
      if (closed) return;
      handlers.onClose();
      scheduleReconnect();
    };

    socket.onmessage = (msg) => {
      if (closed || ws !== socket) return;
      const data = parseServerMessage(msg.data);
      if (!data) return;
      if (data.type === "snapshot") {
        handlers.onSnapshot(data.state, data.roles);
      } else {
        handlers.onEvent(data.event);
      }
    };
  };

  connect();

  return () => {
    closed = true;
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (ws) {
      // Detach handlers before closing so StrictMode cleanup cannot mutate the next mount's state.
      ws.onopen = null;
      ws.onclose = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.close();
      ws = null;
    }
  };
}
