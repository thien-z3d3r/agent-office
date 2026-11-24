import * as THREE from "three";
import type { AgentRoleId, RoleConfig } from "@agent-office/protocol";
import { mesh, roundedBox, toon } from "../toon.ts";
import { getPreloadedModel, paintModel, palette, piece } from "../models.ts";
import {
  DESK_BOOKS,
  DESK_PROP_COLORS,
  DESK_SIZE,
  FLOOR,
  FLOOR_PLANTS,
  KITCHEN_COLORS,
  LOUNGE_COLORS,
  MEETING_OFFSETS,
  PALETTE,
  PENDANT_SPOTS,
  PLANT_COLORS,
  PLANT_SPOTS,
  ROLE_DESK_PLACEMENTS,
  SUB_STATION_LABELS,
  WALL_HEIGHT,
  type DeskAnchorSet,
  type DeskPlacement,
  type PlantSpecies,
} from "./constants.ts";
import type { StaticSignAtlas } from "./static-atlas.ts";

const paintPlant = palette(PLANT_COLORS);
const paintDeskProp = palette(DESK_PROP_COLORS);
const paintLounge = palette(LOUNGE_COLORS);
const paintKitchen = palette(KITCHEN_COLORS);

const CHAIR_STEM_GEO = new THREE.CylinderGeometry(0.04, 0.04, 0.42, 8);
const CHAIR_CASTER_GEO = new THREE.BoxGeometry(0.05, 0.04, 0.32);
const DESK_LEG_GEO = new THREE.CylinderGeometry(
  0.035,
  0.035,
  DESK_SIZE.height - 0.08,
  8
);
const DESK_MODESTY_GEO = new THREE.BoxGeometry(DESK_SIZE.width - 0.3, 0.32, 0.03);
const SIGN_Y = 2.85;
const SIGN_TILT = Math.PI / 4;
const SIGN_FACE_H = 0.56;
const SIGN_RIDGE_Y = SIGN_Y + (SIGN_FACE_H / 2) * Math.sin(SIGN_TILT);
const SIGN_CORD_H = WALL_HEIGHT - SIGN_RIDGE_Y;
const SIGN_CORD_GEO = new THREE.CylinderGeometry(0.006, 0.006, SIGN_CORD_H, 5);
const MONITOR_NECK_GEO = new THREE.CylinderGeometry(0.028, 0.032, 0.24, 8);

const parentDummy = new THREE.Object3D();
const childDummy = new THREE.Object3D();
const worldMatScratch = new THREE.Matrix4();

function composeWorldMatrix(
  px: number,
  py: number,
  pz: number,
  pRotY: number,
  cx: number,
  cy: number,
  cz: number,
  cRotY = 0,
  cRotX = 0
): THREE.Matrix4 {
  parentDummy.position.set(px, py, pz);
  parentDummy.rotation.set(0, pRotY, 0);
  parentDummy.updateMatrix();
  childDummy.position.set(cx, cy, cz);
  childDummy.rotation.order = "YXZ";
  childDummy.rotation.set(cRotX, cRotY, 0);
  childDummy.updateMatrix();
  return worldMatScratch.multiplyMatrices(parentDummy.matrix, childDummy.matrix);
}

function plant(species: PlantSpecies, scale = 1): THREE.Group {
  const g = new THREE.Group();
  g.add(piece("plants", species, paintPlant));
  g.scale.setScalar(scale);
  return g;
}

function deskMug(color: string): THREE.Object3D {
  const body = toon(color);
  return piece("desk_props", "mug", (name) =>
    name === "Mug" ? body : paintDeskProp(name)
  );
}

function deskBooks(i: number): THREE.Object3D {
  return piece(
    "desk_props",
    DESK_BOOKS[i % DESK_BOOKS.length]!,
    paintDeskProp
  );
}

function upholstered(part: "pillow" | "pouf", color: string): THREE.Object3D {
  const cloth = toon(color);
  return piece("lounge", part, (name) =>
    name === "Cloth" ? cloth : paintLounge(name)
  );
}

function loungeCouch(): THREE.Group {
  const g = new THREE.Group();
  g.add(piece("lounge", "sofa", paintLounge));
  for (const [x, color] of [
    [0.6, "#ffd166"],
    [-0.6, "#ef476f"],
  ] as const) {
    const pillow = upholstered("pillow", color);
    pillow.position.set(x, 0.46, -0.08);
    pillow.rotation.x = -0.15;
    g.add(pillow);
  }
  return g;
}

