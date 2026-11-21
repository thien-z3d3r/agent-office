import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type {
  AgentLiveState,
  AgentRoleId,
  AgentStatus,
  RoleConfig,
} from "@agent-office/protocol";
import {
  CARD_RES,
  disposeSprite,
  gradientMap,
  mergeColoredParts,
  paintCardCanvas,
  paintTextCanvas,
  roundedBox,
  TEXT_SCALE,
  textSprite,
  toon,
  toonUnique,
} from "./toon.ts";
import { getPreloadedModel } from "./models.ts";
import type { DeskAnchorSet } from "./world/constants.ts";

type WorkerAct =
  | "rest"
  | "up"
  | "waiting"
  | "type"
  | "edit"
  | "read"
  | "test"
  | "web"
  | "failing";

interface Stance {
  armLx: number;
  armRx: number;
  armLz: number;
  armRz: number;
  reach: number;
  drop: number;
  lean: number;
  turn: number;
  roll: number;
  lift: number;
  tap: number;
  kick: number;
  lid: number;
  look: number;
}

const STANCE_KEYS = [
  "armLx",
  "armRx",
  "armLz",
  "armRz",
  "reach",
  "drop",
  "lean",
  "turn",
  "roll",
  "lift",
  "tap",
  "kick",
  "lid",
  "look",
] as const;

function stanceOf(act: WorkerAct, t: number, s: Stance): Stance {
  s.armLx = s.armRx = -0.3;
  s.armLz =
    s.armRz =
    s.reach =
    s.drop =
    s.lean =
    s.turn =
    s.roll =
    s.tap =
    s.kick =
    s.look =
      0;
  s.lift = Math.sin(t * 2) * 0.015;
  s.lid = 1;
  switch (act) {
    case "up":
      s.armLx = s.armRx = -2.6;
      s.lift = Math.abs(Math.sin(t * 8)) * 0.14;
      break;
    case "type":
      s.armLx = -1.2 + Math.sin(t * 22) * 0.25;
      s.armRx = -1.2 + Math.sin(t * 22 + 1.7) * 0.25;
      s.lift = Math.abs(Math.sin(t * 11)) * 0.02;
      break;
    case "edit":
      s.armLx = -1.25 + Math.sin(t * 34) * 0.34;
      s.armRx = -1.25 + Math.sin(t * 34 + 1.9) * 0.34;
      s.lean = 0.16;
      s.lift = Math.abs(Math.sin(t * 17)) * 0.035;
      s.look = -0.02;
      break;
    case "read":
      s.armLx = s.armRx = -2.05;
      s.armLz = 0.3;
      s.armRz = -0.3;
      s.lean = -0.06;
      s.look = -0.01 - ((t * 0.9) % 1) * 0.03;
      break;
    case "test":
      s.armLx = s.armRx = -3.3;
      s.armLz = 0.55;
      s.armRz = -0.55;
      s.lean = -0.32;
      s.roll = Math.sin(t * 1.3) * 0.04;
      s.kick = 0.08;
      s.look = 0.025;
      s.lift = 0;
      break;
    case "web":
      s.armLx = -1.2 + Math.sin(t * 9) * 0.15;
      s.armRx = -0.8;
      s.lean = -0.1;
      s.look = 0.03;
      break;
    case "failing":
      s.armLx = s.armRx = -2;
      s.armLz = 0.45;
      s.armRz = -0.45;
      s.reach = 1;
      s.lean = 0.38;
      s.turn = Math.sin(t * 2.4) * 0.16;
      s.lid = 0.55;
      s.look = -0.035;
      s.lift = 0;
      break;
    case "waiting": {
      const tap = Math.max(0, Math.sin(t * 16));
      s.armLx = -1.05;
      s.armRx = -1.2;
      s.armLz = 1;
      s.armRz = -1;
      s.reach = 1;
      s.drop = 0.11;
      s.roll = 0.07;
      s.tap = tap;
      s.lift = tap * 0.018;
      s.lid = 0.65;
      break;
    }
  }
  return s;
}

function blendStance(
  acts: Map<WorkerAct, number>,
  act: WorkerAct,
  dt: number,
  t: number,
  scratch: Stance,
  out: Stance
): Stance {
  const k = Math.min(1, dt * 8);
  if (!acts.has(act)) acts.set(act, 0);
  for (const key of STANCE_KEYS) out[key] = 0;
  let total = 0;
  for (const [a, w0] of acts) {
    const w = w0 + ((a === act ? 1 : 0) - w0) * k;
    if (a !== act && w < 0.01) {
      acts.delete(a);
      continue;
    }
    acts.set(a, w);
    const s = stanceOf(a, t, scratch);
    for (const key of STANCE_KEYS) out[key] += s[key] * w;
    total += w;
  }
  if (total > 0) {
    for (const key of STANCE_KEYS) out[key] /= total;
  }
  return out;
}

function buildPapersGeometries(): {
  stackGeo: THREE.BufferGeometry;
  pageGeo: THREE.BufferGeometry;
} {
  const W = 0.34;
  const H = 0.44;
  const dummy = new THREE.Object3D();
  const stackParts: Array<{
    geo: THREE.BufferGeometry;
    color: string;
    matrix: THREE.Matrix4;
  }> = [];
  const tempGeos: THREE.BufferGeometry[] = [];

  (["#f1ece2", "#f7f3ea", "#fffaf3"] as const).forEach((c, i) => {
    const geo = new THREE.BoxGeometry(W, H, 0.008);
    tempGeos.push(geo);
    dummy.position.set((i - 1) * 0.012, -H / 2 - i * 0.006, 0.02 - i * 0.012);
    dummy.rotation.set(0, 0, (i - 1) * 0.04);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    stackParts.push({ geo, color: c, matrix: dummy.matrix.clone() });
  });

  const addLineParts = (
    target: typeof stackParts,
    z: number
  ) => {
    for (let i = 0; i < 6; i++) {
      const short = i % 3 === 2;
      const geo = new THREE.BoxGeometry(W * (short ? 0.45 : 0.72), 0.018, 0.004);
      tempGeos.push(geo);
      dummy.position.set(short ? -W * 0.135 : 0, -0.07 - i * 0.055, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      target.push({ geo, color: "#8d99ae", matrix: dummy.matrix.clone() });
    }
  };
  addLineParts(stackParts, -0.01);

  const spineGeo = new THREE.BoxGeometry(W * 0.5, 0.05, 0.05);
  tempGeos.push(spineGeo);
  dummy.position.set(0, 0, 0);
  dummy.rotation.set(0, 0, 0);
  dummy.scale.set(1, 1, 1);
  dummy.updateMatrix();
  stackParts.push({ geo: spineGeo, color: "#adb5bd", matrix: dummy.matrix.clone() });

  const pageParts: typeof stackParts = [];
  const pageSheetGeo = new THREE.BoxGeometry(W, H, 0.008);
  tempGeos.push(pageSheetGeo);
  dummy.position.set(0, -H / 2, -0.016);
  dummy.rotation.set(0, 0, 0);
  dummy.scale.set(1, 1, 1);
  dummy.updateMatrix();
  pageParts.push({ geo: pageSheetGeo, color: "#fffaf3", matrix: dummy.matrix.clone() });
  addLineParts(pageParts, -0.022);

  const stackGeo = mergeColoredParts(stackParts);
  const pageGeo = mergeColoredParts(pageParts);
  for (const g of tempGeos) g.dispose();
  return { stackGeo, pageGeo };
}

function buildGlobeGeometries(): {
  ballGeo: THREE.BufferGeometry;
  ringGeo: THREE.BufferGeometry;
} {
  const r = 0.26;
  const dummy = new THREE.Object3D();
  const tempGeos: THREE.BufferGeometry[] = [];
  const parts: Array<{
    geo: THREE.BufferGeometry;
    color: string;
    matrix?: THREE.Matrix4;
  }> = [];

  const oceanGeo = new THREE.SphereGeometry(r, 20, 14);
  tempGeos.push(oceanGeo);
  parts.push({ geo: oceanGeo, color: "#4cc9f0" });

  for (const [lat, lon, size] of [
    [0.5, 0.2, 0.5],
    [0.1, 0.9, 0.4],
    [-0.4, 0.5, 0.45],
    [0.3, 2.4, 0.6],
    [-0.2, 3.3, 0.4],
    [0.6, 4.4, 0.45],
    [-0.5, 5.2, 0.35],
  ] as const) {
    const blobGeo = new THREE.SphereGeometry(size * r, 10, 8);
    tempGeos.push(blobGeo);
    dummy.position.set(
      Math.cos(lat) * Math.sin(lon) * r * 0.86,
      Math.sin(lat) * r * 0.86,
      Math.cos(lat) * Math.cos(lon) * r * 0.86
    );
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1.2, 0.8, 1.2);
    dummy.updateMatrix();
    parts.push({ geo: blobGeo, color: "#6fcf6a", matrix: dummy.matrix.clone() });
  }

  const ballGeo = mergeColoredParts(parts);
  for (const g of tempGeos) g.dispose();
  const ringGeo = new THREE.TorusGeometry(r * 1.35, 0.016, 6, 32);
  return { ballGeo, ringGeo };
}

