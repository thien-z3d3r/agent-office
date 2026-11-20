import type * as THREE from "three";
import type { AgentRoleId } from "@agent-office/protocol";

export const FLOOR = { minX: -18, maxX: 18, minZ: -13, maxZ: 13 } as const;
export const WALL_HEIGHT = 6.8;
export const WALL_T = 0.28;
export const DESK_SIZE = { width: 2.2, depth: 1.1, height: 0.78 } as const;

export const LOFT = {
  minX: 9,
  maxX: 18,
  minZ: 8,
  maxZ: 13,
  y: 3.0,
  height: 2.8,
} as const;

export const STAIRS = {
  fromX: 3,
  toX: 9,
  minZ: 11.2,
  maxZ: 13,
  steps: 15,
} as const;

export const MEETING_ROOM = {
  minX: 9.15,
  maxX: 18,
  minZ: 8.15,
  maxZ: 13,
  height: 2.75,
  door: { x0: 10, x1: 11.4 },
} as const;

export const MEETING_TABLE = {
  x: 13.7,
  z: 10.5,
  width: 4.2,
  height: 0.76,
  depth: 1.7,
} as const;

export const PALETTE = {
  floor: "#d8a46f",
  floorAlt: "#cf9963",
  seam: "#b8824e",
  wall: "#f5ebd6",
  wallTrim: "#8d99ae",
  desk: "#f7f3ea",
  deskLeg: "#3d405b",
  wood: "#c98b5a",
  cork: "#d8a86a",
  chairs: ["#ff8a5b", "#5bc0eb", "#9bc53d", "#b388eb", "#ffb400", "#f7aef8"],
  rugs: ["#bde0fe", "#ffd6a5", "#caffbf", "#ffc6ff"],
  plant: "#5fb760",
  plantDark: "#3f8f45",
  pot: "#e76f51",
  ink: "#2b2d42",
  exterior: "#e07a5f",
} as const;

export type PlantSpecies = "monstera" | "snake_plant" | "ficus" | "succulent";

export const FLOOR_PLANTS: readonly PlantSpecies[] = [
  "monstera",
  "snake_plant",
  "ficus",
];

export const PLANT_COLORS: Record<string, string> = {
  Pot: PALETTE.pot,
  Glaze: "#8ecae6",
  Soil: "#6b4226",
  Bark: "#8a5a3b",
  Leaf: PALETTE.plant,
  LeafDark: PALETTE.plantDark,
};

export const DESK_PROP_COLORS: Record<string, string> = {
  CoverRed: "#e63946",
  CoverBlue: "#457b9d",
  CoverOrange: "#f4a261",
  Pages: "#f3ead8",
  Coffee: "#6f4518",
};

export const DESK_BOOKS = [
  "books_upright",
  "books_leaning",
  "books_stack",
] as const;

export const LOUNGE_COLORS: Record<string, string> = {
  Sofa: "#5b8def",
  WoodDark: "#8a5a3b",
  Wood: PALETTE.wood,
  Frame: PALETTE.deskLeg,
};

export const KITCHEN_COLORS: Record<string, string> = {
  Cabinet: "#8ecae6",
  Wood: "#c98b5a",
  Chrome: "#adb5bd",
  Dark: "#343a40",
  White: "#ffffff",
  Fridge: "#f8f9fa",
  Note: "#ffd166",
  Memo: "#bde0fe",
  Red: "#ef476f",
};

export const RUG_COORDS: ReadonlyArray<readonly [number, number, string]> = [
  [-10.5, -4, PALETTE.rugs[0]!],
  [-1.5, -4, PALETTE.rugs[1]!],
  [-10.5, 4, PALETTE.rugs[2]!],
  [-1.5, 4, PALETTE.rugs[3]!],
];

