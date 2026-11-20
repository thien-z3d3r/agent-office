import * as THREE from "three";
import type {
  AgentLiveState,
  AgentRoleId,
  AgentStatus,
  RoleConfig,
} from "@agent-office/protocol";
import {
  cardSprite,
  disposeSprite,
  mesh,
  noOutline,
  roundedBox,
  textSprite,
  toon,
  toonUnique,
} from "./toon.ts";
import { getPreloadedModel } from "./models.ts";

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

function buildPapers(): { group: THREE.Group; page: THREE.Group } {
  const group = new THREE.Group();
  const W = 0.34;
  const H = 0.44;
  const paper = toon("#fffaf3");
  const ink = toon("#8d99ae");
  ["#f1ece2", "#f7f3ea", "#fffaf3"].forEach((c, i) => {
    const sheet = mesh(
      new THREE.BoxGeometry(W, H, 0.008),
      toon(c),
      (i - 1) * 0.012,
      -H / 2 - i * 0.006,
      0.02 - i * 0.012,
      false
    );
    sheet.rotation.z = (i - 1) * 0.04;
    group.add(sheet);
  });
  const addLines = (on: THREE.Object3D, z: number) => {
    for (let i = 0; i < 6; i++) {
      const short = i % 3 === 2;
      on.add(
        mesh(
          new THREE.BoxGeometry(W * (short ? 0.45 : 0.72), 0.018, 0.004),
          ink,
          short ? -W * 0.135 : 0,
          -0.07 - i * 0.055,
          z,
          false
        )
      );
    }
  };
  addLines(group, -0.01);
  const page = new THREE.Group();
  page.add(
    mesh(
      new THREE.BoxGeometry(W, H, 0.008),
      paper,
      0,
      -H / 2,
      -0.016,
      false
    )
  );
  addLines(page, -0.022);
  group.add(page);
  group.add(
    mesh(
      new THREE.BoxGeometry(W * 0.5, 0.05, 0.05),
      toon("#adb5bd"),
      0,
      0,
      0,
      false
    )
  );
  return { group, page };
}

function buildGlobe(): {
  group: THREE.Group;
  ball: THREE.Group;
  ring: THREE.Mesh;
} {
  const group = new THREE.Group();
  const ball = new THREE.Group();
  const r = 0.26;
  ball.add(
    mesh(new THREE.SphereGeometry(r, 20, 14), toon("#4cc9f0"), 0, 0, 0, false)
  );
  const land = toon("#6fcf6a");
  for (const [lat, lon, size] of [
    [0.5, 0.2, 0.5],
    [0.1, 0.9, 0.4],
    [-0.4, 0.5, 0.45],
    [0.3, 2.4, 0.6],
    [-0.2, 3.3, 0.4],
    [0.6, 4.4, 0.45],
    [-0.5, 5.2, 0.35],
  ] as const) {
    const blob = mesh(
      new THREE.SphereGeometry(size * r, 10, 8),
      land,
      Math.cos(lat) * Math.sin(lon) * r * 0.86,
      Math.sin(lat) * r * 0.86,
      Math.cos(lat) * Math.cos(lon) * r * 0.86,
      false
    );
    blob.scale.set(1.2, 0.8, 1.2);
    ball.add(blob);
  }
  ball.rotation.z = 0.41;
  group.add(ball);
  const ring = mesh(
    new THREE.TorusGeometry(r * 1.35, 0.016, 6, 32),
    toon("#ffd166", { emissive: "#7a5b00" }),
    0,
    0,
    0,
    false
  );
  ring.rotation.x = Math.PI / 2 - 0.2;
  group.add(ring);
  return { group, ball, ring };
}

export class ToonLaptop {
  readonly root = new THREE.Group();
  private readonly canvas = document.createElement("canvas");
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private readonly lid = new THREE.Group();
  private openT = 0;
  private lastKey = "";

