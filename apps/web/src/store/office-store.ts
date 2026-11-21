import { create } from "zustand";
import {
  createInitialOfficeState,
  officeReducer,
  type AgentEvent,
  type AgentRoleId,
  type OfficeStateSnapshot,
  type ProviderId,
  type RoleConfig,
  type RuntimeKind,
} from "@agent-office/protocol";
import { DEFAULT_ROLES } from "./default-roles.ts";
import {
  connectOfficeSocket,
  fetchOfficeSettings,
  postActiveProvider,
  postApproval,
  postFixture,
  postSecretKey,
  postStandup,
  postTicket,
  type FixtureName,
  type JcodeAuthInfo,
  type SubmitTicketInput,
} from "./office-transport.ts";

export type { JcodeAuthInfo } from "./office-transport.ts";

export interface OfficeStoreState {
  snapshot: OfficeStateSnapshot;
  roles: RoleConfig[];
  connected: boolean;
  selectedRoleId: AgentRoleId;
  selectedTicketId: string | null;
  reducedMotion: boolean;
  performanceMode: boolean;
  settingsOpen: boolean;
  configuredKeys: Record<string, boolean>;
  jcodeAuth: Record<string, JcodeAuthInfo>;
  recentEvents: AgentEvent[];
  lastError: string | null;
  modelsError: string | null;
  setSelectedRole: (id: AgentRoleId) => void;
  setSelectedTicket: (id: string | null) => void;
  toggleReducedMotion: () => void;
  togglePerformanceMode: () => void;
  setSettingsOpen: (open: boolean) => void;
  clearError: () => void;
  setModelsError: (error: string | null) => void;
  connectSocket: () => () => void;
  fetchSettings: () => Promise<void>;
  saveSecretKey: (keyName: string, value: string) => Promise<void>;
  submitTicket: (input: SubmitTicketInput) => Promise<void>;
  resolveApproval: (reqId: string, approved: boolean) => Promise<void>;
  triggerStandup: () => Promise<void>;
  replayFixture: (name: FixtureName) => Promise<void>;
  setActiveProvider: (
    provider: ProviderId,
    runtime?: RuntimeKind,
    model?: string | null
  ) => Promise<void>;
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const PERFORMANCE_MODE_STORAGE_KEY = "agent-office:performance-mode";
const EVENT_BATCH_WINDOW_MS = 56;
const MAX_RECENT_EVENTS = 60;

function getReducedMotionMediaQuery(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return null;
  }
  return window.matchMedia(REDUCED_MOTION_QUERY);
}

