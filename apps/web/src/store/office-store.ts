import { create } from "zustand";
import {
  createInitialOfficeState,
  officeReducer,
  type AgentEvent,
  type AgentRoleId,
  type OfficeStateSnapshot,
  type ProviderId,
  type RoleConfig,
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
  settingsOpen: boolean;
  configuredKeys: Record<string, boolean>;
  jcodeAuth: Record<string, JcodeAuthInfo>;
  recentEvents: AgentEvent[];
  lastError: string | null;
  modelsError: string | null;
  setSelectedRole: (id: AgentRoleId) => void;
  setSelectedTicket: (id: string | null) => void;
  toggleReducedMotion: () => void;
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
  setActiveProvider: (provider: ProviderId) => Promise<void>;
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function getReducedMotionMediaQuery(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return null;
  }
  return window.matchMedia(REDUCED_MOTION_QUERY);
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

      const disconnectSocket = connectOfficeSocket({
        onOpen: () => {
          set({ connected: true, lastError: null });
          void get().fetchSettings();
        },
        onClose: () => {
          set({ connected: false });
        },
        onSnapshot: (state, roles) => {
          set({
            snapshot: {
              ...createInitialOfficeState(),
              ...state,
              taskTable: state.taskTable ?? {},
              activeProvider: state.activeProvider ?? "antigravity",
              activeRuntime: state.activeRuntime ?? "jcode",
            },
            roles: roles?.length ? roles : get().roles,
          });
        },
        onEvent: (event) => {
          set((prev) => ({
            snapshot: officeReducer(prev.snapshot, event),
            recentEvents: [event, ...prev.recentEvents].slice(0, 60),
          }));
        },
      });

      return () => {
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

    setActiveProvider: async (provider) => {
      try {
        await postActiveProvider(provider);
        set({ lastError: null });
      } catch (err) {
        set({ lastError: toErrorMessage(err) });
      }
    },
  };
});
