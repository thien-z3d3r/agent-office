import * as THREE from "three";
import {
  gradientMap,
  mergeByMaterial,
  mesh,
  noOutline,
  roundedBox,
  textPlane,
  toon,
} from "../toon.ts";
import {
  FLOOR,
  LOFT,
  MEETING_CHAIR_COLORS,
  MEETING_OFFSETS,
  MEETING_ROOM,
  MEETING_TABLE,
  PALETTE,
  RUG_COORDS,
  STAIRS,
  WALL_HEIGHT,
  WALL_T,
  type Disposable,
} from "./constants.ts";
import { chair } from "./furniture.ts";

export interface GlassMaterials {
  glassMat: THREE.MeshBasicMaterial;
  shineMat: THREE.MeshBasicMaterial;
}

export function createGlassMaterials(disposables: Set<Disposable>): GlassMaterials {
  const glassMat = new THREE.MeshBasicMaterial({
    color: "#d6f1ff",
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const shineMat = new THREE.MeshBasicMaterial({
    color: "#ffffff",
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  disposables.add(glassMat);
  disposables.add(shineMat);
  return { glassMat, shineMat };
}

function glassPane(
  w: number,
  h: number,
  mats: GlassMaterials
): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.PlaneGeometry(w, h), mats.glassMat, 0, 0, 0, false));
  const strip1 = mesh(
    new THREE.PlaneGeometry(Math.min(0.16, w * 0.12), h * 0.55),
    mats.shineMat,
    -w * 0.18,
    h * 0.05,
    0.01,
    false
  );
  strip1.rotation.z = -0.45;
  const strip2 = mesh(
    new THREE.PlaneGeometry(Math.min(0.07, w * 0.06), h * 0.55),
    mats.shineMat,
    -w * 0.18 + 0.26,
    h * 0.05,
    0.01,
    false
  );
  strip2.rotation.z = -0.45;
  g.add(strip1, strip2);
  return noOutline(g);
}

function mergeStaticGlassRun(
  runGroup: THREE.Group,
  disposables: Set<Disposable>
): THREE.Group {
  const merged = mergeByMaterial(runGroup);
  merged.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = false;
    m.receiveShadow = false;
    disposables.add(m.geometry);
  });
  return noOutline(merged);
}

export function paintPlanks(c: HTMLCanvasElement, night = false): void {
  const g = c.getContext("2d")!;
  const base = night ? "#8d633e" : PALETTE.floor;
  const alt = night ? "#825935" : PALETTE.floorAlt;
  const seam = night ? "#664324" : PALETTE.seam;
  g.fillStyle = base;
  g.fillRect(0, 0, 512, 512);
  for (let row = 0; row < 8; row++) {
    const offset = (row % 2) * 128;
    for (let col = -1; col < 3; col++) {
      const x = col * 256 + offset;
      g.fillStyle = (row + col) % 3 === 0 ? alt : base;
      g.fillRect(x + 2, row * 64 + 2, 252, 60);
    }
    g.fillStyle = seam;
    g.fillRect(0, row * 64, 512, 3);
  }
}

function floorTexture(width = 36, depth = 26): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  paintPlanks(c, false);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(width / 6, depth / 6);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export interface RoomShellResult {
  floorCanvas: HTMLCanvasElement;
  floorTex: THREE.CanvasTexture;
  floorMat: THREE.MeshToonMaterial;
}