interface LaptopSlot {
  roleId: AgentRoleId;
  anchorObj: THREE.Object3D;
  openT: number;
  lastStructKey: string;
  lastStreamKey: string;
  lastPaintMs: number;
}

export class ToonLaptopPool {
  readonly root = new THREE.Group();
  private readonly slots = new Map<AgentRoleId, LaptopSlot>();
  private readonly orderedSlots: LaptopSlot[] = [];
  private readonly cols = 4;
  private readonly rows: number;
  private readonly cellW = 640;
  private readonly cellH = 420;
  private readonly atlasCanvas = document.createElement("canvas");
  private readonly atlasCtx: CanvasRenderingContext2D;
  private readonly atlasTex: THREE.CanvasTexture;
  private atlasDirty = false;

  private readonly baseGeo: THREE.BufferGeometry;
  private readonly lidShellGeo: THREE.BufferGeometry;
  private readonly stickerGeo: THREE.BufferGeometry;
  private readonly screenGeo: THREE.BufferGeometry;
  private readonly baseMat: THREE.MeshToonMaterial;
  private readonly lidMat: THREE.MeshToonMaterial;
  private readonly stickerMat: THREE.MeshToonMaterial;
  private readonly screenMat: THREE.MeshBasicMaterial;
  private readonly baseMesh: THREE.InstancedMesh;
  private readonly lidShellMesh: THREE.InstancedMesh;
  private readonly stickerMesh: THREE.InstancedMesh;
  private readonly screenMesh: THREE.InstancedMesh;

  private readonly dummy = new THREE.Object3D();
  private readonly lidMat4 = new THREE.Matrix4();

  constructor(
    roles: RoleConfig[],
    desks: Map<AgentRoleId, DeskAnchorSet>
  ) {
    const n = Math.max(1, roles.length);
    this.rows = Math.max(2, Math.ceil(n / this.cols));
    this.atlasCanvas.width = this.cols * this.cellW;
    this.atlasCanvas.height = this.rows * this.cellH;
    this.atlasCtx = this.atlasCanvas.getContext("2d")!;
    this.atlasTex = new THREE.CanvasTexture(this.atlasCanvas);
    this.atlasTex.colorSpace = THREE.SRGBColorSpace;
    this.atlasTex.anisotropy = 4;

    const baseShellGeo = roundedBox(0.78, 0.035, 0.52, 0.04);
    const kbGeo = new THREE.BoxGeometry(0.66, 0.006, 0.24);
    const tpGeo = new THREE.BoxGeometry(0.2, 0.004, 0.11);
    const m = new THREE.Matrix4();
    this.baseGeo = mergeColoredParts([
      { geo: baseShellGeo, color: "#c9ced6", matrix: m.clone().makeTranslation(0, 0.018, 0.02) },
      { geo: kbGeo, color: "#2b2d42", matrix: m.clone().makeTranslation(0, 0.037, 0) },
      { geo: tpGeo, color: "#aab1bb", matrix: m.clone().makeTranslation(0, 0.037, 0.19) },
    ]);
    kbGeo.dispose();
    tpGeo.dispose();

    const rawLid = roundedBox(0.78, 0.025, 0.5, 0.04);
    this.lidShellGeo = rawLid.index ? rawLid.toNonIndexed() : rawLid.clone();
    this.lidShellGeo.rotateX(Math.PI / 2);
    this.lidShellGeo.translate(0, 0.25, 0);

    this.stickerGeo = new THREE.CircleGeometry(0.07, 20);
    this.stickerGeo.rotateY(Math.PI);
    this.stickerGeo.translate(0, 0.27, -0.014);

    this.screenGeo = new THREE.PlaneGeometry(0.72, 0.46);
    this.screenGeo.translate(0, 0.25, 0.014);

    const rectAttr = new Float32Array(n * 4);
    const padU = 0.5 / this.atlasCanvas.width;
    const padV = 0.5 / this.atlasCanvas.height;
    for (let i = 0; i < n; i++) {
      const col = i % this.cols;
      const row = Math.floor(i / this.cols);
      rectAttr[i * 4] = col / this.cols + padU;
      rectAttr[i * 4 + 1] = (this.rows - 1 - row) / this.rows + padV;
      rectAttr[i * 4 + 2] = 1 / this.cols - 2 * padU;
      rectAttr[i * 4 + 3] = 1 / this.rows - 2 * padV;
    }
    this.screenGeo.setAttribute(
      "aAtlasRect",
      new THREE.InstancedBufferAttribute(rectAttr, 4)
    );

    this.baseMat = new THREE.MeshToonMaterial({
      color: "#ffffff",
      vertexColors: true,
      gradientMap: gradientMap(),
    });
    this.lidMat = toon("#c9ced6");
    this.stickerMat = toonUnique("#ffffff", { outline: false });
    this.screenMat = new THREE.MeshBasicMaterial({
      map: this.atlasTex,
      toneMapped: false,
    });
    this.screenMat.userData.outlineParameters = { visible: false };
    this.screenMat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <uv_pars_vertex>",
          "#include <uv_pars_vertex>\nattribute vec4 aAtlasRect;"
        )
        .replace(
          "#include <uv_vertex>",
          "#include <uv_vertex>\n#ifdef USE_MAP\n\tvMapUv = aAtlasRect.xy + vMapUv * aAtlasRect.zw;\n#endif"
        );
    };
    this.screenMat.customProgramCacheKey = () => "laptop-screen-atlas";

    this.baseMesh = new THREE.InstancedMesh(this.baseGeo, this.baseMat, n);
    this.baseMesh.castShadow = true;
    this.baseMesh.receiveShadow = true;
    this.baseMesh.frustumCulled = false;

    this.lidShellMesh = new THREE.InstancedMesh(this.lidShellGeo, this.lidMat, n);
    this.lidShellMesh.castShadow = true;
    this.lidShellMesh.receiveShadow = true;
    this.lidShellMesh.frustumCulled = false;

    this.stickerMesh = new THREE.InstancedMesh(this.stickerGeo, this.stickerMat, n);
    this.stickerMesh.castShadow = false;
    this.stickerMesh.receiveShadow = false;
    this.stickerMesh.frustumCulled = false;

    this.screenMesh = new THREE.InstancedMesh(this.screenGeo, this.screenMat, n);
    this.screenMesh.castShadow = false;
    this.screenMesh.receiveShadow = false;
    this.screenMesh.frustumCulled = false;

    const tmpColor = new THREE.Color();
    for (let i = 0; i < roles.length; i++) {
      const role = roles[i]!;
      const desk = desks.get(role.id);
      if (!desk) continue;
      desk.laptopAnchor.updateWorldMatrix(true, false);

      this.baseMesh.setMatrixAt(i, desk.laptopAnchor.matrixWorld);
      this.stickerMesh.setColorAt(i, tmpColor.set(role.tint));

      const slot: LaptopSlot = {
        roleId: role.id,
        anchorObj: desk.laptopAnchor,
        openT: 0,
        lastStructKey: "",
        lastStreamKey: "",
        lastPaintMs: 0,
      };
      this.slots.set(role.id, slot);
      this.orderedSlots.push(slot);
      this.applyLidTransform(i, slot);
      this.paintCell(i, slot, "IDLE", "Ready at desk", "", 0);
    }

    this.baseMesh.count = this.orderedSlots.length;
    this.lidShellMesh.count = this.orderedSlots.length;
    this.stickerMesh.count = this.orderedSlots.length;
    this.screenMesh.count = this.orderedSlots.length;
    this.baseMesh.instanceMatrix.needsUpdate = true;
    this.lidShellMesh.instanceMatrix.needsUpdate = true;
    this.stickerMesh.instanceMatrix.needsUpdate = true;
    this.screenMesh.instanceMatrix.needsUpdate = true;
    if (this.stickerMesh.instanceColor) {
      this.stickerMesh.instanceColor.needsUpdate = true;
    }

    this.root.add(
      this.baseMesh,
      this.lidShellMesh,
      this.stickerMesh,
      this.screenMesh
    );
  }

  private applyLidTransform(idx: number, slot: LaptopSlot): void {
    const e = 1 - Math.pow(1 - slot.openT, 3);
    this.dummy.position.set(0, 0.035, -0.24);
    this.dummy.rotation.set(Math.PI / 2 - e * (Math.PI / 2 + 0.22), 0, 0);
    this.dummy.scale.set(1, 1, 1);
    this.dummy.updateMatrix();
    this.lidMat4.multiplyMatrices(slot.anchorObj.matrixWorld, this.dummy.matrix);
    this.lidShellMesh.setMatrixAt(idx, this.lidMat4);
    this.stickerMesh.setMatrixAt(idx, this.lidMat4);
    this.screenMesh.setMatrixAt(idx, this.lidMat4);
  }

  private paintCell(
    idx: number,
    slot: LaptopSlot,
    status: string,
    detail: string,
    streamTail: string,
    nowMs: number
  ): void {
    const col = idx % this.cols;
    const row = Math.floor(idx / this.cols);
    const ox = col * this.cellW;
    const oy = row * this.cellH;
    const ctx = this.atlasCtx;

    ctx.save();
    ctx.translate(ox, oy);
    ctx.beginPath();
    ctx.rect(0, 0, this.cellW, this.cellH);
    ctx.clip();

    ctx.fillStyle = "#1b1d2e";
    ctx.fillRect(0, 0, this.cellW, this.cellH);
    ctx.fillStyle = "#06d6a0";
    ctx.font = "700 24px ui-monospace, Menlo, Consolas, monospace";
    ctx.fillText(`$ agent-office [${status.toUpperCase()}]`, 24, 44);
    ctx.fillStyle = "#ffd166";
    ctx.font = "600 20px ui-monospace, Menlo, Consolas, monospace";
    ctx.fillText(detail.slice(0, 46), 24, 82);

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "400 18px ui-monospace, Menlo, Consolas, monospace";
    const lines = (streamTail || "// Waiting for task dispatch...")
      .split("\n")
      .slice(-10);
    lines.forEach((l, lineIdx) => {
      ctx.fillText(l.slice(0, 52), 24, 126 + lineIdx * 26);
    });
    ctx.restore();

    slot.lastStructKey = `${status}|${detail}`;
    slot.lastStreamKey = streamTail.slice(-160);
    slot.lastPaintMs = nowMs;
    this.atlasDirty = true;
  }

  updateLaptop(
    roleId: AgentRoleId,
    dt: number,
    live: AgentLiveState,
    reducedMotion: boolean,
    nowMs: number
  ): boolean {
    const slot = this.slots.get(roleId);
    if (!slot) return false;
    const idx = this.orderedSlots.indexOf(slot);
    if (idx < 0) return false;

    let lidMoved = false;
    if (slot.openT < 1) {
      slot.openT = reducedMotion ? 1 : Math.min(1, slot.openT + dt * 1.8);
      this.applyLidTransform(idx, slot);
      this.lidShellMesh.instanceMatrix.needsUpdate = true;
      this.stickerMesh.instanceMatrix.needsUpdate = true;
      this.screenMesh.instanceMatrix.needsUpdate = true;
      lidMoved = true;
    }

    const structKey = `${live.status}|${live.detail}`;
    const streamKey = live.streamBuffer.slice(-160);
    const structChanged = structKey !== slot.lastStructKey;
    const streamChanged = streamKey !== slot.lastStreamKey;

    if (
      structChanged ||
      (streamChanged && (nowMs - slot.lastPaintMs >= 140 || live.status === "done"))
    ) {
      this.paintCell(idx, slot, live.status, live.detail, live.streamBuffer, nowMs);
      return lidMoved;
    }

    return lidMoved || streamChanged;
  }

  commit(): void {
    if (this.atlasDirty) {
      this.atlasTex.needsUpdate = true;
      this.atlasDirty = false;
    }
  }

  dispose(): void {
    this.baseMesh.dispose();
    this.lidShellMesh.dispose();
    this.stickerMesh.dispose();
    this.screenMesh.dispose();
    this.baseGeo.dispose();
    this.lidShellGeo.dispose();
    this.stickerGeo.dispose();
    this.screenGeo.dispose();
    this.baseMat.dispose();
    this.stickerMat.dispose();
    this.screenMat.dispose();
    this.atlasTex.dispose();
  }
}