function loadPerformanceMode(): boolean {
  try {
    if (
      typeof window === "undefined" ||
      typeof window.localStorage === "undefined"
    ) {
      return false;
    }
    return window.localStorage.getItem(PERFORMANCE_MODE_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function savePerformanceMode(enabled: boolean): void {
  try {
    if (
      typeof window === "undefined" ||
      typeof window.localStorage === "undefined"
    ) {
      return;
    }
    window.localStorage.setItem(
      PERFORMANCE_MODE_STORAGE_KEY,
      enabled ? "true" : "false"
    );
  } catch {
    // Ignore storage quota or private-browsing errors.
  }
}

function prependRecentEvents(
  prev: readonly AgentEvent[],
  batch: readonly AgentEvent[],
  immediate?: AgentEvent,
  limit = MAX_RECENT_EVENTS
): AgentEvent[] {
  const incomingCount = batch.length + (immediate ? 1 : 0);
  if (incomingCount === 0) return prev as AgentEvent[];

  const total = Math.min(limit, prev.length + incomingCount);
  const out = new Array<AgentEvent>(total);
  let writeIdx = 0;

  if (immediate && writeIdx < limit) {
    out[writeIdx++] = immediate;
  }
  for (let i = batch.length - 1; i >= 0 && writeIdx < limit; i--) {
    out[writeIdx++] = batch[i]!;
  }
  for (let i = 0; i < prev.length && writeIdx < limit; i++) {
    out[writeIdx++] = prev[i]!;
  }
  return out;
}

function enqueueCoalescedEvent(
  pending: AgentEvent[],
  event: Extract<AgentEvent, { t: "agent.text" | "usage" }>
): void {
  if (event.t === "agent.text") {
    for (let i = pending.length - 1; i >= 0; i--) {
      const existing = pending[i]!;
      if (
        existing.t === "agent.text" &&
        existing.agentId === event.agentId &&
        existing.runId === event.runId
      ) {
        pending[i] = {
          ...event,
          delta: (existing.delta + event.delta).slice(-1200),
        };
        return;
      }
    }
    pending.push({ ...event, delta: event.delta.slice(-1200) });
    return;
  }

  for (let i = pending.length - 1; i >= 0; i--) {
    const existing = pending[i]!;
    if (
      existing.t === "usage" &&
      existing.agentId === event.agentId &&
      existing.provider === event.provider &&
      existing.runId === event.runId
    ) {
      pending[i] = {
        ...event,
        inTok: existing.inTok + event.inTok,
        outTok: existing.outTok + event.outTok,
        costUsd: existing.costUsd + event.costUsd,
      };
      return;
    }
  }
  pending.push(event);
}

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export const useOfficeStore = create<OfficeStoreState>((set, get) => {
  let reducedMotionUserOverride = false;

  return {
    snapshot: createInitialOfficeState(),
    roles: DEFAULT_ROLES,
    connected: false,
    selectedRoleId: "be",
    selectedTicketId: null,
    reducedMotion: getReducedMotionMediaQuery()?.matches ?? false,
    performanceMode: loadPerformanceMode(),
    settingsOpen: false,
    configuredKeys: {},
    jcodeAuth: {},
    recentEvents: [],
    lastError: null,
    modelsError: null,

    setSelectedRole: (id) => set({ selectedRoleId: id }),
    setSelectedTicket: (id) => set({ selectedTicketId: id }),
    toggleReducedMotion: () => {
      reducedMotionUserOverride = true;
      set((s) => ({ reducedMotion: !s.reducedMotion }));
    },
    togglePerformanceMode: () => {
      set((s) => {
        const next = !s.performanceMode;
        savePerformanceMode(next);
        return { performanceMode: next };
      });
    },
    setSettingsOpen: (open) => set({ settingsOpen: open }),
    clearError: () => set({ lastError: null }),
    setModelsError: (error) => set({ modelsError: error }),

    connectSocket: () => {
      const mql = getReducedMotionMediaQuery();
      if (mql && !reducedMotionUserOverride) {
        set({ reducedMotion: mql.matches });
      }
      const onMotionChange = (e: MediaQueryListEvent) => {
        if (!reducedMotionUserOverride) {
          set({ reducedMotion: e.matches });
        }
      };
      mql?.addEventListener?.("change", onMotionChange);

      let pendingBatch: AgentEvent[] = [];
      let batchTimerId: ReturnType<typeof setTimeout> | null = null;

      const clearBatchTimer = () => {
        if (batchTimerId !== null) {
          clearTimeout(batchTimerId);
          batchTimerId = null;
        }
      };

      const commitEvents = (immediateEvent?: AgentEvent) => {
        clearBatchTimer();
        const batch = pendingBatch;
        if (batch.length === 0 && !immediateEvent) return;
        pendingBatch = [];

        set((prev) => {
          let nextSnapshot = prev.snapshot;
          for (let i = 0; i < batch.length; i++) {
            nextSnapshot = officeReducer(nextSnapshot, batch[i]!);
          }
          if (immediateEvent) {
            nextSnapshot = officeReducer(nextSnapshot, immediateEvent);
          }
          return {
            snapshot: nextSnapshot,
            recentEvents: prependRecentEvents(
              prev.recentEvents,
              batch,
              immediateEvent,
              MAX_RECENT_EVENTS
            ),
          };
        });
      };

      const disconnectSocket = connectOfficeSocket({
        onOpen: () => {
          set({ connected: true, lastError: null });
          void get().fetchSettings();
        },
        onClose: () => {
          commitEvents();
          set({ connected: false });
        },
        onSnapshot: (state, roles) => {
          clearBatchTimer();
          pendingBatch = [];
          set({
            snapshot: {
              ...createInitialOfficeState(),
              ...state,
              taskTable: state.taskTable ?? {},
              activeProvider: state.activeProvider ?? "antigravity",
              activeRuntime: state.activeRuntime ?? "jcode",
              activeModel: state.activeModel ?? null,
            },
            roles: roles?.length ? roles : get().roles,
          });
        },
        onEvent: (event) => {
          if (event.t === "agent.text" || event.t === "usage") {
            enqueueCoalescedEvent(pendingBatch, event);
            if (batchTimerId === null) {
              batchTimerId = setTimeout(() => {
                batchTimerId = null;
                commitEvents();
              }, EVENT_BATCH_WINDOW_MS);
            }
            return;
          }
          commitEvents(event);
        },
      });

      return () => {
        clearBatchTimer();
        pendingBatch = [];
        mql?.removeEventListener?.("change", onMotionChange);
        disconnectSocket();
      };
    },

    fetchSettings: async () => {
      try {
        const data = await fetchOfficeSettings();
        set({
          configuredKeys: data.configuredKeys,
          jcodeAuth: data.jcodeAuth,
          lastError: null,
        });
      } catch (err) {
        set({ lastError: toErrorMessage(err) });
      }
    },

    saveSecretKey: async (keyName, value) => {
      try {
        await postSecretKey(keyName, value);
        const data = await fetchOfficeSettings();
        set({
          configuredKeys: data.configuredKeys,
          jcodeAuth: data.jcodeAuth,
          lastError: null,
        });
      } catch (err) {
        set({ lastError: toErrorMessage(err) });
      }
    },

    submitTicket: async (input) => {
      try {
        const ticketId = await postTicket(input);
        set(ticketId ? { selectedTicketId: ticketId, lastError: null } : { lastError: null });
      } catch (err) {
        set({ lastError: toErrorMessage(err) });
      }
    },

    resolveApproval: async (reqId, approved) => {
      try {
        await postApproval(reqId, approved);
        set({ lastError: null });
      } catch (err) {
        set({ lastError: toErrorMessage(err) });
      }
    },

    triggerStandup: async () => {
      try {
        await postStandup();
        set({ lastError: null });
      } catch (err) {
        set({ lastError: toErrorMessage(err) });
      }
    },

    replayFixture: async (name) => {
      try {
        await postFixture(name);
        set({ lastError: null });
      } catch (err) {
        set({ lastError: toErrorMessage(err) });
      }
    },

    setActiveProvider: async (provider, runtime, model) => {
      try {
        const event = await postActiveProvider(provider, runtime, model);
        set((prev) => ({
          lastError: null,
          snapshot: event
            ? {
                ...prev.snapshot,
                activeProvider: event.provider,
                activeRuntime: event.runtime,
                activeModel: event.model ?? null,
              }
            : prev.snapshot,
        }));
      } catch (err) {
        set({ lastError: toErrorMessage(err) });
      }
    },
  };
});