function pouf(color: string): THREE.Object3D {
  return upholstered("pouf", color);
}

function coffeeTable(): THREE.Object3D {
  return piece("lounge", "coffee_table", paintLounge);
}

function pendant(cord = 0.48): THREE.Group {
  const lamp = new THREE.Group();
  const c = cord / 0.8;
  lamp.add(
    mesh(
      new THREE.CylinderGeometry(0.01, 0.01, c, 4),
      toon(PALETTE.ink),
      0,
      c / 2,
      0,
      false
    )
  );
  lamp.add(
    mesh(
      new THREE.ConeGeometry(0.5, 0.45, 16, 1, true),
      toon("#ffd166"),
      0,
      0,
      0,
      false
    )
  );
  lamp.add(
    mesh(
      new THREE.SphereGeometry(0.16, 10, 8),
      toon("#fff7d6", { emissive: "#ffe08a", outline: false }),
      0,
      -0.15,
      0,
      false
    )
  );
  lamp.scale.setScalar(0.8);
  return lamp;
}

export function chair(color: string): THREE.Group {
  const g = new THREE.Group();
  const mat = toon(color);
  const legMat = toon(PALETTE.deskLeg);
  g.add(mesh(roundedBox(0.62, 0.1, 0.58, 0.12), mat, 0, 0.5, 0));
  const back = mesh(roundedBox(0.62, 0.1, 0.6, 0.12), mat, 0, 0.86, 0.27);
  back.rotation.x = Math.PI / 2 - 0.12;
  g.add(back);
  g.add(mesh(CHAIR_STEM_GEO, legMat, 0, 0.26, 0));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const leg = mesh(
      CHAIR_CASTER_GEO,
      legMat,
      Math.sin(a) * 0.15,
      0.05,
      Math.cos(a) * 0.15
    );
    leg.rotation.y = a;
    g.add(leg);
  }
  return g;
}

function buildDeskFrame(trimMat: THREE.MeshToonMaterial): THREE.Group {
  const g = new THREE.Group();
  const { width, depth, height } = DESK_SIZE;
  g.add(
    mesh(
      roundedBox(width - 0.06, 0.08, depth - 0.04, 0.08),
      toon(PALETTE.desk),
      0,
      height - 0.04,
      0
    )
  );
  const legMat = toon("#8d99ae");
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(
        mesh(
          DESK_LEG_GEO,
          legMat,
          sx * (width / 2 - 0.14),
          (height - 0.08) / 2,
          sz * (depth / 2 - 0.12)
        )
      );
    }
  }
  g.add(
    mesh(
      DESK_MODESTY_GEO,
      trimMat,
      0,
      height - 0.26,
      -depth / 2 + 0.06
    )
  );
  return g;
}

function paintHangingSign(
  ctx: CanvasRenderingContext2D,
  title: string,
  subtitle: string,
  bgColor: string
): void {
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, 768, 256);
  ctx.fillStyle = "#2b2d42";
  ctx.strokeStyle = "#fffaf3";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.roundRect(18, 18, 732, 220, 28);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "900 72px Nunito, ui-rounded, system-ui, sans-serif";
  ctx.fillText(title, 384, 102);
  ctx.font = "800 40px Nunito, ui-rounded, system-ui, sans-serif";
  ctx.fillStyle = "#fffaf3";
  ctx.fillText(subtitle, 384, 178);
}