const STATUS_BULB_COLOR: Record<AgentStatus, string> = {
  idle: "#8ecae6",
  thinking: "#ffd166",
  reading: "#5bc0eb",
  writing: "#ffd166",
  executing: "#ffd166",
  browsing: "#5bc0eb",
  waiting_approval: "#ef476f",
  handoff: "#ff8a5b",
  standup: "#06d6a0",
  error: "#ef476f",
  done: "#06d6a0",
};

const CHIP_FOR_STATUS: Record<AgentStatus, [string, string, string]> = {
  idle: ["READY", "#8ecae6", "#2b2d42"],
  thinking: ["THINKING", "#ffd166", "#2b2d42"],
  reading: ["READING", "#5bc0eb", "#2b2d42"],
  writing: ["WRITING", "#ffd166", "#2b2d42"],
  executing: ["TESTING / SHELL", "#ffd166", "#2b2d42"],
  browsing: ["WEB SEARCH", "#5bc0eb", "#2b2d42"],
  waiting_approval: ["NEEDS YOU", "#c9184a", "#ffffff"],
  handoff: ["HANDOFF", "#ff8a5b", "#2b2d42"],
  standup: ["STANDUP", "#06d6a0", "#2b2d42"],
  error: ["ESCALATED", "#c9184a", "#ffffff"],
  done: ["DONE", "#06d6a0", "#2b2d42"],
};

function mapStatusToAct(status: AgentStatus): WorkerAct {
  switch (status) {
    case "idle":
    case "standup":
      return "rest";
    case "thinking":
    case "handoff":
      return "type";
    case "writing":
      return "edit";
    case "reading":
      return "read";
    case "executing":
      return "test";
    case "browsing":
      return "web";
    case "waiting_approval":
      return "waiting";
    case "error":
      return "failing";
    case "done":
      return "up";
  }
}

interface CardSpriteHandle {
  sprite: THREE.Sprite;
  canvas: HTMLCanvasElement;
  tex: THREE.CanvasTexture;
  structuralKey: string;
  detailKey: string;
  lastPaintMs: number;
}

interface WorkerSlot {
  index: number;
  role: RoleConfig;
  pos: THREE.Vector3;
  rotY: number;
  spriteAnchor: THREE.Group;
  nameTag: THREE.Sprite;
  bubbleHandle: CardSpriteHandle | null;
  lastBulbStatus: AgentStatus | null;
  prevStatus: AgentStatus | null;
  doneElapsed: number;
  acts: Map<WorkerAct, number>;
  stance: Stance;
  scratch: Stance;
  t: number;
  blinkAt: number;
  flipT: number;
  globeBallRotY: number;
  globeRingRotZ: number;
  showPapers: boolean;
  showGlobe: boolean;
  bodyMatrix: THREE.Matrix4;
  rootMatrix: THREE.Matrix4;
}

export class ToonWorkerPool {
  readonly root = new THREE.Group();
  private readonly slots = new Map<AgentRoleId, WorkerSlot>();
  private readonly orderedSlots: WorkerSlot[] = [];

  private readonly beanGeo: THREE.BufferGeometry;
  private readonly headsetGeo: THREE.BufferGeometry;
  private readonly bulbGeo: THREE.BufferGeometry;
  private readonly armGeo: THREE.BufferGeometry;
  private readonly footGeo: THREE.BufferGeometry;
  private readonly eyeGeo: THREE.BufferGeometry;
  private readonly pupilGeo: THREE.BufferGeometry;
  private readonly papersStackGeo: THREE.BufferGeometry;
  private readonly papersPageGeo: THREE.BufferGeometry;
  private readonly globeBallGeo: THREE.BufferGeometry;
  private readonly globeRingGeo: THREE.BufferGeometry;

  private readonly skinMat: THREE.MeshToonMaterial;
  private readonly bulbMat: THREE.MeshToonMaterial;
  private readonly vertexColorMat: THREE.MeshToonMaterial;