export function buildRoomShell(
  root: THREE.Group,
  staticRoot: THREE.Group,
  wallMat: THREE.MeshToonMaterial,
  trimMat: THREE.MeshToonMaterial,
  glassMats: GlassMaterials,
  disposables: Set<Disposable>
): RoomShellResult {
  const floorTex = floorTexture(36, 26);
  const floorCanvas = floorTex.image as HTMLCanvasElement;
  const floorMat = new THREE.MeshToonMaterial({
    map: floorTex,
    gradientMap: gradientMap(),
  });
  const floorGeo = new THREE.PlaneGeometry(36, 26);
  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.receiveShadow = true;
  root.add(noOutline(floorMesh));
  disposables.add(floorTex);
  disposables.add(floorMat);
  disposables.add(floorGeo);

  const podRugGeo = roundedBox(6.2, 0.02, 4.6, 0.6);
  for (const [rx, rz, rc] of RUG_COORDS) {
    staticRoot.add(noOutline(mesh(podRugGeo, toon(rc), rx, 0.011, rz, false)));
  }
  staticRoot.add(
    noOutline(
      mesh(roundedBox(7, 0.02, 7, 1.2), toon("#ffc6ff"), 13.4, 0.011, 0, false)
    )
  );

  // South wall is intentionally omitted so the isometric overview camera has an unobstructed cutaway sightline
  const northWall = mesh(
    new THREE.BoxGeometry(36, WALL_HEIGHT, WALL_T),
    wallMat,
    0,
    WALL_HEIGHT / 2,
    FLOOR.minZ - WALL_T / 2
  );
  const westWall = mesh(
    new THREE.BoxGeometry(WALL_T, WALL_HEIGHT, 26),
    wallMat,
    FLOOR.minX - WALL_T / 2,
    WALL_HEIGHT / 2,
    0
  );
  const eastWall = mesh(
    new THREE.BoxGeometry(WALL_T, WALL_HEIGHT, 26),
    wallMat,
    FLOOR.maxX + WALL_T / 2,
    WALL_HEIGHT / 2,
    0
  );
  const northTrim = mesh(
    new THREE.BoxGeometry(36, 0.18, WALL_T + 0.04),
    trimMat,
    0,
    0.09,
    FLOOR.minZ - WALL_T / 2
  );
  staticRoot.add(northWall, westWall, eastWall, northTrim);

  const whiteFrameMat = toon("#ffffff");
  const westWinFrameGeo = new THREE.BoxGeometry(0.34, 2.4, 3.2);
  const westGlassRun = new THREE.Group();
  for (const wz of [-7.5, 0, 7.5]) {
    const frame = mesh(
      westWinFrameGeo,
      whiteFrameMat,
      FLOOR.minX - WALL_T / 2,
      2.5,
      wz,
      false
    );
    staticRoot.add(frame);

    const pane = glassPane(3.0, 2.2, glassMats);
    pane.rotation.y = Math.PI / 2;
    pane.position.set(FLOOR.minX - WALL_T / 2 + 0.18, 2.5, wz);
    westGlassRun.add(pane);
  }
  root.add(mergeStaticGlassRun(westGlassRun, disposables));

  staticRoot.add(
    mesh(
      new THREE.BoxGeometry(0.14, 2.3, 1.3),
      toon("#2a9d8f"),
      FLOOR.minX + 0.05,
      1.15,
      -10.8
    )
  );
  const exitSign = textPlane("EXIT", {
    bg: "#1e7838",
    color: "#ffffff",
    size: 52,
    border: "#ffffff",
  });
  exitSign.scale.multiplyScalar(0.65);
  exitSign.position.set(FLOOR.minX + 0.14, 2.65, -10.8);
  exitSign.rotation.y = Math.PI / 2;
  root.add(exitSign);

  return { floorCanvas, floorTex, floorMat };
}

export interface SlidingDoorHandle {
  x: number;
  z: number;
  open: number;
  setOpen: (k: number) => void;
}