function addHangingSign(
  role: RoleConfig,
  def: DeskPlacement,
  staticRoot: THREE.Group,
  atlas: StaticSignAtlas
): void {
  const signW = 1.82;
  const signH = SIGN_FACE_H;
  const signY = SIGN_Y;
  // Center each sign over its own desk/seat zone so back-to-back desks never overlap.
  const z = 0.24;
  const halfDepth = (signH / 2) * Math.cos(SIGN_TILT);
  const faceOffset = 0.022;
  const normalY = Math.sin(SIGN_TILT);
  const normalZ = Math.cos(SIGN_TILT);

  const staticSign = new THREE.Group();
  staticSign.position.set(def.x, 0, def.z);
  staticSign.rotation.y = def.rotY;

  const cordMat = toon("#64748b", { outline: false });
  const boardMat = toon(role.tint);
  const boardGeo = roundedBox(signW, 0.036, signH, 0.06);

  // Double-sided 45-degree pitched canopy sign: clearly legible from straight above AND front/back.
  const frontBoard = mesh(boardGeo, boardMat, 0, signY, z + halfDepth, false);
  frontBoard.rotation.x = SIGN_TILT;
  staticSign.add(frontBoard);

  const backBoard = mesh(boardGeo, boardMat, 0, signY, z - halfDepth, false);
  backBoard.rotation.x = -SIGN_TILT;
  staticSign.add(backBoard);

  for (const sx of [-1, 1]) {
    staticSign.add(
      mesh(
        SIGN_CORD_GEO,
        cordMat,
        sx * 0.62,
        (WALL_HEIGHT + SIGN_RIDGE_Y) / 2,
        z,
        false
      )
    );
  }
  staticRoot.add(staticSign);

  const rect = atlas.draw(384, 128, (ctx, w, h) => {
    ctx.save();
    ctx.scale(w / 768, h / 256);
    paintHangingSign(
      ctx,
      role.id.toUpperCase(),
      role.title.split("/")[0]!.trim(),
      role.tint
    );
    ctx.restore();
  });

  const faceW = signW - 0.06;
  const faceH = signH - 0.06;
  // +Z face tilted 45 deg upward (normal points +Y and +Z)
  atlas.addPlane(
    rect,
    faceW,
    faceH,
    composeWorldMatrix(
      def.x,
      0,
      def.z,
      def.rotY,
      0,
      signY + normalY * faceOffset,
      z + halfDepth + normalZ * faceOffset,
      0,
      -SIGN_TILT
    )
  );
  // -Z face tilted 45 deg upward (normal points +Y and -Z)
  atlas.addPlane(
    rect,
    faceW,
    faceH,
    composeWorldMatrix(
      def.x,
      0,
      def.z,
      def.rotY,
      0,
      signY + normalY * faceOffset,
      z - halfDepth - normalZ * faceOffset,
      Math.PI,
      -SIGN_TILT
    )
  );
}

function addWorkstationMonitor(
  accentHex: string,
  label: string,
  deskX: number,
  deskZ: number,
  deskRotY: number,
  staticRoot: THREE.Group,
  atlas: StaticSignAtlas
): void {
  const staticDesk = new THREE.Group();
  staticDesk.position.set(deskX, DESK_SIZE.height, deskZ);
  staticDesk.rotation.y = deskRotY;

  const darkMat = toon("#2b2d42");
  const silverMat = toon("#adb5bd");

  staticDesk.add(
    mesh(roundedBox(0.34, 0.02, 0.22, 0.04), silverMat, 0, 0.01, -0.18)
  );
  staticDesk.add(mesh(MONITOR_NECK_GEO, silverMat, 0, 0.13, -0.21));

  const bezel = mesh(
    roundedBox(0.96, 0.04, 0.5, 0.04),
    darkMat,
    0,
    0.36,
    -0.16
  );
  bezel.rotation.x = Math.PI / 2;
  staticDesk.add(bezel);

  staticDesk.add(
    mesh(roundedBox(0.46, 0.02, 0.16, 0.02), darkMat, -0.06, 0.012, 0.12)
  );
  staticDesk.add(
    mesh(
      roundedBox(0.42, 0.012, 0.12, 0.01),
      toon(accentHex),
      -0.06,
      0.022,
      0.12,
      false
    )
  );
  staticDesk.add(
    mesh(
      roundedBox(0.22, 0.008, 0.2, 0.02),
      toon("#3d405b"),
      0.32,
      0.006,
      0.12,
      false
    )
  );
  staticDesk.add(
    mesh(roundedBox(0.07, 0.024, 0.11, 0.02), silverMat, 0.32, 0.018, 0.12)
  );
  staticRoot.add(staticDesk);

  const rect = atlas.draw(384, 192, (ctx, w, h) => {
    ctx.save();
    ctx.scale(w / 512, h / 256);
    ctx.fillStyle = "#16192b";
    ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = accentHex;
    ctx.fillRect(0, 0, 512, 34);
    ctx.fillStyle = "#16192b";
    ctx.font = "900 20px ui-monospace, Menlo, Consolas, monospace";
    ctx.fillText(`SUB-AGENT WORKSTATION // ${label}`, 16, 24);
    ctx.fillStyle = "#06d6a0";
    ctx.font = "700 18px ui-monospace, Menlo, Consolas, monospace";
    ctx.fillText("$ task-runner --watch --worktree", 20, 70);
    ctx.fillStyle = "#94a3b8";
    ctx.fillText("Ready to spawn role sub-agent from Task Table", 20, 104);
    ctx.fillStyle = "#ffd166";
    ctx.fillRect(20, 132, 210, 14);
    ctx.fillStyle = "#5bc0eb";
    ctx.fillRect(20, 160, 320, 14);
    ctx.fillStyle = "#ff8a5b";
    ctx.fillRect(20, 188, 160, 14);
    ctx.restore();
  });

  atlas.addPlane(
    rect,
    0.88,
    0.42,
    composeWorldMatrix(
      deskX,
      DESK_SIZE.height,
      deskZ,
      deskRotY,
      0,
      0.36,
      -0.138,
      0
    )
  );
}