  private readonly beanMesh: THREE.InstancedMesh;
  private readonly headsetMesh: THREE.InstancedMesh;
  private readonly bulbMesh: THREE.InstancedMesh;
  private readonly armsMesh: THREE.InstancedMesh;
  private readonly feetMesh: THREE.InstancedMesh;
  private readonly eyesMesh: THREE.InstancedMesh;
  private readonly pupilsMesh: THREE.InstancedMesh;
  private readonly papersStackMesh: THREE.InstancedMesh;
  private readonly papersPageMesh: THREE.InstancedMesh;
  private readonly globeBallMesh: THREE.InstancedMesh;
  private readonly globeRingMesh: THREE.InstancedMesh;

  private readonly dummy = new THREE.Object3D();
  private readonly partMat4 = new THREE.Matrix4();
  private readonly subMat4 = new THREE.Matrix4();
  private readonly tmpColor = new THREE.Color();
  private readonly raySprites: THREE.Sprite[] = [];

  constructor(
    roles: RoleConfig[],
    desks: Map<AgentRoleId, DeskAnchorSet>
  ) {
    const n = Math.max(1, roles.length);

    this.beanGeo = new THREE.CapsuleGeometry(0.28, 0.3, 8, 16);
    this.beanGeo.translate(0, 0.55, 0);

    const bandGeo = new THREE.TorusGeometry(0.29, 0.025, 6, 20, Math.PI);
    const earGeo = new THREE.SphereGeometry(0.07, 10, 8);
    const antGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.22, 6);
    const tr = new THREE.Matrix4();
    this.headsetGeo = mergeColoredParts([
      { geo: bandGeo, matrix: tr.clone().makeTranslation(0, 0.72, 0) },
      { geo: earGeo, matrix: tr.clone().makeTranslation(-0.29, 0.72, 0) },
      { geo: earGeo, matrix: tr.clone().makeTranslation(0.29, 0.72, 0) },
      { geo: antGeo, matrix: tr.clone().makeTranslation(0, 1.07, 0) },
    ]);
    bandGeo.dispose();
    earGeo.dispose();
    antGeo.dispose();

    this.bulbGeo = new THREE.SphereGeometry(0.075, 12, 10);
    this.bulbGeo.translate(0, 1.2, 0);

    this.armGeo = new THREE.CapsuleGeometry(0.055, 0.16, 4, 8);
    this.armGeo.translate(0, -0.12, 0);

    this.footGeo = new THREE.CapsuleGeometry(0.06, 0.1, 4, 8);

    this.eyeGeo = new THREE.SphereGeometry(0.09, 12, 10);
    this.eyeGeo.scale(1, 1, 0.6);

    this.pupilGeo = new THREE.SphereGeometry(0.045, 10, 8);

    const papers = buildPapersGeometries();
    this.papersStackGeo = papers.stackGeo;
    this.papersPageGeo = papers.pageGeo;

    const globe = buildGlobeGeometries();
    this.globeBallGeo = globe.ballGeo;
    this.globeRingGeo = globe.ringGeo;

