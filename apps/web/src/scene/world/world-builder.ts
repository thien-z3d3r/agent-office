import * as THREE from "three";
import type {
  AgentRoleId,
  ProviderId,
  RoleConfig,
  TaskTableRow,
  Ticket,
} from "@agent-office/protocol";
import { mergeByMaterial, toon, toonUnique } from "../toon.ts";
import {
  buildDirectorLoft,
  buildMeetingRoom,
  buildRoomShell,
  createGlassMaterials,
  paintPlanks,
} from "./architecture.ts";
import { buildOfficeBoards } from "./boards.ts";
import { PALETTE, type DeskAnchorSet, type Disposable } from "./constants.ts";
import {
  buildLoungeAndKitchen,
  buildRoleWorkstations,
  buildSubAgentWorkstations,
} from "./furniture.ts";

export interface BuiltOfficeWorld {
  root: THREE.Group;
  roleDesks: Map<AgentRoleId, DeskAnchorSet>;
  kanbanBoardCanvas: HTMLCanvasElement;
  kanbanBoardTexture: THREE.CanvasTexture;
  meetingBoardCanvas: HTMLCanvasElement;
  meetingBoardTexture: THREE.CanvasTexture;
  floorCanvas: HTMLCanvasElement;
  floorTex: THREE.CanvasTexture;
  wallMat: THREE.MeshToonMaterial;
  trimMat: THREE.MeshToonMaterial;
  slidingDoors: Array<{
    x: number;
    z: number;
    open: number;
    setOpen: (k: number) => void;
  }>;
  updateBoards: (
    tickets: Record<string, Ticket>,
    taskTable: Record<string, TaskTableRow>,
    activeProvider: ProviderId,
    standupText: string | null
  ) => void;
  setNightMode: (night: boolean) => void;
  dispose: () => void;
}

export function buildAgentOfficeWorld(roles: RoleConfig[]): BuiltOfficeWorld {
  const root = new THREE.Group();
  const staticRoot = new THREE.Group();
  const disposables = new Set<Disposable>();

  const wallMat = toonUnique(PALETTE.wall);
  const trimMat = toonUnique(PALETTE.wallTrim);
  const woodMat = toon(PALETTE.wood);
  disposables.add(wallMat);
  disposables.add(trimMat);

  const glassMats = createGlassMaterials(disposables);
  const { floorCanvas, floorTex, floorMat } = buildRoomShell(
    root,
    staticRoot,
    wallMat,
    trimMat,
    glassMats,
    disposables
  );

  const boards = buildOfficeBoards(root, staticRoot, disposables);
  const roleDesks = buildRoleWorkstations(
    roles,
    root,
    staticRoot,
    trimMat,
    disposables
  );
  buildSubAgentWorkstations(root, staticRoot, trimMat, disposables);
  buildLoungeAndKitchen(root, staticRoot, disposables);

  const slidingDoors = buildMeetingRoom(
    root,
    staticRoot,
    woodMat,
    glassMats,
    disposables
  );
  buildDirectorLoft(
    root,
    staticRoot,
    wallMat,
    trimMat,
    woodMat,
    floorMat,
    glassMats,
    disposables
  );

  const mergedStatic = mergeByMaterial(staticRoot);
  mergedStatic.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      disposables.add(m.geometry);
    }
  });
  root.add(mergedStatic);

  const setNightMode = (night: boolean) => {
    wallMat.color.set(night ? "#c4b9a5" : PALETTE.wall);
    trimMat.color.set(night ? "#687387" : PALETTE.wallTrim);
    paintPlanks(floorCanvas, night);
    floorTex.needsUpdate = true;
  };

  const dispose = () => {
    for (const item of disposables) {
      item.dispose();
    }
    disposables.clear();
  };

  return {
    root,
    roleDesks,
    kanbanBoardCanvas: boards.kanbanBoardCanvas,
    kanbanBoardTexture: boards.kanbanBoardTexture,
    meetingBoardCanvas: boards.meetingBoardCanvas,
    meetingBoardTexture: boards.meetingBoardTexture,
    floorCanvas,
    floorTex,
    wallMat,
    trimMat,
    slidingDoors,
    updateBoards: boards.updateBoards,
    setNightMode,
    dispose,
  };
}