export const PLANT_SPOTS: ReadonlyArray<readonly [number, number, number]> = [
  [-16.8, -11.5, 1.15],
  [8.2, -11.5, 1.1],
  [16.5, -11.2, 1.2],
  [16.5, 5.8, 1.1],
  [-8.5, 11.2, 1.05],
  [1.8, 11.2, 1.15],
];

export const PENDANT_SPOTS: ReadonlyArray<readonly [number, number]> = [
  [-10.5, -4],
  [-1.5, -4],
  [-10.5, 4],
  [-1.5, 4],
  [13, 0],
];

export const SUB_STATION_LABELS = [
  "SUB-1 // SPEC & PLAN",
  "SUB-2 // ADR & SCHEMA",
  "SUB-3 // UI BUILDER",
  "SUB-4 // API RUNNER",
  "SUB-5 // DIFF AUDITOR",
  "SUB-6 // UNIT TESTS",
  "SUB-7 // E2E SUITE",
  "SUB-8 // CI RELEASE",
] as const;

export const MEETING_CHAIR_COLORS = [
  "#2b2d42",
  "#ef476f",
  "#118ab2",
  "#06d6a0",
  "#ffd166",
] as const;

export interface DeskPlacement {
  id: string;
  roleId?: AgentRoleId;
  x: number;
  z: number;
  rotY: number;
  chairColor: string;
}

export interface DeskAnchorSet {
  def: DeskPlacement;
  group: THREE.Group;
  laptopAnchor: THREE.Object3D;
  seatAnchor: THREE.Object3D;
  meetingSeatAnchor: THREE.Object3D;
}

// 8 role desks arranged in 2 back-to-back central pods.
export const ROLE_DESK_PLACEMENTS: Record<AgentRoleId, DeskPlacement> = {
  em: {
    id: "desk-em",
    roleId: "em",
    x: -11.6,
    z: -4.55,
    rotY: Math.PI,
    chairColor: "#6366f1",
  },
  pm: {
    id: "desk-pm",
    roleId: "pm",
    x: -9.4,
    z: -4.55,
    rotY: Math.PI,
    chairColor: "#ec4899",
  },
  tl: {
    id: "desk-tl",
    roleId: "tl",
    x: -11.6,
    z: -3.45,
    rotY: 0,
    chairColor: "#8b5cf6",
  },
  fe: {
    id: "desk-fe",
    roleId: "fe",
    x: -9.4,
    z: -3.45,
    rotY: 0,
    chairColor: "#06b6d4",
  },
  be: {
    id: "desk-be",
    roleId: "be",
    x: -2.6,
    z: -4.55,
    rotY: Math.PI,
    chairColor: "#10b981",
  },
  qa: {
    id: "desk-qa",
    roleId: "qa",
    x: -0.4,
    z: -4.55,
    rotY: Math.PI,
    chairColor: "#f59e0b",
  },
  reviewer: {
    id: "desk-reviewer",
    roleId: "reviewer",
    x: -2.6,
    z: -3.45,
    rotY: 0,
    chairColor: "#ef4444",
  },
  devops: {
    id: "desk-devops",
    roleId: "devops",
    x: -0.4,
    z: -3.45,
    rotY: 0,
    chairColor: "#14b8a6",
  },
};

// [x, z, chairRotY, workerRotY]: North chairs (z=9.2) face +Z toward table (z=10.5); South chairs (z=11.8) face -Z toward table
export const MEETING_OFFSETS: Record<
  AgentRoleId,
  readonly [number, number, number, number]
> = {
  em: [12.1, 9.2, Math.PI, 0],
  pm: [13.2, 9.2, Math.PI, 0],
  tl: [14.3, 9.2, Math.PI, 0],
  fe: [15.3, 9.2, Math.PI, 0],
  be: [12.1, 11.8, 0, Math.PI],
  qa: [13.2, 11.8, 0, Math.PI],
  reviewer: [14.3, 11.8, 0, Math.PI],
  devops: [15.3, 11.8, 0, Math.PI],
};

export interface Disposable {
  dispose: () => void;
}