    this.skinMat = toonUnique("#ffffff");
    this.bulbMat = toonUnique("#ffffff", { outline: false });
    this.bulbMat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <emissivemap_fragment>",
        "#include <emissivemap_fragment>\n#ifdef USE_COLOR\n\ttotalEmissiveRadiance += vColor * 0.6;\n#endif"
      );
    };
    this.bulbMat.customProgramCacheKey = () => "worker-bulb-emissive";

    this.vertexColorMat = new THREE.MeshToonMaterial({
      color: "#ffffff",
      vertexColors: true,
      gradientMap: gradientMap(),
    });

    const headsetMat = toon("#2b2d42");
    const eyeMat = toon("#ffffff", { outline: false });
    const pupilMat = toon("#1d1d1d", { outline: false });
    const ringMat = toon("#ffd166", { emissive: "#7a5b00" });

    this.beanMesh = new THREE.InstancedMesh(this.beanGeo, this.skinMat, n);
    this.beanMesh.castShadow = true;
    this.beanMesh.receiveShadow = true;
    this.beanMesh.frustumCulled = false;

    this.headsetMesh = new THREE.InstancedMesh(this.headsetGeo, headsetMat, n);
    this.headsetMesh.castShadow = false;
    this.headsetMesh.receiveShadow = true;
    this.headsetMesh.frustumCulled = false;

    this.bulbMesh = new THREE.InstancedMesh(this.bulbGeo, this.bulbMat, n);
    this.bulbMesh.castShadow = false;
    this.bulbMesh.receiveShadow = false;
    this.bulbMesh.frustumCulled = false;

    this.armsMesh = new THREE.InstancedMesh(this.armGeo, this.skinMat, n * 2);
    this.armsMesh.castShadow = true;
    this.armsMesh.receiveShadow = true;
    this.armsMesh.frustumCulled = false;

    this.feetMesh = new THREE.InstancedMesh(this.footGeo, this.skinMat, n * 2);
    this.feetMesh.castShadow = true;
    this.feetMesh.receiveShadow = true;
    this.feetMesh.frustumCulled = false;

    this.eyesMesh = new THREE.InstancedMesh(this.eyeGeo, eyeMat, n * 2);
    this.eyesMesh.castShadow = false;
    this.eyesMesh.receiveShadow = false;
    this.eyesMesh.frustumCulled = false;

    this.pupilsMesh = new THREE.InstancedMesh(this.pupilGeo, pupilMat, n * 2);
    this.pupilsMesh.castShadow = false;
    this.pupilsMesh.receiveShadow = false;
    this.pupilsMesh.frustumCulled = false;

    this.papersStackMesh = new THREE.InstancedMesh(
      this.papersStackGeo,
      this.vertexColorMat,
      n
    );
    this.papersStackMesh.castShadow = false;
    this.papersStackMesh.receiveShadow = true;
    this.papersStackMesh.frustumCulled = false;
    this.papersStackMesh.count = 0;
    this.papersStackMesh.visible = false;

    this.papersPageMesh = new THREE.InstancedMesh(
      this.papersPageGeo,
      this.vertexColorMat,
      n
    );
    this.papersPageMesh.castShadow = false;
    this.papersPageMesh.receiveShadow = true;
    this.papersPageMesh.frustumCulled = false;
    this.papersPageMesh.count = 0;
    this.papersPageMesh.visible = false;

    this.globeBallMesh = new THREE.InstancedMesh(
      this.globeBallGeo,
      this.vertexColorMat,
      n
    );
    this.globeBallMesh.castShadow = false;
    this.globeBallMesh.receiveShadow = false;
    this.globeBallMesh.frustumCulled = false;
    this.globeBallMesh.count = 0;
    this.globeBallMesh.visible = false;

    this.globeRingMesh = new THREE.InstancedMesh(
      this.globeRingGeo,
      ringMat,
      n
    );
    this.globeRingMesh.castShadow = false;
    this.globeRingMesh.receiveShadow = false;
    this.globeRingMesh.frustumCulled = false;
    this.globeRingMesh.count = 0;
    this.globeRingMesh.visible = false;

    const seatWorld = new THREE.Vector3();
    for (let i = 0; i < roles.length; i++) {
      const role = roles[i]!;
      const desk = desks.get(role.id);
      if (desk) {
        desk.seatAnchor.getWorldPosition(seatWorld);
      } else {
        seatWorld.set(0, 0, 0);
      }
      const rotY = desk ? desk.def.rotY + Math.PI : 0;

      this.tmpColor.set(role.tint);
      this.beanMesh.setColorAt(i, this.tmpColor);
      this.armsMesh.setColorAt(i * 2, this.tmpColor);
      this.armsMesh.setColorAt(i * 2 + 1, this.tmpColor);
      this.feetMesh.setColorAt(i * 2, this.tmpColor);
      this.feetMesh.setColorAt(i * 2 + 1, this.tmpColor);
      this.bulbMesh.setColorAt(i, this.tmpColor.set(STATUS_BULB_COLOR.idle));

      const spriteAnchor = new THREE.Group();
      spriteAnchor.position.copy(seatWorld);
      spriteAnchor.rotation.y = rotY;
      spriteAnchor.scale.setScalar(0.86);

      const nameTag = textSprite(
        `${role.id.toUpperCase()} · ${role.title.split("/")[0]!.trim()}`,
        {
          bg: "#2b2d42",
          color: "#fffaf3",
          size: 36,
          border: "#fffaf3",
        }
      );
      nameTag.position.y = 1.55;
      nameTag.userData.roleId = role.id;
      spriteAnchor.add(nameTag);
      this.root.add(spriteAnchor);

      const slot: WorkerSlot = {
        index: this.orderedSlots.length,
        role,
        pos: seatWorld.clone(),
        rotY,
        spriteAnchor,
        nameTag,
        bubbleHandle: null,
        lastBulbStatus: "idle",
        prevStatus: null,
        doneElapsed: 0,
        acts: new Map(),
        stance: {
          armLx: 0,
          armRx: 0,
          armLz: 0,
          armRz: 0,
          reach: 0,
          drop: 0,
          lean: 0,
          turn: 0,
          roll: 0,
          lift: 0,
          tap: 0,
          kick: 0,
          lid: 1,
          look: 0,
        },
        scratch: {
          armLx: 0,
          armRx: 0,
          armLz: 0,
          armRz: 0,
          reach: 0,
          drop: 0,
          lean: 0,
          turn: 0,
          roll: 0,
          lift: 0,
          tap: 0,
          kick: 0,
          lid: 1,
          look: 0,
        },
        t: Math.random() * 5,
        blinkAt: 2 + Math.random() * 3,
        flipT: 0,
        globeBallRotY: 0,
        globeRingRotZ: 0,
        showPapers: false,
        showGlobe: false,
        bodyMatrix: new THREE.Matrix4(),
        rootMatrix: new THREE.Matrix4(),
      };
      this.slots.set(role.id, slot);
      this.orderedSlots.push(slot);
    }

    const activeCount = this.orderedSlots.length;
    this.beanMesh.count = activeCount;
    this.headsetMesh.count = activeCount;
    this.bulbMesh.count = activeCount;
    this.armsMesh.count = activeCount * 2;
    this.feetMesh.count = activeCount * 2;
    this.eyesMesh.count = activeCount * 2;
    this.pupilsMesh.count = activeCount * 2;

    if (this.beanMesh.instanceColor) this.beanMesh.instanceColor.needsUpdate = true;
    if (this.armsMesh.instanceColor) this.armsMesh.instanceColor.needsUpdate = true;
    if (this.feetMesh.instanceColor) this.feetMesh.instanceColor.needsUpdate = true;
    if (this.bulbMesh.instanceColor) this.bulbMesh.instanceColor.needsUpdate = true;

    this.root.add(
      this.beanMesh,
      this.headsetMesh,
      this.bulbMesh,
      this.armsMesh,
      this.feetMesh,
      this.eyesMesh,
      this.pupilsMesh,
      this.papersStackMesh,
      this.papersPageMesh,
      this.globeBallMesh,
      this.globeRingMesh
    );
  }

  getPosition(roleId: AgentRoleId): THREE.Vector3 | null {
    return this.slots.get(roleId)?.pos ?? null;
  }

  setTransform(
    roleId: AgentRoleId,
    x: number,
    y: number,
    z: number,
    rotY: number
  ): void {
    const slot = this.slots.get(roleId);
    if (!slot) return;
    slot.pos.set(x, y, z);
    slot.rotY = rotY;
    slot.spriteAnchor.position.set(x, y, z);
    slot.spriteAnchor.rotation.y = rotY;
  }

  private updateBubble(
    slot: WorkerSlot,
    live: AgentLiveState,
    activeProvider: string,
    animating: boolean,
    nowMs: number
  ): boolean {
    if (live.status === "idle" && !live.currentTicketId) {
      if (slot.bubbleHandle) {
        slot.bubbleHandle.sprite.visible = false;
      }
      return false;
    }

    const subTag = live.subAgentId ?? `sub-${activeProvider}-${slot.role.id}`;
    const structuralKey = `${live.status}|${activeProvider}|${subTag}|${
      live.currentTicketId ?? ""
    }`;
    const detailKey = live.detail.slice(0, 72);

    const handle = slot.bubbleHandle;
    const structChanged = !handle || handle.structuralKey !== structuralKey;
    const detailChanged = !handle || handle.detailKey !== detailKey;

    if (!structChanged && !detailChanged) {
      if (handle && !handle.sprite.visible) {
        handle.sprite.visible = true;
      }
      return false;
    }

    if (
      !structChanged &&
      detailChanged &&
      animating &&
      nowMs - handle.lastPaintMs < 150
    ) {
      return true;
    }

    const [chipText, chipBg, chipFg] = CHIP_FOR_STATUS[live.status];
    const bg =
      live.status === "waiting_approval" || live.status === "error"
        ? "#ffc2d1"
        : live.status === "done"
          ? "#caffbf"
          : live.status === "idle"
            ? "#fffaf3"
            : "#ffec99";
    const border =
      live.status === "waiting_approval" || live.status === "error"
        ? "#c9184a"
        : "#2b2d42";

    const cardOpts = {
      chip: { text: chipText, bg: chipBg, color: chipFg },
      title: live.currentTicketId
        ? `${live.currentTicketId} · ${subTag}`
        : `${slot.role.title} (${activeProvider})`,
      body: live.detail,
      bg,
      border,
    };

    if (!slot.bubbleHandle) {
      const canvas = document.createElement("canvas");
      const { w, h } = paintCardCanvas(canvas, cardOpts);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      const mat = new THREE.SpriteMaterial({
        map: tex,
        depthWrite: false,
        transparent: true,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set((w / CARD_RES) * TEXT_SCALE, (h / CARD_RES) * TEXT_SCALE, 1);
      sprite.center.set(0.5, 0);
      sprite.position.y = 1.82;
      sprite.renderOrder = 10;
      sprite.userData.roleId = slot.role.id;
      slot.spriteAnchor.add(sprite);
      slot.bubbleHandle = {
        sprite,
        canvas,
        tex,
        structuralKey,
        detailKey,
        lastPaintMs: nowMs,
      };
    } else {
      const bh = slot.bubbleHandle;
      const { w, h, resized } = paintCardCanvas(bh.canvas, cardOpts);
      if (resized) {
        bh.tex.dispose();
        const nextTex = new THREE.CanvasTexture(bh.canvas);
        nextTex.colorSpace = THREE.SRGBColorSpace;
        nextTex.anisotropy = 4;
        bh.tex = nextTex;
        bh.sprite.material.map = nextTex;
        bh.sprite.material.needsUpdate = true;
      } else {
        bh.tex.needsUpdate = true;
      }
      bh.sprite.scale.set(
        (w / CARD_RES) * TEXT_SCALE,
        (h / CARD_RES) * TEXT_SCALE,
        1
      );
      bh.sprite.visible = true;
      bh.structuralKey = structuralKey;
      bh.detailKey = detailKey;
      bh.lastPaintMs = nowMs;
    }

    return false;
  }

  updateWorker(
    roleId: AgentRoleId,
    dt: number,
    live: AgentLiveState,
    reducedMotion: boolean,
    activeProvider: string,
    nowMs: number
  ): { animating: boolean; shadowDirty: boolean } {
    const slot = this.slots.get(roleId);
    if (!slot) return { animating: false, shadowDirty: false };

    slot.t += dt;
    const statusChanged = live.status !== slot.prevStatus;
    if (live.status === "done") {
      slot.doneElapsed = slot.prevStatus === "done" ? slot.doneElapsed + dt : 0;
    } else {
      slot.doneElapsed = 0;
    }
    slot.prevStatus = live.status;

    if (live.status !== slot.lastBulbStatus) {
      slot.lastBulbStatus = live.status;
      this.bulbMesh.setColorAt(
        slot.index,
        this.tmpColor.set(STATUS_BULB_COLOR[live.status])
      );
      if (this.bulbMesh.instanceColor) {
        this.bulbMesh.instanceColor.needsUpdate = true;
      }
    }

    const act = mapStatusToAct(live.status);
    const s = blendStance(
      slot.acts,
      act,
      reducedMotion ? 1 : dt,
      reducedMotion ? 0 : slot.t,
      slot.scratch,
      slot.stance
    );

    const doneSettled =
      live.status === "done" && (reducedMotion || slot.doneElapsed >= 3.0);

    this.dummy.position.copy(slot.pos);
    this.dummy.rotation.set(0, slot.rotY, 0);
    this.dummy.scale.setScalar(0.86);
    this.dummy.updateMatrix();
    slot.rootMatrix.copy(this.dummy.matrix);

    this.dummy.position.set(0, reducedMotion || doneSettled ? 0 : s.lift, 0);
    this.dummy.rotation.set(s.lean, s.turn, s.roll);
    this.dummy.scale.set(1, 1, 1);
    this.dummy.updateMatrix();
    slot.bodyMatrix.multiplyMatrices(slot.rootMatrix, this.dummy.matrix);

    this.beanMesh.setMatrixAt(slot.index, slot.bodyMatrix);
    this.headsetMesh.setMatrixAt(slot.index, slot.bodyMatrix);
    this.bulbMesh.setMatrixAt(slot.index, slot.bodyMatrix);

    this.dummy.position.set(
      -0.3 + s.reach * 0.08,
      0.55 - s.drop,
      0.05 + s.reach * 0.14
    );
    this.dummy.rotation.set(s.armLx, 0, s.armLz);
    this.dummy.scale.set(1, 1, 1);
    this.dummy.updateMatrix();
    this.partMat4.multiplyMatrices(slot.bodyMatrix, this.dummy.matrix);
    this.armsMesh.setMatrixAt(slot.index * 2, this.partMat4);

    this.dummy.position.set(
      0.3 - s.reach * 0.08,
      0.55 - s.drop,
      0.05 + s.reach * 0.14
    );
    this.dummy.rotation.set(s.armRx, 0, s.armRz);
    this.dummy.updateMatrix();
    this.partMat4.multiplyMatrices(slot.bodyMatrix, this.dummy.matrix);
    this.armsMesh.setMatrixAt(slot.index * 2 + 1, this.partMat4);

    this.dummy.rotation.set(0, 0, 0);
    this.dummy.position.set(-0.12, 0.2, 0.05 + s.kick);
    this.dummy.updateMatrix();
    this.partMat4.multiplyMatrices(slot.bodyMatrix, this.dummy.matrix);
    this.feetMesh.setMatrixAt(slot.index * 2, this.partMat4);

    this.dummy.position.set(0.12, 0.2 + s.tap * 0.05, 0.05 + s.kick);
    this.dummy.updateMatrix();
    this.partMat4.multiplyMatrices(slot.bodyMatrix, this.dummy.matrix);
    this.feetMesh.setMatrixAt(slot.index * 2 + 1, this.partMat4);

    let blink = s.lid;
    if (!reducedMotion) {
      slot.blinkAt -= dt;
      if (slot.blinkAt <= 0) {
        if (dt >= 0.095) {
          slot.blinkAt = 2.4 + Math.random() * 3.5;
        } else {
          blink = 0.1;
          if (slot.blinkAt < -0.11) {
            slot.blinkAt = 2.4 + Math.random() * 3.5;
          }
        }
      }
    }
    this.dummy.rotation.set(0, 0, 0);
    this.dummy.scale.set(1, blink, 1);
    for (let eyeIdx = 0; eyeIdx < 2; eyeIdx++) {
      const sx = eyeIdx === 0 ? -1 : 1;
      this.dummy.position.set(sx * 0.11, 0.7, 0.23);
      this.dummy.updateMatrix();
      this.partMat4.multiplyMatrices(slot.bodyMatrix, this.dummy.matrix);
      this.eyesMesh.setMatrixAt(slot.index * 2 + eyeIdx, this.partMat4);

      this.dummy.position.set(sx * 0.11, 0.7 + s.look, 0.29);
      this.dummy.updateMatrix();
      this.partMat4.multiplyMatrices(slot.bodyMatrix, this.dummy.matrix);
      this.pupilsMesh.setMatrixAt(slot.index * 2 + eyeIdx, this.partMat4);
    }

    slot.showPapers = act === "read";
    if (slot.showPapers && !reducedMotion) {
      slot.flipT = (slot.flipT + dt * 0.45) % 1;
    }
    slot.showGlobe = act === "web";
    if (slot.showGlobe && !reducedMotion) {
      slot.globeBallRotY += dt * 1.8;
      slot.globeRingRotZ += dt * 0.9;
    }

    const settlingActs =
      slot.acts.size > 1 || Math.abs((slot.acts.get(act) ?? 0) - 1) > 0.01;
    const activeStatus = live.status !== "idle" && !doneSettled;
    const animating = !reducedMotion && (settlingActs || activeStatus);
    const bubblePending = this.updateBubble(
      slot,
      live,
      activeProvider,
      animating,
      nowMs
    );
    const shadowDirty = animating || statusChanged;
    return { animating: animating || bubblePending, shadowDirty };
  }

  commit(): void {
    this.beanMesh.instanceMatrix.needsUpdate = true;
    this.headsetMesh.instanceMatrix.needsUpdate = true;
    this.bulbMesh.instanceMatrix.needsUpdate = true;
    this.armsMesh.instanceMatrix.needsUpdate = true;
    this.feetMesh.instanceMatrix.needsUpdate = true;
    this.eyesMesh.instanceMatrix.needsUpdate = true;
    this.pupilsMesh.instanceMatrix.needsUpdate = true;

    let paperIdx = 0;
    let globeIdx = 0;
    for (let i = 0; i < this.orderedSlots.length; i++) {
      const slot = this.orderedSlots[i]!;
      if (slot.showPapers) {
        this.dummy.position.set(0, 0.86, 0.4);
        this.dummy.rotation.set(0.35, 0, 0);
        this.dummy.scale.set(1, 1, 1);
        this.dummy.updateMatrix();
        this.partMat4.multiplyMatrices(slot.bodyMatrix, this.dummy.matrix);
        this.papersStackMesh.setMatrixAt(paperIdx, this.partMat4);

        const flip = slot.flipT > 0.78 ? (slot.flipT - 0.78) / 0.22 : 0;
        this.dummy.position.set(0, 0, 0);
        this.dummy.rotation.set(-flip * Math.PI, 0, 0);
        this.dummy.updateMatrix();
        this.subMat4.multiplyMatrices(this.partMat4, this.dummy.matrix);
        this.papersPageMesh.setMatrixAt(paperIdx, this.subMat4);
        paperIdx++;
      }

      if (slot.showGlobe) {
        this.dummy.position.set(-0.7, 0.95, 0.85);
        this.dummy.rotation.set(0, slot.globeBallRotY, 0.41);
        this.dummy.scale.set(1, 1, 1);
        this.dummy.updateMatrix();
        this.partMat4.multiplyMatrices(slot.rootMatrix, this.dummy.matrix);
        this.globeBallMesh.setMatrixAt(globeIdx, this.partMat4);

        this.dummy.position.set(-0.7, 0.95, 0.85);
        this.dummy.rotation.set(Math.PI / 2 - 0.2, 0, slot.globeRingRotZ);
        this.dummy.updateMatrix();
        this.partMat4.multiplyMatrices(slot.rootMatrix, this.dummy.matrix);
        this.globeRingMesh.setMatrixAt(globeIdx, this.partMat4);
        globeIdx++;
      }
    }

    this.papersStackMesh.count = paperIdx;
    this.papersPageMesh.count = paperIdx;
    this.papersStackMesh.visible = paperIdx > 0;
    this.papersPageMesh.visible = paperIdx > 0;
    if (paperIdx > 0) {
      this.papersStackMesh.instanceMatrix.needsUpdate = true;
      this.papersPageMesh.instanceMatrix.needsUpdate = true;
    }

    this.globeBallMesh.count = globeIdx;
    this.globeRingMesh.count = globeIdx;
    this.globeBallMesh.visible = globeIdx > 0;
    this.globeRingMesh.visible = globeIdx > 0;
    if (globeIdx > 0) {
      this.globeBallMesh.instanceMatrix.needsUpdate = true;
      this.globeRingMesh.instanceMatrix.needsUpdate = true;
    }
  }

  pickRole(raycaster: THREE.Raycaster): AgentRoleId | null {
    this.beanMesh.computeBoundingSphere();
    this.headsetMesh.computeBoundingSphere();
    this.armsMesh.computeBoundingSphere();
    this.feetMesh.computeBoundingSphere();

    this.raySprites.length = 0;
    for (let i = 0; i < this.orderedSlots.length; i++) {
      const slot = this.orderedSlots[i]!;
      this.raySprites.push(slot.nameTag);
      if (slot.bubbleHandle && slot.bubbleHandle.sprite.visible) {
        this.raySprites.push(slot.bubbleHandle.sprite);
      }
    }

    const targets: THREE.Object3D[] = [
      this.beanMesh,
      this.headsetMesh,
      this.armsMesh,
      this.feetMesh,
      ...this.raySprites,
    ];
    const hits = raycaster.intersectObjects(targets, false);
    if (hits.length === 0) return null;
    const hit = hits[0]!;
    if (hit.object === this.beanMesh || hit.object === this.headsetMesh) {
      return hit.instanceId !== undefined
        ? (this.orderedSlots[hit.instanceId]?.role.id ?? null)
        : null;
    }
    if (hit.object === this.armsMesh || hit.object === this.feetMesh) {
      return hit.instanceId !== undefined
        ? (this.orderedSlots[Math.floor(hit.instanceId / 2)]?.role.id ?? null)
        : null;
    }
    return (hit.object.userData.roleId as AgentRoleId | undefined) ?? null;
  }

  dispose(): void {
    this.beanMesh.dispose();
    this.headsetMesh.dispose();
    this.bulbMesh.dispose();
    this.armsMesh.dispose();
    this.feetMesh.dispose();
    this.eyesMesh.dispose();
    this.pupilsMesh.dispose();
    this.papersStackMesh.dispose();
    this.papersPageMesh.dispose();
    this.globeBallMesh.dispose();
    this.globeRingMesh.dispose();

    this.beanGeo.dispose();
    this.headsetGeo.dispose();
    this.bulbGeo.dispose();
    this.armGeo.dispose();
    this.footGeo.dispose();
    this.eyeGeo.dispose();
    this.pupilGeo.dispose();
    this.papersStackGeo.dispose();
    this.papersPageGeo.dispose();
    this.globeBallGeo.dispose();
    this.globeRingGeo.dispose();

    this.skinMat.dispose();
    this.bulbMat.dispose();
    this.vertexColorMat.dispose();

    for (const slot of this.orderedSlots) {
      disposeSprite(slot.nameTag);
      if (slot.bubbleHandle) {
        disposeSprite(slot.bubbleHandle.sprite);
        slot.bubbleHandle = null;
      }
    }
  }
}

export class OfficeDog {
  readonly root = new THREE.Group();
  private mixer: THREE.AnimationMixer | null = null;
  private readonly clips = new Map<
    string,
    { action: THREE.AnimationAction; w: number }
  >();
  private readonly skeletons: Array<{
    skeleton: THREE.Skeleton;
    origUpdate: () => void;
    dirty: boolean;
  }> = [];
  private mergedDog: THREE.SkinnedMesh | null = null;
  private mergedDogGeo: THREE.BufferGeometry | null = null;
  private mergedDogMat: THREE.MeshToonMaterial | null = null;
  private tag: THREE.Sprite | null = null;
  private bubble: THREE.Sprite | null = null;
  private bubbleCanvas: HTMLCanvasElement | null = null;
  private bubbleTex: THREE.CanvasTexture | null = null;
  private lastBubbleText = "";
  private bubbleTimer = 0;
  private t = 0;
  private targetPos = new THREE.Vector3(7.2, 0, 1.5);
  private currentAct = "lie";
  private freezeSkeleton = false;
  private frozenPoseKey = "";

  constructor() {
    this.root.position.set(7.2, 0, 1.5);
    const loaded = getPreloadedModel("dog-corgi");
    if (loaded) {
      const coatColors: Record<string, string> = {
        Fur: "#e09f5a",
        Light: "#fffaf3",
        Ear: "#c97a3a",
        Ink: "#1d1d1d",
        Shine: "#ffffff",
        Nose: "#1d1d1d",
        Tongue: "#ff7f9a",
        Collar: "#ef476f",
        Tag: "#ffd166",
      };

      const skinnedMeshes: THREE.SkinnedMesh[] = [];
      loaded.scene.traverse((o) => {
        if ((o as THREE.SkinnedMesh).isSkinnedMesh) {
          skinnedMeshes.push(o as THREE.SkinnedMesh);
        }
      });

      if (skinnedMeshes.length > 0) {
        const primary = skinnedMeshes[0]!;
        const parentGroup = primary.parent ?? loaded.scene;
        const parts: THREE.BufferGeometry[] = [];
        const tmpColor = new THREE.Color();

        for (const m of skinnedMeshes) {
          // Clone cached GLTF geometry so disposing OfficeDog never corrupts models.ts cache.
          const g = m.geometry.clone();
          for (const attrName of Object.keys(g.attributes)) {
            if (
              attrName !== "position" &&
              attrName !== "normal" &&
              attrName !== "skinIndex" &&
              attrName !== "skinWeight"
            ) {
              g.deleteAttribute(attrName);
            }
          }
          const matName = (m.material as THREE.Material)?.name ?? "Fur";
          tmpColor.set(coatColors[matName] ?? "#e09f5a");
          const count = g.attributes.position!.count;
          const colors = new Float32Array(count * 3);
          for (let i = 0; i < count; i++) {
            colors[i * 3] = tmpColor.r;
            colors[i * 3 + 1] = tmpColor.g;
            colors[i * 3 + 2] = tmpColor.b;
          }
          g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
          parts.push(g);
          parentGroup.remove(m);
        }

        const mergedGeo = mergeGeometries(parts, false);
        for (const g of parts) g.dispose();

        if (mergedGeo) {
          const dogMat = new THREE.MeshToonMaterial({
            color: "#ffffff",
            vertexColors: true,
            gradientMap: gradientMap(),
          });
          const mergedDog = new THREE.SkinnedMesh(mergedGeo, dogMat);
          mergedDog.castShadow = true;
          mergedDog.receiveShadow = true;
          mergedDog.frustumCulled = false;
          mergedDog.bind(primary.skeleton, primary.bindMatrix);
          parentGroup.add(mergedDog);

          this.mergedDog = mergedDog;
          this.mergedDogGeo = mergedGeo;
          this.mergedDogMat = dogMat;

          const skel = primary.skeleton;
          const origUpdate = skel.update.bind(skel);
          const entry = {
            skeleton: skel,
            origUpdate,
            dirty: true,
          };
          // Skip per-frame boneMatrix/boneTexture uploads when reducedMotion pose is baked.
          skel.update = () => {
            if (!this.freezeSkeleton || entry.dirty) {
              entry.dirty = false;
              entry.origUpdate();
            }
          };
          this.skeletons.push(entry);
        }
      }

      this.root.add(loaded.scene);
      this.mixer = new THREE.AnimationMixer(loaded.scene);
      for (const c of loaded.clips) {
        this.clips.set(c.name, {
          action: this.mixer.clipAction(c),
          w: 0,
        });
      }
    }

    this.tag = textSprite("Biscuit (Office Corgi)", {
      bg: "#fffaf3",
      size: 28,
    });
    this.tag.position.y = 0.98;
    this.root.add(this.tag);
  }

  pet() {
    this.currentAct = "wag";
    this.say("Woof! <3", 2.4);
    this.frozenPoseKey = "";
  }

  advanceIdleClock(sec: number) {
    this.t += sec;
  }

  unfreezeIfNeeded(reducedMotion: boolean) {
    if (!reducedMotion) {
      this.freezeSkeleton = false;
      this.frozenPoseKey = "";
    }
  }

  private say(text: string, duration: number) {
    if (!this.bubble || !this.bubbleCanvas || !this.bubbleTex) {
      this.bubbleCanvas = document.createElement("canvas");
      const { w, h } = paintTextCanvas(this.bubbleCanvas, text, {
        bg: "#ffd6e0",
        size: 32,
      });
      this.bubbleTex = new THREE.CanvasTexture(this.bubbleCanvas);
      this.bubbleTex.colorSpace = THREE.SRGBColorSpace;
      this.bubbleTex.anisotropy = 4;
      const mat = new THREE.SpriteMaterial({
        map: this.bubbleTex,
        depthWrite: false,
        transparent: true,
      });
      this.bubble = new THREE.Sprite(mat);
      this.bubble.scale.set(w * TEXT_SCALE, h * TEXT_SCALE, 1);
      this.bubble.position.y = 1.28;
      this.bubble.renderOrder = 10;
      this.root.add(this.bubble);
      this.lastBubbleText = text;
    } else if (text !== this.lastBubbleText) {
      const { w, h, resized } = paintTextCanvas(this.bubbleCanvas, text, {
        bg: "#ffd6e0",
        size: 32,
      });
      if (resized) {
        this.bubbleTex.dispose();
        this.bubbleTex = new THREE.CanvasTexture(this.bubbleCanvas);
        this.bubbleTex.colorSpace = THREE.SRGBColorSpace;
        this.bubbleTex.anisotropy = 4;
        this.bubble.material.map = this.bubbleTex;
        this.bubble.material.needsUpdate = true;
      } else {
        this.bubbleTex.needsUpdate = true;
      }
      this.bubble.scale.set(w * TEXT_SCALE, h * TEXT_SCALE, 1);
      this.lastBubbleText = text;
    }
    this.bubble.visible = true;
    this.bubbleTimer = duration;
  }

  update(
    dt: number,
    needyDeskPos: THREE.Vector3 | null,
    reducedMotion: boolean
  ): { active: boolean; shadowDirty: boolean } {
    this.t += dt;
    if (this.bubble && this.bubble.visible) {
      this.bubbleTimer -= dt;
      if (this.bubbleTimer <= 0) {
        this.bubble.visible = false;
      }
    }

    if (needyDeskPos) {
      this.targetPos.set(needyDeskPos.x + 1.1, 0, needyDeskPos.z + 1.1);
    } else if (Math.floor(this.t / 14) % 2 === 0) {
      this.targetPos.set(7.2, 0, 1.5);
    } else {
      this.targetPos.set(-5.8, 0, 0.2);
    }

    const dx = this.targetPos.x - this.root.position.x;
    const dz = this.targetPos.z - this.root.position.z;
    const dist = Math.hypot(dx, dz);

    let wantClip = this.currentAct;
    let moved = false;
    if (dist > 0.25 && !reducedMotion) {
      const speed = needyDeskPos ? 2.8 : 1.3;
      const step = Math.min(dist, speed * dt);
      this.root.position.x += (dx / dist) * step;
      this.root.position.z += (dz / dist) * step;
      this.root.rotation.y = Math.atan2(dx, dz);
      wantClip = needyDeskPos ? "run" : "walk";
      moved = true;
    } else {
      if (reducedMotion && dist > 0.25) {
        this.root.position.copy(this.targetPos);
        moved = true;
      }
      if (needyDeskPos) {
        wantClip = "sit";
        if ((!this.bubble || !this.bubble.visible) && Math.floor(this.t * 2) % 6 === 0) {
          this.say("Woof! Approval needed!", 1.8);
        }
      } else {
        wantClip = this.bubble?.visible ? "wag" : "lie";
      }
    }

    let clipsBlending = false;
    let skeletonBaked = false;
    if (this.mixer) {
      const chosen = this.clips.has(wantClip) ? wantClip : "stand";
      if (reducedMotion) {
        const poseKey = `${chosen}|${Math.round(this.root.position.x * 100)}|${Math.round(
          this.root.position.z * 100
        )}`;
        if (poseKey !== this.frozenPoseKey || !this.freezeSkeleton) {
          for (const [name, c] of this.clips) {
            const w = name === chosen ? 1 : 0;
            if (w > 0 && c.w === 0) c.action.reset().play();
            else if (w === 0 && c.w > 0) c.action.stop();
            c.w = w;
            if (w > 0) c.action.setEffectiveWeight(1);
          }
          this.mixer.update(0);
          this.root.updateMatrixWorld(true);
          for (const entry of this.skeletons) {
            entry.dirty = true;
          }
          this.freezeSkeleton = true;
          this.frozenPoseKey = poseKey;
          skeletonBaked = true;
        }
      } else {
        this.freezeSkeleton = false;
        this.frozenPoseKey = "";
        let total = 0;
        for (const [name, c] of this.clips) {
          const w = THREE.MathUtils.clamp(
            name === chosen ? c.w + dt * 3 : c.w - dt * 3,
            0,
            1
          );
          if (w > 0 && c.w === 0) c.action.reset().play();
          else if (w === 0 && c.w > 0) c.action.stop();
          c.w = w;
          total += w;
          if ((name === chosen && w < 0.999) || (name !== chosen && w > 0.001)) {
            clipsBlending = true;
          }
        }
        if (total > 0) {
          for (const c of this.clips.values()) {
            if (c.w > 0) c.action.setEffectiveWeight(c.w / total);
          }
        }
        this.mixer.update(dt);
      }
    }

    const active =
      !reducedMotion &&
      (moved || Boolean(this.bubble?.visible) || clipsBlending || Boolean(needyDeskPos));
    const shadowDirty = moved || skeletonBaked || clipsBlending || active;
    return { active, shadowDirty };
  }

  dispose() {
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer.uncacheRoot(this.mixer.getRoot());
      this.mixer = null;
    }
    for (const entry of this.skeletons) {
      entry.skeleton.update = entry.origUpdate;
      entry.skeleton.dispose();
    }
    this.skeletons.length = 0;
    this.mergedDogGeo?.dispose();
    this.mergedDogMat?.dispose();
    this.mergedDog = null;
    this.mergedDogGeo = null;
    this.mergedDogMat = null;
    disposeSprite(this.tag);
    disposeSprite(this.bubble);
    this.tag = null;
    this.bubble = null;
    this.bubbleCanvas = null;
    this.bubbleTex = null;
  }
}