export function buildMeetingRoom(
  root: THREE.Group,
  staticRoot: THREE.Group,
  woodMat: THREE.MeshToonMaterial,
  glassMats: GlassMaterials,
  disposables: Set<Disposable>
): SlidingDoorHandle[] {
  const R = MEETING_ROOM;
  const frameMat = toon("#ffffff");
  const slidingDoors: SlidingDoorHandle[] = [];

  const northGlassRun = new THREE.Group();
  const westGlassRun = new THREE.Group();

  const addBar = (
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number
  ) => staticRoot.add(mesh(new THREE.BoxGeometry(w, h, d), frameMat, x, y, z, false));

  const addGlassRun = (
    axis: "x" | "z",
    a: number,
    b: number,
    at: number,
    targetGroup: THREE.Group,
    paneW = 2.2
  ) => {
    const len = b - a;
    const n = Math.max(1, Math.round(len / paneW));
    for (let i = 0; i < n; i++) {
      const g = glassPane(len / n, R.height, glassMats);
      const u = a + (i + 0.5) * (len / n);
      if (axis === "x") g.position.set(u, R.height / 2, at);
      else {
        g.position.set(at, R.height / 2, u);
        g.rotation.y = Math.PI / 2;
      }
      targetGroup.add(g);
    }
    for (let i = 0; i <= n; i++) {
      const u = a + i * (len / n);
      if (axis === "x") addBar(0.08, R.height, 0.14, u, R.height / 2, at);
      else addBar(0.14, R.height, 0.08, at, R.height / 2, u);
    }
  };

  addGlassRun("x", R.minX, R.door.x0, R.minZ, northGlassRun);
  addGlassRun("x", R.door.x1, R.maxX, R.minZ, northGlassRun);
  addGlassRun("z", R.minZ, R.maxZ, R.minX, westGlassRun);
  root.add(mergeStaticGlassRun(northGlassRun, disposables));
  root.add(mergeStaticGlassRun(westGlassRun, disposables));

  const doorCx = (R.door.x0 + R.door.x1) / 2;
  const doorHalf = (R.door.x1 - R.door.x0) / 2;
  const doorLeaves: Array<[THREE.Group, number]> = [];
  for (const side of [-1, 1]) {
    const rawLeaf = glassPane(doorHalf - 0.08, 2.2, glassMats);
    rawLeaf.position.y = 1.1;
    const mergedLeaf = mergeStaticGlassRun(rawLeaf, disposables);
    const leaf = new THREE.Group();
    leaf.add(mergedLeaf);
    const x0 = doorCx + (side * doorHalf) / 2;
    leaf.position.set(x0, 0, R.minZ - 0.08);
    root.add(leaf);
    doorLeaves.push([leaf, x0]);
  }
  slidingDoors.push({
    x: doorCx,
    z: R.minZ,
    open: 0,
    setOpen: (k) => {
      const e = k * k * (3 - 2 * k);
      for (const [leaf, x0] of doorLeaves) {
        leaf.position.x = x0 + Math.sign(x0 - doorCx) * e * (doorHalf - 0.05);
      }
    },
  });

  const meetingLabel = textPlane("Meeting Room", {
    bg: "#2b2d42",
    color: "#fffaf3",
    size: 52,
    border: "#fffaf3",
  });
  meetingLabel.scale.multiplyScalar(0.62);
  meetingLabel.position.set(doorCx, 2.52, R.minZ - 0.13);
  meetingLabel.rotation.y = Math.PI;
  root.add(meetingLabel);

  const mTable = new THREE.Group();
  mTable.add(
    mesh(
      roundedBox(MEETING_TABLE.width, 0.08, MEETING_TABLE.depth, 0.1),
      woodMat,
      0,
      MEETING_TABLE.height - 0.04,
      0
    )
  );
  const tableLegGeo = new THREE.CylinderGeometry(
    0.1,
    0.12,
    MEETING_TABLE.height - 0.08,
    10
  );
  const deskLegMat = toon(PALETTE.deskLeg);
  for (const sx of [-1, 1]) {
    mTable.add(
      mesh(
        tableLegGeo,
        deskLegMat,
        sx * (MEETING_TABLE.width / 2 - 0.7),
        (MEETING_TABLE.height - 0.08) / 2,
        0
      )
    );
  }
  mTable.position.set(MEETING_TABLE.x, 0, MEETING_TABLE.z);
  staticRoot.add(mTable);

  Object.values(MEETING_OFFSETS).forEach(([mx, mz, chairRotY], idx) => {
    const ch = chair(MEETING_CHAIR_COLORS[idx % MEETING_CHAIR_COLORS.length]!);
    ch.position.set(mx, 0, mz);
    ch.rotation.y = chairRotY;
    staticRoot.add(ch);
  });

  return slidingDoors;
}