export function buildRoleWorkstations(
  roles: RoleConfig[],
  root: THREE.Group,
  staticRoot: THREE.Group,
  atlas: StaticSignAtlas,
  trimMat: THREE.MeshToonMaterial
): Map<AgentRoleId, DeskAnchorSet> {
  const roleDesks = new Map<AgentRoleId, DeskAnchorSet>();
  const roleById = new Map(roles.map((r) => [r.id, r]));

  Object.entries(ROLE_DESK_PLACEMENTS).forEach(([roleIdStr, def], index) => {
    const roleId = roleIdStr as AgentRoleId;
    const role = roleById.get(roleId);

    const staticGroup = new THREE.Group();
    staticGroup.position.set(def.x, 0, def.z);
    staticGroup.rotation.y = def.rotY;
    staticGroup.add(buildDeskFrame(trimMat));

    const { width, height } = DESK_SIZE;
    const deco = index % 3;
    if (deco === 0) {
      const mug = deskMug(role?.tint ?? def.chairColor);
      mug.position.set(width / 2 - 0.25, height, -0.2);
      staticGroup.add(mug);
    } else if (deco === 1) {
      const p = plant("succulent");
      p.position.set(-width / 2 + 0.25, height, -0.25);
      staticGroup.add(p);
    } else {
      const books = deskBooks(Math.floor(index / 3));
      books.position.set(width / 2 - 0.26, height, -0.3);
      staticGroup.add(books);
    }

    const ch = chair(role?.tint ?? def.chairColor);
    ch.position.set(0, 0, 0.9);
    staticGroup.add(ch);
    staticRoot.add(staticGroup);

    const anchorGroup = new THREE.Group();
    anchorGroup.position.set(def.x, 0, def.z);
    anchorGroup.rotation.y = def.rotY;

    const laptopAnchor = new THREE.Object3D();
    laptopAnchor.position.set(0, height, -0.06);
    laptopAnchor.scale.setScalar(1.3);
    anchorGroup.add(laptopAnchor);

    const seatAnchor = new THREE.Object3D();
    seatAnchor.position.set(0, 0.4, 0.9);
    seatAnchor.rotation.y = Math.PI;
    seatAnchor.scale.setScalar(0.86);
    anchorGroup.add(seatAnchor);
    root.add(anchorGroup);

    if (role) {
      addHangingSign(role, def, staticRoot, atlas);
    }

    const [mx, mz, , workerRotY] = MEETING_OFFSETS[roleId];
    const meetingSeatAnchor = new THREE.Object3D();
    meetingSeatAnchor.position.set(mx, 0.4, mz);
    meetingSeatAnchor.rotation.y = workerRotY;
    meetingSeatAnchor.scale.setScalar(0.86);
    root.add(meetingSeatAnchor);

    roleDesks.set(roleId, {
      def,
      group: anchorGroup,
      laptopAnchor,
      seatAnchor,
      meetingSeatAnchor,
    });
  });

  return roleDesks;
}

