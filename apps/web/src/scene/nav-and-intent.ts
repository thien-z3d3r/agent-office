import type {
  AgentLiveState,
  AgentRoleId,
  AgentStatus,
  RoleConfig,
} from "@agent-office/protocol";

export interface Vec2 {
  x: number;
  z: number;
}

export const ZONE_COORDINATES: Record<string, Vec2> = {
  em_glass_office: { x: -8.5, z: -4.6 },
  planning_pod_pm: { x: -5.5, z: -4.6 },
  planning_pod_tl: { x: -2.5, z: -4.6 },
  dev_pod_fe: { x: -5.5, z: 0.1 },
  dev_pod_be: { x: -2.5, z: 0.1 },
  qa_lab: { x: 5.5, z: -4.6 },
  review_desk: { x: 4.5, z: 0.1 },
  server_rack_corner: { x: 8.5, z: -2.6 },
  whiteboard: { x: -5.5, z: -7.8 },
  kanban_wall: { x: 0.0, z: -7.8 },
  device_wall: { x: 5.5, z: -7.6 },
  server_rack: { x: 9.4, z: -5.8 },
  meeting_room: { x: 0.0, z: 2.8 },
  lounge: { x: -8.5, z: 5.2 },
  director_desk: { x: 0.0, z: 6.0 },
  role_em: { x: -8.5, z: -4.6 },
  role_pm: { x: -5.5, z: -4.6 },
  role_tl: { x: -2.5, z: -4.6 },
  role_fe: { x: -5.5, z: 0.1 },
  role_be: { x: -2.5, z: 0.1 },
  role_qa: { x: 5.5, z: -4.6 },
  role_reviewer: { x: 4.5, z: 0.1 },
  role_devops: { x: 8.5, z: -2.6 },
};

const ROLE_LOUNGE_OFFSETS: Record<AgentRoleId, Vec2> = {
  em: { x: -9.8, z: 4.5 },
  pm: { x: -8.6, z: 4.5 },
  tl: { x: -7.4, z: 4.5 },
  fe: { x: -6.2, z: 4.5 },
  be: { x: -9.8, z: 5.6 },
  qa: { x: -8.6, z: 5.6 },
  reviewer: { x: -7.4, z: 5.6 },
  devops: { x: -6.2, z: 5.6 },
};

const ROLE_MEETING_OFFSETS: Record<AgentRoleId, Vec2> = {
  em: { x: -1.8, z: 0.3 },
  pm: { x: -0.6, z: 0.3 },
  tl: { x: 0.6, z: 0.3 },
  fe: { x: 1.8, z: 0.3 },
  be: { x: -1.8, z: 2.7 },
  qa: { x: -0.6, z: 2.7 },
  reviewer: { x: 0.6, z: 2.7 },
  devops: { x: 1.8, z: 2.7 },
};

export interface NavGrid {
  cols: number;
  rows: number;
  cellSize: number;
  originX: number;
  originZ: number;
  blocked: Set<string>;
}

export function createOfficeNavGrid(): NavGrid {
  const cols = 24;
  const rows = 18;
  const cellSize = 1.0;
  const originX = -12.0;
  const originZ = -9.0;
  const blocked = new Set<string>();

  const blockRect = (minX: number, maxX: number, minZ: number, maxZ: number) => {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const wx = originX + c + 0.5;
        const wz = originZ + r + 0.5;
        if (wx >= minX && wx <= maxX && wz >= minZ && wz <= maxZ) {
          blocked.add(`${c},${r}`);
        }
      }
    }
  };

  // Block desk footprints so A* routes around furniture
  const deskCenters: Array<[number, number]> = [
    [-8.5, -5.5],
    [-5.5, -5.5],
    [-2.5, -5.5],
    [-5.5, -0.8],
    [-2.5, -0.8],
    [5.5, -5.5],
    [4.5, -0.8],
    [8.5, -3.5],
    [0.0, 1.5], // Meeting table
    [0.0, 7.2], // Director desk
  ];
  for (const [dx, dz] of deskCenters) {
    blockRect(dx - 0.8, dx + 0.8, dz - 0.45, dz + 0.45);
  }

  return { cols, rows, cellSize, originX, originZ, blocked };
}