  constructor(stickerColor = "#ff8a5b") {
    this.canvas.width = 640;
    this.canvas.height = 420;
    this.ctx = this.canvas.getContext("2d")!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;

    this.lid.position.set(0, 0.035, -0.24);
    this.root.add(this.lid);
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.72, 0.46),
      new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false })
    );
    screen.position.set(0, 0.25, 0.014);
    this.lid.add(noOutline(screen));

    const shell = toon("#c9ced6");
    const dark = toon("#2b2d42");
    this.root.add(
      mesh(roundedBox(0.78, 0.035, 0.52, 0.04), shell, 0, 0.018, 0.02)
    );
    this.root.add(
      mesh(
        new THREE.BoxGeometry(0.66, 0.006, 0.24),
        dark,
        0,
        0.037,
        0.0,
        false
      )
    );
    this.root.add(
      mesh(
        new THREE.BoxGeometry(0.2, 0.004, 0.11),
        toon("#aab1bb"),
        0,
        0.037,
        0.19,
        false
      )
    );
    const lidShell = mesh(
      roundedBox(0.78, 0.025, 0.5, 0.04),
      shell,
      0,
      0.25,
      0
    );
    lidShell.rotation.x = Math.PI / 2;
    this.lid.add(lidShell);

    const sticker = mesh(
      new THREE.CircleGeometry(0.07, 20),
      toon(stickerColor),
      0,
      0.27,
      -0.014,
      false
    );
    sticker.rotation.y = Math.PI;
    this.lid.add(sticker);

    this.lid.rotation.x = Math.PI / 2;
    this.paintScreen("IDLE", "Ready at desk", "");
  }

  private paintScreen(status: string, detail: string, streamTail: string) {
    const key = `${status}|${detail}|${streamTail.slice(-160)}`;
    if (key === this.lastKey) return;
    this.lastKey = key;

    const ctx = this.ctx;
    ctx.fillStyle = "#1b1d2e";
    ctx.fillRect(0, 0, 640, 420);
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
    lines.forEach((l, idx) => {
      ctx.fillText(l.slice(0, 52), 24, 126 + idx * 26);
    });
    this.texture.needsUpdate = true;
  }

  update(dt: number, live: AgentLiveState, reducedMotion: boolean): boolean {
    let lidMoved = false;
    if (this.openT < 1) {
      this.openT = reducedMotion ? 1 : Math.min(1, this.openT + dt * 1.8);
      const e = 1 - Math.pow(1 - this.openT, 3);
      this.lid.rotation.x = Math.PI / 2 - e * (Math.PI / 2 + 0.22);
      lidMoved = true;
    }
    this.paintScreen(live.status, live.detail, live.streamBuffer);
    return lidMoved;
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

export class ToonWorker {
  readonly root = new THREE.Group();
  readonly role: RoleConfig;
  private readonly body = new THREE.Group();
  private readonly skin: THREE.MeshToonMaterial;
  private readonly bulb: THREE.MeshToonMaterial;
  private readonly armL: THREE.Object3D;
  private readonly armR: THREE.Object3D;
  private readonly eyes: THREE.Mesh[] = [];
  private readonly pupils: THREE.Mesh[] = [];
  private readonly feet: THREE.Mesh[] = [];
  private readonly papers: { group: THREE.Group; page: THREE.Group };
  private readonly globe: {
    group: THREE.Group;
    ball: THREE.Group;
    ring: THREE.Mesh;
  };
  private nameTag: THREE.Sprite | null = null;
  private bubble: THREE.Sprite | null = null;
  private bubbleKey = "";
  private lastBulbStatus: AgentStatus | null = null;
  private prevStatus: AgentStatus | null = null;
  private doneElapsed = 0;
  private readonly acts = new Map<WorkerAct, number>();
  private readonly stance: Stance = {
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
  };
  private readonly scratch: Stance = { ...this.stance };
  private t = Math.random() * 5;
  private blinkAt = 2 + Math.random() * 3;
  private flipT = 0;

  constructor(role: RoleConfig) {
    this.role = role;
    this.skin = toonUnique(role.tint);
    const white = toon("#ffffff");
    const ink = toon("#1d1d1d");

    this.root.add(this.body);
    this.root.userData.roleId = role.id;
    this.root.scale.setScalar(0.86);

    const bean = mesh(
      new THREE.CapsuleGeometry(0.28, 0.3, 8, 16),
      this.skin,
      0,
      0.55,
      0
    );
    this.body.add(bean);

    for (const sx of [-1, 1]) {
      const eye = mesh(
        new THREE.SphereGeometry(0.09, 12, 10),
        white,
        sx * 0.11,
        0.7,
        0.23,
        false
      );
      eye.scale.z = 0.6;
      this.body.add(eye);
      const pupil = mesh(
        new THREE.SphereGeometry(0.045, 10, 8),
        ink,
        sx * 0.11,
        0.7,
        0.29,
        false
      );
      this.body.add(pupil);
      this.eyes.push(eye, pupil);
      this.pupils.push(pupil);
    }

    const band = mesh(
      new THREE.TorusGeometry(0.29, 0.025, 6, 20, Math.PI),
      toon("#2b2d42"),
      0,
      0.72,
      0,
      false
    );
    this.body.add(band);
    for (const sx of [-1, 1]) {
      this.body.add(
        mesh(
          new THREE.SphereGeometry(0.07, 10, 8),
          toon("#2b2d42"),
          sx * 0.29,
          0.72,
          0,
          false
        )
      );
    }

    this.body.add(
      mesh(
        new THREE.CylinderGeometry(0.015, 0.015, 0.22, 6),
        toon("#2b2d42"),
        0,
        1.07,
        0,
        false
      )
    );
    this.bulb = toonUnique(STATUS_BULB_COLOR.idle);
    this.bulb.emissive = new THREE.Color(STATUS_BULB_COLOR.idle).multiplyScalar(
      0.6
    );
    this.body.add(
      mesh(new THREE.SphereGeometry(0.075, 12, 10), this.bulb, 0, 1.2, 0, false)
    );

    const makeArm = (x: number) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.55, 0.05);
      pivot.add(
        mesh(
          new THREE.CapsuleGeometry(0.055, 0.16, 4, 8),
          this.skin,
          0,
          -0.12,
          0
        )
      );
      this.body.add(pivot);
      return pivot;
    };
    this.armL = makeArm(-0.3);
    this.armR = makeArm(0.3);

    for (const sx of [-1, 1]) {
      const foot = mesh(
        new THREE.CapsuleGeometry(0.06, 0.1, 4, 8),
        this.skin,
        sx * 0.12,
        0.2,
        0.05
      );
      this.body.add(foot);
      this.feet.push(foot);
    }

    this.papers = buildPapers();
    this.papers.group.position.set(0, 0.86, 0.4);
    this.papers.group.rotation.x = 0.35;
    this.papers.group.visible = false;
    this.body.add(this.papers.group);

    this.globe = buildGlobe();
    this.globe.group.position.set(-0.7, 0.95, 0.85);
    this.globe.group.visible = false;
    this.root.add(this.globe.group);

    this.nameTag = textSprite(
      `${role.id.toUpperCase()} · ${role.title.split("/")[0]!.trim()}`,
      {
        bg: "#2b2d42",
        color: "#fffaf3",
        size: 36,
        border: "#fffaf3",
      }
    );
    this.nameTag.position.y = 1.55;
    this.root.add(this.nameTag);
  }

  private updateBubble(live: AgentLiveState, activeProvider: string) {
    const [chipText, chipBg, chipFg] = CHIP_FOR_STATUS[live.status];
    const subTag = live.subAgentId ?? `sub-${activeProvider}-${this.role.id}`;
    const key = `${live.status}|${activeProvider}|${subTag}|${
      live.currentTicketId ?? ""
    }|${live.detail.slice(0, 72)}`;
    if (key === this.bubbleKey) return;
    this.bubbleKey = key;

    if (this.bubble) {
      this.root.remove(this.bubble);
      disposeSprite(this.bubble);
      this.bubble = null;
    }

    if (live.status === "idle" && !live.currentTicketId) {
      return;
    }

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

    this.bubble = cardSprite({
      chip: { text: chipText, bg: chipBg, color: chipFg },
      title: live.currentTicketId
        ? `${live.currentTicketId} · ${subTag}`
        : `${this.role.title} (${activeProvider})`,
      body: live.detail,
      bg,
      border,
    });
    this.bubble.position.y = 1.82;
    this.root.add(this.bubble);
  }

  update(
    dt: number,
    live: AgentLiveState,
    reducedMotion: boolean,
    activeProvider = "antigravity"
  ): { animating: boolean; shadowDirty: boolean } {
    this.t += dt;
    const statusChanged = live.status !== this.prevStatus;
    if (live.status === "done") {
      this.doneElapsed = this.prevStatus === "done" ? this.doneElapsed + dt : 0;
    } else {
      this.doneElapsed = 0;
    }
    this.prevStatus = live.status;

    if (live.status !== this.lastBulbStatus) {
      this.lastBulbStatus = live.status;
      const bulbHex = STATUS_BULB_COLOR[live.status];
      this.bulb.color.set(bulbHex);
      this.bulb.emissive.set(bulbHex).multiplyScalar(0.6);
    }

    this.updateBubble(live, activeProvider);

    const act = mapStatusToAct(live.status);
    const s = blendStance(
      this.acts,
      act,
      reducedMotion ? 1 : dt,
      reducedMotion ? 0 : this.t,
      this.scratch,
      this.stance
    );

    const doneSettled =
      live.status === "done" && (reducedMotion || this.doneElapsed >= 3.0);
    this.body.position.y = reducedMotion || doneSettled ? 0 : s.lift;
    this.body.rotation.set(s.lean, s.turn, s.roll);

    this.armL.position.set(
      -0.3 + s.reach * 0.08,
      0.55 - s.drop,
      0.05 + s.reach * 0.14
    );
    this.armR.position.set(
      0.3 - s.reach * 0.08,
      0.55 - s.drop,
      0.05 + s.reach * 0.14
    );
    this.armL.rotation.set(s.armLx, 0, s.armLz);
    this.armR.rotation.set(s.armRx, 0, s.armRz);

    if (this.feet[0] && this.feet[1]) {
      this.feet[0].position.set(-0.12, 0.2, 0.05 + s.kick);
      this.feet[1].position.set(0.12, 0.2 + s.tap * 0.05, 0.05 + s.kick);
    }

    // Periodic eye blink + pupil look direction (clamp open on throttled 1 Hz ticks)
    let blink = s.lid;
    if (!reducedMotion) {
      this.blinkAt -= dt;
      if (this.blinkAt <= 0) {
        if (dt >= 0.095) {
          this.blinkAt = 2.4 + Math.random() * 3.5;
        } else {
          blink = 0.1;
          if (this.blinkAt < -0.11) {
            this.blinkAt = 2.4 + Math.random() * 3.5;
          }
        }
      }
    }
    for (const e of this.eyes) e.scale.y = blink;
    for (const p of this.pupils) p.position.y = 0.7 + s.look;

    const showPapers = act === "read";
    this.papers.group.visible = showPapers;
    if (showPapers && !reducedMotion) {
      this.flipT = (this.flipT + dt * 0.45) % 1;
      const flip = this.flipT > 0.78 ? (this.flipT - 0.78) / 0.22 : 0;
      this.papers.page.rotation.x = -flip * Math.PI;
    }

    const showGlobe = act === "web";
    this.globe.group.visible = showGlobe;
    if (showGlobe && !reducedMotion) {
      this.globe.ball.rotation.y += dt * 1.8;
      this.globe.ring.rotation.z += dt * 0.9;
    }

    const settlingActs =
      this.acts.size > 1 || Math.abs((this.acts.get(act) ?? 0) - 1) > 0.01;
    const activeStatus = live.status !== "idle" && !doneSettled;
    const animating = !reducedMotion && (settlingActs || activeStatus);
    const shadowDirty = animating || statusChanged;
    return { animating, shadowDirty };
  }

  dispose() {
    disposeSprite(this.nameTag);
    disposeSprite(this.bubble);
    this.nameTag = null;
    this.bubble = null;
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
  private tag: THREE.Sprite | null = null;
  private bubble: THREE.Sprite | null = null;
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
      const seenSkeletons = new Set<THREE.Skeleton>();
      loaded.scene.traverse((o) => {
        const m = o as THREE.SkinnedMesh;
        if (!m.isMesh) return;
        const name = (m.material as THREE.Material)?.name ?? "Fur";
        m.material = toon(coatColors[name] ?? "#e09f5a");
        m.castShadow = true;
        m.receiveShadow = true;
        m.frustumCulled = false;

        if (m.isSkinnedMesh && m.skeleton && !seenSkeletons.has(m.skeleton)) {
          seenSkeletons.add(m.skeleton);
          const origUpdate = m.skeleton.update.bind(m.skeleton);
          const entry = {
            skeleton: m.skeleton,
            origUpdate,
            dirty: true,
          };
          // Skip per-frame boneMatrix/boneTexture uploads when reducedMotion pose is baked.
          m.skeleton.update = () => {
            if (!this.freezeSkeleton || entry.dirty) {
              entry.dirty = false;
              entry.origUpdate();
            }
          };
          this.skeletons.push(entry);
        }
      });
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
    if (this.bubble) {
      this.root.remove(this.bubble);
      disposeSprite(this.bubble);
    }
    this.bubble = textSprite(text, { bg: "#ffd6e0", size: 32 });
    this.bubble.position.y = 1.28;
    this.root.add(this.bubble);
    this.bubbleTimer = duration;
  }

  update(
    dt: number,
    needyDeskPos: THREE.Vector3 | null,
    reducedMotion: boolean
  ): { active: boolean; shadowDirty: boolean } {
    this.t += dt;
    if (this.bubble) {
      this.bubbleTimer -= dt;
      if (this.bubbleTimer <= 0) {
        this.root.remove(this.bubble);
        disposeSprite(this.bubble);
        this.bubble = null;
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
        if (!this.bubble && Math.floor(this.t * 2) % 6 === 0) {
          this.say("Woof! Approval needed!", 1.8);
        }
      } else {
        wantClip = this.bubble ? "wag" : "lie";
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
      (moved || Boolean(this.bubble) || clipsBlending || Boolean(needyDeskPos));
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
    disposeSprite(this.tag);
    disposeSprite(this.bubble);
    this.tag = null;
    this.bubble = null;
  }
}

export class ConfettiSystem {
  readonly group = new THREE.Group();
  private readonly geo = new THREE.BoxGeometry(0.08, 0.02, 0.05);
  private readonly pieces: Array<{
    mesh: THREE.Mesh;
    vx: number;
    vy: number;
    vz: number;
    life: number;
  }> = [];

  get isActive(): boolean {
    return this.pieces.length > 0;
  }

  burst(x: number, y: number, z: number) {
    const colors = ["#ff8a5b", "#06d6a0", "#ffd166", "#ef476f", "#5bc0eb"];
    for (let i = 0; i < 36; i++) {
      const m = mesh(
        this.geo,
        toon(colors[i % colors.length]!),
        x + (Math.random() - 0.5) * 0.4,
        y + 1.2 + Math.random() * 0.4,
        z + (Math.random() - 0.5) * 0.4,
        false
      );
      this.group.add(m);
      this.pieces.push({
        mesh: m,
        vx: (Math.random() - 0.5) * 2.5,
        vy: 1.5 + Math.random() * 2.2,
        vz: (Math.random() - 0.5) * 2.5,
        life: 2.2,
      });
    }
  }

  update(dt: number) {
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i]!;
      p.life -= dt;
      if (p.life <= 0 || p.mesh.position.y <= 0.04) {
        this.group.remove(p.mesh);
        this.pieces.splice(i, 1);
        continue;
      }
      p.vy -= 4.8 * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.mesh.rotation.x += 5 * dt;
      p.mesh.rotation.z += 4 * dt;
    }
  }

  dispose() {
    for (const p of this.pieces) {
      this.group.remove(p.mesh);
    }
    this.pieces.length = 0;
    this.geo.dispose();
  }
}
