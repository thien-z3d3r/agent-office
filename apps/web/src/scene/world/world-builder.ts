import * as THREE from "three";
import type {
  AgentRoleId,
  ProviderId,
  RoleConfig,
  TaskTableRow,
  Ticket,
} from "@agent-office/protocol";
import { mergeStaticWorld, toon, toonUnique } from "../toon.ts";
import {
  buildDirectorLoft,
  buildMeetingRoom,
  buildRoomShell,
  createGlassMaterials,
  mergeStaticGlassRun,
  paintPlanks,
} from "./architecture.ts";
import { buildOfficeBoards } from "./boards.ts";
import { PALETTE, type DeskAnchorSet, type Disposable } from "./constants.ts";
import {
  buildLoungeAndKitchen,
  buildRoleWorkstations,
  buildSubAgentWorkstations,
} from "./furniture.ts";
import { StaticSignAtlas } from "./static-atlas.ts";

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
  const staticGlassRoot = new THREE.Group();
  const atlas = new StaticSignAtlas(2048, 1024);
  const disposables = new Set<Disposable>();

  const wallMat = toonUnique(PALETTE.wall);
  const trimMat = toonUnique(PALETTE.wallTrim);
  const woodMat = toon(PALETTE.wood);
  disposables.add(wallMat);
  disposables.add(trimMat);

  const glassMats = createGlassMaterials(disposables);
  const { floorCanvas, floorTex } = buildRoomShell(
    root,
    staticRoot,
    staticGlassRoot,
    atlas,
    wallMat,
    trimMat,
    glassMats,
    disposables
  );

  const boards = buildOfficeBoards(root, staticRoot, atlas, disposables);
  const roleDesks = buildRoleWorkstations(
    roles,
    root,
    staticRoot,
    atlas,
    trimMat
  );
  buildSubAgentWorkstations(staticRoot, atlas, trimMat);
  buildLoungeAndKitchen(staticRoot, atlas);

  const slidingDoors = buildMeetingRoom(
    root,
    staticRoot,
    staticGlassRoot,
    atlas,
    woodMat,
    glassMats,
    disposables
  );
  buildDirectorLoft(
    staticRoot,
    staticGlassRoot,
    atlas,
    wallMat,
    trimMat,
    woodMat,
    glassMats
  );

  const keepSeparate = new Set<THREE.Material>([wallMat, trimMat]);
  const mergedStatic = mergeStaticWorld(staticRoot, keepSeparate, disposables);
  root.add(mergedStatic);

  root.add(mergeStaticGlassRun(staticGlassRoot, disposables));

  const atlasMesh = atlas.buildMesh(disposables);
  if (atlasMesh) root.add(atlasMesh);

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