export function buildSubAgentWorkstations(
  staticRoot: THREE.Group,
  atlas: StaticSignAtlas,
  trimMat: THREE.MeshToonMaterial
): void {
  const { height } = DESK_SIZE;

  let extraIdx = 0;
  for (const cx of [-10.5, -1.5]) {
    for (const [z, rotY] of [
      [3.45, Math.PI],
      [4.55, 0],
    ] as const) {
      for (const dx of [-DESK_SIZE.width / 2, DESK_SIZE.width / 2]) {
        const x = cx + dx;
        const g = new THREE.Group();
        g.position.set(x, 0, z);
        g.rotation.y = rotY;
        g.add(buildDeskFrame(trimMat));

        const accentColor = PALETTE.chairs[extraIdx % PALETTE.chairs.length]!;
        const ch = chair(accentColor);
        ch.position.set(0, 0, 0.9);
        g.add(ch);

        if (extraIdx % 2 === 0) {
          const books = deskBooks(extraIdx);
          books.position.set(0.72, height, -0.24);
          g.add(books);
          const mug = deskMug(accentColor);
          mug.position.set(-0.72, height, -0.18);
          g.add(mug);
        } else {
          const p = plant("succulent");
          p.position.set(-0.72, height, -0.24);
          g.add(p);
          const mug = deskMug(accentColor);
          mug.position.set(0.72, height, -0.18);
          g.add(mug);
        }
        staticRoot.add(g);

        addWorkstationMonitor(
          accentColor,
          SUB_STATION_LABELS[extraIdx % SUB_STATION_LABELS.length]!,
          x,
          z,
          rotY,
          staticRoot,
          atlas
        );
        extraIdx++;
      }
    }
  }
}

export function buildLoungeAndKitchen(
  staticRoot: THREE.Group,
  atlas: StaticSignAtlas
): void {
  const kitchenLoaded = getPreloadedModel("kitchen");
  if (kitchenLoaded) {
    paintModel(kitchenLoaded.scene, (name) =>
      name === "Glow"
        ? toon("#ef476f", { emissive: "#ef476f", outline: false })
        : paintKitchen(name)
    );
    kitchenLoaded.scene.position.set(-14.5, 0, 11.8);
    kitchenLoaded.scene.rotation.y = Math.PI;
    staticRoot.add(kitchenLoaded.scene);
  }

  const couch = loungeCouch();
  couch.position.set(10.5, 0, 0);
  couch.rotation.y = Math.PI / 2;
  staticRoot.add(couch);

  const cTable = coffeeTable();
  cTable.position.set(13, 0, 0);
  staticRoot.add(cTable);

  for (const [color, px, pz] of [
    ["#06d6a0", 12.5, 3.5],
    ["#ffd166", 14.5, -3.4],
  ] as const) {
    const p = pouf(color);
    p.position.set(px, 0, pz);
    staticRoot.add(p);
  }

  const tvBezelGroup = new THREE.Group();
  const bezel = mesh(
    roundedBox(3.5, 0.14, 2.1, 0.12),
    toon(PALETTE.ink),
    0,
    0,
    0
  );
  bezel.rotation.x = Math.PI / 2;
  tvBezelGroup.add(bezel);
  tvBezelGroup.position.set(FLOOR.maxX - 0.12, 2.2, 0);
  tvBezelGroup.rotation.y = -Math.PI / 2;
  staticRoot.add(tvBezelGroup);

  const tvRect = atlas.draw(64, 64, (ctx, w, h) => {
    ctx.fillStyle = "#1b1d2e";
    ctx.fillRect(0, 0, w, h);
  });
  atlas.addPlane(
    tvRect,
    3.2,
    1.8,
    composeWorldMatrix(FLOOR.maxX - 0.12, 2.2, 0, -Math.PI / 2, 0, 0, 0.08, 0)
  );

  PLANT_SPOTS.forEach(([px, pz, scale], idx) => {
    const sp = FLOOR_PLANTS[idx % FLOOR_PLANTS.length]!;
    const p = plant(sp, scale);
    p.position.set(px, 0, pz);
    staticRoot.add(p);
  });

  for (const [lx, lz] of PENDANT_SPOTS) {
    const lamp = pendant(WALL_HEIGHT - 4.05);
    lamp.position.set(lx, 4.05, lz);
    staticRoot.add(lamp);
  }
}