export function buildDirectorLoft(
  root: THREE.Group,
  staticRoot: THREE.Group,
  wallMat: THREE.MeshToonMaterial,
  trimMat: THREE.MeshToonMaterial,
  woodMat: THREE.MeshToonMaterial,
  floorMat: THREE.MeshToonMaterial,
  glassMats: GlassMaterials,
  disposables: Set<Disposable>
): void {
  const lw = LOFT.maxX - LOFT.minX;
  const ld = LOFT.maxZ - LOFT.minZ;
  const lcx = (LOFT.minX + LOFT.maxX) / 2;
  const lcz = (LOFT.minZ + LOFT.maxZ) / 2;

  staticRoot.add(
    mesh(
      new THREE.BoxGeometry(lw, 0.25, ld),
      trimMat,
      lcx,
      LOFT.y - 0.125,
      lcz
    )
  );
  const loftFloorGeo = new THREE.PlaneGeometry(lw, ld);
  const loftFloor = new THREE.Mesh(loftFloorGeo, floorMat);
  loftFloor.rotation.x = -Math.PI / 2;
  loftFloor.position.set(lcx, LOFT.y + 0.01, lcz);
  loftFloor.receiveShadow = true;
  root.add(noOutline(loftFloor));
  disposables.add(loftFloorGeo);

  const loftGlassRun = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const g = glassPane(lw / 4, LOFT.height, glassMats);
    g.position.set(
      LOFT.minX + (i + 0.5) * (lw / 4),
      LOFT.y + LOFT.height / 2,
      LOFT.minZ + 0.06
    );
    loftGlassRun.add(g);
  }
  root.add(mergeStaticGlassRun(loftGlassRun, disposables));

  const bossSign = textPlane("Director Loft", {
    bg: "#2b2d42",
    color: "#fffaf3",
    size: 60,
    border: "#fffaf3",
  });
  bossSign.scale.multiplyScalar(1.25);
  bossSign.position.set(lcx, LOFT.y + LOFT.height + 0.2, LOFT.minZ - 0.08);
  bossSign.rotation.y = Math.PI;
  root.add(bossSign);

  const stepRun = (STAIRS.toX - STAIRS.fromX) / STAIRS.steps;
  const stepRise = LOFT.y / STAIRS.steps;
  const stepW = STAIRS.maxZ - STAIRS.minZ;
  const treadGeo = new THREE.BoxGeometry(stepRun + 0.04, 0.06, stepW);
  for (let i = 1; i <= STAIRS.steps; i++) {
    staticRoot.add(
      mesh(
        new THREE.BoxGeometry(stepRun, i * stepRise, stepW),
        wallMat,
        STAIRS.fromX + (i - 0.5) * stepRun,
        (i * stepRise) / 2,
        STAIRS.minZ + stepW / 2
      )
    );
    staticRoot.add(
      mesh(
        treadGeo,
        woodMat,
        STAIRS.fromX + (i - 0.5) * stepRun,
        i * stepRise - 0.03,
        STAIRS.minZ + stepW / 2,
        false
      )
    );
  }

  const bossDesk = new THREE.Group();
  bossDesk.add(mesh(roundedBox(2.4, 0.1, 1.1, 0.1), woodMat, 0, 0.78, 0));
  bossDesk.add(
    mesh(new THREE.BoxGeometry(2.2, 0.66, 0.08), toon("#8a5a3b"), 0, 0.4, -0.45)
  );
  const bossChair = chair("#2b2d42");
  bossChair.scale.setScalar(1.15);
  bossChair.position.set(0, 0, 0.95);
  bossDesk.add(bossChair);
  bossDesk.position.set(lcx + 0.4, LOFT.y, lcz - 0.2);
  staticRoot.add(bossDesk);

  const bossPlate = textPlane("DIRECTOR", { bg: "#ffd166", size: 46 });
  bossPlate.scale.multiplyScalar(0.55);
  bossPlate.position.set(lcx + 0.4, LOFT.y + 0.5, lcz - 0.2 - 0.5);
  bossPlate.rotation.y = Math.PI;
  root.add(bossPlate);

  const scope = new THREE.Group();
  const inkMat = toon(PALETTE.deskLeg);
  const scopeLegGeo = new THREE.CylinderGeometry(0.025, 0.025, 1.1, 6);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = mesh(
      scopeLegGeo,
      inkMat,
      Math.sin(a) * 0.2,
      0.52,
      Math.cos(a) * 0.2
    );
    leg.rotation.set(Math.cos(a) * -0.35, 0, Math.sin(a) * 0.35);
    scope.add(leg);
  }
  const tubeGeo = new THREE.CylinderGeometry(0.1, 0.06, 0.9, 14);
  tubeGeo.rotateX(Math.PI / 2);
  const tube = mesh(tubeGeo, toon("#ffd166"), 0, 1.08, 0.1);
  tube.lookAt(-6, 0.8, 0);
  scope.add(tube);
  scope.position.set(LOFT.minX + 0.9, LOFT.y, LOFT.minZ + 0.9);
  staticRoot.add(scope);
}