const MAX_CONFETTI = 288;
const CONFETTI_COLORS = ["#ff8a5b", "#06d6a0", "#ffd166", "#ef476f", "#5bc0eb"];

export class ConfettiSystem {
  readonly group = new THREE.Group();
  private readonly geo = new THREE.BoxGeometry(0.08, 0.02, 0.05);
  private readonly mat = toonUnique("#ffffff", { outline: false });
  private readonly instanced = new THREE.InstancedMesh(
    this.geo,
    this.mat,
    MAX_CONFETTI
  );
  private readonly pieces: Array<{
    x: number;
    y: number;
    z: number;
    rx: number;
    rz: number;
    vx: number;
    vy: number;
    vz: number;
    life: number;
  }> = [];
  private readonly dummy = new THREE.Object3D();
  private readonly tmpColor = new THREE.Color();

  constructor() {
    this.instanced.castShadow = false;
    this.instanced.receiveShadow = false;
    this.instanced.frustumCulled = false;
    this.instanced.count = 0;
    this.instanced.visible = false;
    this.instanced.setColorAt(0, this.tmpColor.set("#ffffff"));
    this.group.add(this.instanced);
  }

  get isActive(): boolean {
    return this.pieces.length > 0;
  }

  burst(x: number, y: number, z: number) {
    for (let i = 0; i < 36; i++) {
      if (this.pieces.length >= MAX_CONFETTI) break;
      const idx = this.pieces.length;
      this.pieces.push({
        x: x + (Math.random() - 0.5) * 0.4,
        y: y + 1.2 + Math.random() * 0.4,
        z: z + (Math.random() - 0.5) * 0.4,
        rx: 0,
        rz: 0,
        vx: (Math.random() - 0.5) * 2.5,
        vy: 1.5 + Math.random() * 2.2,
        vz: (Math.random() - 0.5) * 2.5,
        life: 2.2,
      });
      this.instanced.setColorAt(
        idx,
        this.tmpColor.set(CONFETTI_COLORS[i % CONFETTI_COLORS.length]!)
      );
    }
    this.instanced.count = this.pieces.length;
    this.instanced.visible = this.pieces.length > 0;
    if (this.instanced.instanceColor) {
      this.instanced.instanceColor.needsUpdate = true;
    }
  }