export function worldToCell(
  grid: NavGrid,
  pos: Vec2
): { c: number; r: number } {
  const c = Math.max(
    0,
    Math.min(grid.cols - 1, Math.floor((pos.x - grid.originX) / grid.cellSize))
  );
  const r = Math.max(
    0,
    Math.min(grid.rows - 1, Math.floor((pos.z - grid.originZ) / grid.cellSize))
  );
  return { c, r };
}

export function cellToWorld(grid: NavGrid, c: number, r: number): Vec2 {
  return {
    x: grid.originX + (c + 0.5) * grid.cellSize,
    z: grid.originZ + (r + 0.5) * grid.cellSize,
  };
}

export function findGridPath(
  grid: NavGrid,
  startWorld: Vec2,
  goalWorld: Vec2
): Vec2[] | null {
  const start = worldToCell(grid, startWorld);
  const goal = worldToCell(grid, goalWorld);
  const startKey = `${start.c},${start.r}`;
  const goalKey = `${goal.c},${goal.r}`;

  if (grid.blocked.has(goalKey)) {
    return null;
  }
  if (startKey === goalKey) {
    return [goalWorld];
  }

  const open: Array<{ c: number; r: number; g: number; f: number }> = [
    {
      c: start.c,
      r: start.r,
      g: 0,
      f: Math.abs(goal.c - start.c) + Math.abs(goal.r - start.r),
    },
  ];
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>([[startKey, 0]]);
  const closed = new Set<string>();

  const dirs: Array<[number, number]> = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  while (open.length > 0) {
    open.sort((a, b) => a.f - b.f);
    const current = open.shift()!;
    const currentKey = `${current.c},${current.r}`;

    if (currentKey === goalKey) {
      const pathCells: Vec2[] = [];
      let curr: string | undefined = goalKey;
      while (curr && curr !== startKey) {
        const [cc, rr] = curr.split(",").map(Number);
        pathCells.push(cellToWorld(grid, cc!, rr!));
        curr = cameFrom.get(curr);
      }
      pathCells.reverse();
      pathCells[pathCells.length - 1] = goalWorld;
      return pathCells;
    }

    closed.add(currentKey);

    for (const [dc, dr] of dirs) {
      const nc = current.c + dc;
      const nr = current.r + dr;
      if (nc < 0 || nc >= grid.cols || nr < 0 || nr >= grid.rows) continue;
      const nKey = `${nc},${nr}`;
      if (closed.has(nKey)) continue;
      if (grid.blocked.has(nKey) && nKey !== goalKey) continue;

      const tentativeG = current.g + 1;
      if (tentativeG < (gScore.get(nKey) ?? Infinity)) {
        cameFrom.set(nKey, currentKey);
        gScore.set(nKey, tentativeG);
        const h = Math.abs(goal.c - nc) + Math.abs(goal.r - nr);
        if (!open.some((n) => n.c === nc && n.r === nr)) {
          open.push({ c: nc, r: nr, g: tentativeG, f: tentativeG + h });
        }
      }
    }
  }

  return null;
}

export type AnimationClipName =
  | "Idle"
  | "Walk"
  | "Walk_Carry"
  | "Sit_Idle"
  | "Sit_Type"
  | "Read"
  | "Type_Standing"
  | "Raise_Hand"
  | "Cheer"
  | "Defeated"
  | "Drink";

export interface CharacterIntent {
  status: AgentStatus;
  targetPos: Vec2;
  walkClip: "Walk" | "Walk_Carry";
  arrivalClip: AnimationClipName;
  timeScale: number;
  carryFolder: boolean;
  loopOnce: boolean;
}