  update(dt: number) {
    if (this.pieces.length === 0) return;

    let colorChanged = false;
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i]!;
      p.life -= dt;
      if (p.life <= 0 || p.y <= 0.04) {
        const lastIdx = this.pieces.length - 1;
        if (i !== lastIdx) {
          this.pieces[i] = this.pieces[lastIdx]!;
          this.instanced.getColorAt(lastIdx, this.tmpColor);
          this.instanced.setColorAt(i, this.tmpColor);
          colorChanged = true;
        }
        this.pieces.pop();
        continue;
      }
      p.vy -= 4.8 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rx += 5 * dt;
      p.rz += 4 * dt;

      this.dummy.position.set(p.x, p.y, p.z);
      this.dummy.rotation.set(p.rx, 0, p.rz);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();
      this.instanced.setMatrixAt(i, this.dummy.matrix);
    }

    this.instanced.count = this.pieces.length;
    this.instanced.visible = this.pieces.length > 0;
    if (this.pieces.length > 0) {
      this.instanced.instanceMatrix.needsUpdate = true;
      if (colorChanged && this.instanced.instanceColor) {
        this.instanced.instanceColor.needsUpdate = true;
      }
    }
  }

  dispose() {
    this.pieces.length = 0;
    this.instanced.count = 0;
    this.instanced.visible = false;
    this.instanced.dispose();
    this.geo.dispose();
    this.mat.dispose();
  }
}