export function resolveCharacterIntent(
  role: RoleConfig,
  live: AgentLiveState
): CharacterIntent {
  const deskPos = ZONE_COORDINATES[role.zone] ?? { x: 0, z: 0 };

  switch (live.status) {
    case "idle":
      return {
        status: "idle",
        targetPos: ROLE_LOUNGE_OFFSETS[role.id],
        walkClip: "Walk",
        arrivalClip: role.id === "be" || role.id === "em" ? "Drink" : "Idle",
        timeScale: 1.0,
        carryFolder: false,
        loopOnce: false,
      };
    case "thinking":
      return {
        status: "thinking",
        targetPos: deskPos,
        walkClip: "Walk",
        arrivalClip: "Sit_Idle",
        timeScale: 1.0,
        carryFolder: false,
        loopOnce: false,
      };
    case "reading":
      return {
        status: "reading",
        targetPos: deskPos,
        walkClip: "Walk",
        arrivalClip: "Read",
        timeScale: 1.0,
        carryFolder: false,
        loopOnce: false,
      };
    case "writing":
      return {
        status: "writing",
        targetPos:
          role.id === "pm"
            ? ZONE_COORDINATES["whiteboard"]!
            : deskPos,
        walkClip: "Walk",
        arrivalClip: role.id === "pm" ? "Type_Standing" : "Sit_Type",
        timeScale: 1.5,
        carryFolder: false,
        loopOnce: false,
      };
    case "executing":
    case "browsing":
      return {
        status: live.status,
        targetPos:
          role.id === "devops"
            ? ZONE_COORDINATES["server_rack"]!
            : role.id === "qa"
              ? ZONE_COORDINATES["device_wall"]!
              : deskPos,
        walkClip: "Walk",
        arrivalClip: "Type_Standing",
        timeScale: 1.2,
        carryFolder: false,
        loopOnce: false,
      };
    case "waiting_approval":
      return {
        status: "waiting_approval",
        targetPos: ZONE_COORDINATES["director_desk"]!,
        walkClip: "Walk_Carry",
        arrivalClip: "Raise_Hand",
        timeScale: 1.0,
        carryFolder: true,
        loopOnce: false,
      };
    case "handoff": {
      const targetZonePos =
        (live.targetZone ? ZONE_COORDINATES[live.targetZone] : undefined) ??
        deskPos;
      return {
        status: "handoff",
        targetPos: targetZonePos,
        walkClip: "Walk_Carry",
        arrivalClip: "Idle",
        timeScale: 1.15,
        carryFolder: true,
        loopOnce: false,
      };
    }
    case "standup":
      return {
        status: "standup",
        targetPos: ROLE_MEETING_OFFSETS[role.id],
        walkClip: "Walk",
        arrivalClip: "Idle",
        timeScale: 1.0,
        carryFolder: false,
        loopOnce: false,
      };
    case "error":
      return {
        status: "error",
        targetPos: deskPos,
        walkClip: "Walk",
        arrivalClip: "Defeated",
        timeScale: 1.0,
        carryFolder: false,
        loopOnce: false,
      };
    case "done":
      return {
        status: "done",
        targetPos: deskPos,
        walkClip: "Walk",
        arrivalClip: "Cheer",
        timeScale: 1.0,
        carryFolder: false,
        loopOnce: true,
      };
  }
}

export class IntentQueue {
  private readonly minDwellMs: number;
  private readonly maxBacklog: number;
  private current: CharacterIntent | null = null;
  private currentStartedAt: number = 0;
  private collapsedInCurrentWindow: boolean = false;
  private queue: CharacterIntent[] = [];

  constructor(minDwellMs: number = 600, maxBacklog: number = 3) {
    this.minDwellMs = minDwellMs;
    this.maxBacklog = maxBacklog;
  }

  enqueue(intent: CharacterIntent, now: number = Date.now()): CharacterIntent {
    if (!this.current) {
      this.current = intent;
      this.currentStartedAt = now;
      return this.current;
    }

    // Ignore duplicate status + target coordinate
    const tail = this.queue.length > 0 ? this.queue[this.queue.length - 1]! : this.current;
    if (
      tail.status === intent.status &&
      tail.targetPos.x === intent.targetPos.x &&
      tail.targetPos.z === intent.targetPos.z
    ) {
      return this.tick(now);
    }

    this.queue.push(intent);

    // Collapse excess intents within one dwell window to the latest target.
    if (this.collapsedInCurrentWindow || this.queue.length > this.maxBacklog) {
      this.collapsedInCurrentWindow = true;
      this.queue = [intent];
    }

    return this.tick(now);
  }

  tick(now: number = Date.now()): CharacterIntent {
    if (!this.current) {
      throw new Error("IntentQueue is empty");
    }
    if (
      this.queue.length > 0 &&
      now - this.currentStartedAt >= this.minDwellMs
    ) {
      this.current = this.queue.shift()!;
      this.currentStartedAt = now;
      this.collapsedInCurrentWindow = false;
    }
    return this.current;
  }

  getQueueLength(): number {
    return this.queue.length;
  }
}
