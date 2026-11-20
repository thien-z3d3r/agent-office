import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

let sharedGradient: THREE.DataTexture | null = null;

// Three-step NearestFilter ramp produces flat cartoon light banding on MeshToonMaterial.
export function gradientMap(): THREE.DataTexture {
  if (sharedGradient) return sharedGradient;
  const data = new Uint8Array([
    90, 90, 90, 255,
    185, 185, 185, 255,
    255, 255, 255, 255,
  ]);
  sharedGradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  sharedGradient.minFilter = THREE.NearestFilter;
  sharedGradient.magFilter = THREE.NearestFilter;
  sharedGradient.needsUpdate = true;
  return sharedGradient;
}

const materialCache = new Map<string, THREE.MeshToonMaterial>();
const roundedBoxCache = new Map<string, THREE.BufferGeometry>();

export function toon(
  color: THREE.ColorRepresentation,
  opts: {
    emissive?: THREE.ColorRepresentation;
    transparent?: boolean;
    opacity?: number;
  } = {}
): THREE.MeshToonMaterial {
  const emissiveKey =
    opts.emissive !== undefined ? new THREE.Color(opts.emissive).getHexString() : "";
  const key = `${new THREE.Color(color).getHexString()}|${emissiveKey}|${
    opts.transparent ? 1 : 0
  }|${opts.opacity ?? 1}`;
  const hit = materialCache.get(key);
  if (hit) return hit;
  const m = new THREE.MeshToonMaterial({ color, gradientMap: gradientMap() });
  if (opts.emissive !== undefined) {
    m.emissive = new THREE.Color(opts.emissive);
  }
  if (opts.transparent || (opts.opacity ?? 1) < 1) {
    m.transparent = true;
    m.opacity = opts.opacity ?? 1;
  }
  materialCache.set(key, m);
  return m;
}

export function toonUnique(
  color: THREE.ColorRepresentation
): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({ color, gradientMap: gradientMap() });
}

export function disposeSharedToonCache(): void {
  for (const mat of materialCache.values()) {
    mat.dispose();
  }
  materialCache.clear();
  for (const geo of roundedBoxCache.values()) {
    geo.dispose();
  }
  roundedBoxCache.clear();
  if (sharedGradient) {
    sharedGradient.dispose();
    sharedGradient = null;
  }
}

export function mesh(
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  shadow = true
): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

export function noOutline<T extends THREE.Object3D>(root: T): T {
  root.traverse((o) => {
    o.userData.outlineParameters = { visible: false };
  });
  return root;
}

export function roundedBox(
  w: number,
  h: number,
  d: number,
  r = 0.06
): THREE.BufferGeometry {
  const key = `${w}|${h}|${d}|${r}`;
  const cached = roundedBoxCache.get(key);
  if (cached) return cached;

  const shape = new THREE.Shape();
  const x = -w / 2;
  const y = -d / 2;
  const rad = Math.min(r, w / 2, d / 2);
  shape.moveTo(x + rad, y);
  shape.lineTo(x + w - rad, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + rad);
  shape.lineTo(x + w, y + d - rad);
  shape.quadraticCurveTo(x + w, y + d, x + w - rad, y + d);
  shape.lineTo(x + rad, y + d);
  shape.quadraticCurveTo(x, y + d, x, y + d - rad);
  shape.lineTo(x, y + rad);
  shape.quadraticCurveTo(x, y, x + rad, y);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: h,
    bevelEnabled: false,
    curveSegments: 4,
  });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, -h / 2, 0);
  geo.computeVertexNormals();
  roundedBoxCache.set(key, geo);
  return geo;
}

export interface TextOpts {
  color?: string;
  bg?: string;
  size?: number;
  border?: string;
}

const TEXT_SCALE = 0.0055;
const INK = "#2b2d42";
const FONT = "Nunito, ui-rounded, 'SF Pro Rounded', system-ui, sans-serif";

function textTexture(text: string, opts: TextOpts) {
  const size = opts.size ?? 48;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const font = `800 ${size}px ${FONT}`;
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + size;
  const h = Math.ceil(size * 1.6);
  canvas.width = w;
  canvas.height = h;
  ctx.font = font;
  if (opts.bg) {
    ctx.fillStyle = opts.bg;
    const r = h / 2;
    ctx.beginPath();
    ctx.roundRect(3, 3, w - 6, h - 6, r - 3);
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = opts.border ?? INK;
    ctx.stroke();
  }
  ctx.fillStyle = opts.color ?? INK;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, w / 2, h / 2 + size * 0.05);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { tex, w, h };
}

export function textSprite(text: string, opts: TextOpts = {}): THREE.Sprite {
  const { tex, w, h } = textTexture(text, opts);
  const mat = new THREE.SpriteMaterial({
    map: tex,
    depthWrite: false,
    transparent: true,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(w * TEXT_SCALE, h * TEXT_SCALE, 1);
  sprite.renderOrder = 10;
  return sprite;
}

export function textPlane(
  text: string,
  opts: TextOpts = {}
): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  const { tex, w, h } = textTexture(text, opts);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    alphaTest: 0.05,
  });
  return noOutline(
    new THREE.Mesh(
      new THREE.PlaneGeometry(w * TEXT_SCALE, h * TEXT_SCALE),
      mat
    )
  );
}

export interface CardOpts {
  chip?: { text: string; bg: string; color: string };
  title: string;
  body?: string;
  bg: string;
  border?: string;
  maxWidth?: number;
}

const CARD_RES = 2;

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
  maxLines: number
): string[] {
  const fits = (s: string) => ctx.measureText(s).width <= maxW;
  const lines: string[] = [];
  let line = "";
  for (let word of text.split(/\s+/).filter(Boolean)) {
    while (!fits(word)) {
      let n = word.length - 1;
      while (n > 1 && !fits(word.slice(0, n))) n--;
      if (line) lines.push(line);
      lines.push(word.slice(0, n));
      line = "";
      word = word.slice(n);
    }
    const next = line ? `${line} ${word}` : word;
    if (fits(next)) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1] ?? "";
  while (last && !fits(`${last}...`)) last = last.slice(0, -1).trimEnd();
  kept[maxLines - 1] = `${last.replace(/[\s,.;:-]+$/, "")}...`;
  return kept;
}

export function cardSprite(o: CardOpts): THREE.Sprite {
  const R = CARD_RES;
  const maxW = (o.maxWidth ?? 380) * R;
  const pad = 16 * R;
  const lw = 5 * R;
  const tail = 14 * R;
  const chipFont = `800 ${18 * R}px ${FONT}`;
  const chipH = 28 * R;
  const titleFont = `800 ${28 * R}px ${FONT}`;
  const titleLH = 34 * R;
  const bodyFont = `700 ${22 * R}px ${FONT}`;
  const bodyLH = 28 * R;

  const ctx = document.createElement("canvas").getContext("2d")!;
  ctx.font = titleFont;
  const title = wrapText(ctx, o.title, maxW, 2);
  const titleW = Math.max(...title.map((l) => ctx.measureText(l).width), 60);
  ctx.font = bodyFont;
  const body = o.body ? wrapText(ctx, o.body, maxW, 3) : [];
  const bodyW = body.length
    ? Math.max(...body.map((l) => ctx.measureText(l).width))
    : 0;
  ctx.font = chipFont;
  const chipW = o.chip ? ctx.measureText(o.chip.text).width + 24 * R : 0;

  const w = Math.ceil(Math.max(titleW, bodyW, chipW + 2 * pad) + 2 * pad);
  const top = o.chip ? chipH / 2 : lw;
  const titleY = top + (o.chip ? chipH / 2 + 6 * R : pad);
  const bodyY = titleY + title.length * titleLH + 4 * R;
  const bottom = bodyY + body.length * bodyLH + pad * 0.7;
  const h = Math.ceil(bottom + tail + lw);

  const canvas = ctx.canvas;
  canvas.width = w;
  canvas.height = h;
  const x0 = lw / 2;
  const x1 = w - lw / 2;
  const cx = w / 2;
  const r = 18 * R;

  ctx.beginPath();
  ctx.moveTo(x0 + r, top);
  ctx.arcTo(x1, top, x1, bottom, r);
  ctx.arcTo(x1, bottom, x0, bottom, r);
  ctx.lineTo(cx + tail, bottom);
  ctx.lineTo(cx, bottom + tail);
  ctx.lineTo(cx - tail, bottom);
  ctx.arcTo(x0, bottom, x0, top, r);
  ctx.arcTo(x0, top, x1, top, r);
  ctx.closePath();
  ctx.fillStyle = o.bg;
  ctx.fill();
  ctx.lineWidth = lw;
  ctx.lineJoin = "round";
  ctx.strokeStyle = o.border ?? INK;
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (o.chip) {
    ctx.beginPath();
    ctx.roundRect(cx - chipW / 2, lw / 2, chipW, chipH, chipH / 2);
    ctx.fillStyle = o.chip.bg;
    ctx.fill();
    ctx.lineWidth = 4 * R;
    ctx.strokeStyle = o.border ?? INK;
    ctx.stroke();
    ctx.font = chipFont;
    ctx.fillStyle = o.chip.color;
    ctx.fillText(o.chip.text, cx, lw / 2 + chipH / 2 + R);
  }
  ctx.font = titleFont;
  ctx.fillStyle = INK;
  title.forEach((l, i) => ctx.fillText(l, cx, titleY + (i + 0.5) * titleLH));
  ctx.font = bodyFont;
  ctx.fillStyle = "#4a4d66";
  body.forEach((l, i) => ctx.fillText(l, cx, bodyY + (i + 0.5) * bodyLH));

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true })
  );
  sprite.scale.set((w / R) * TEXT_SCALE, (h / R) * TEXT_SCALE, 1);
  sprite.center.set(0.5, 0);
  sprite.renderOrder = 10;
  return sprite;
}

export function disposeSprite(s: THREE.Sprite | null) {
  if (!s) return;
  s.material.map?.dispose();
  s.material.dispose();
}

export function mergeByMaterial(root: THREE.Object3D): THREE.Group {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const tmpMat = new THREE.Matrix4();
  const byKey = new Map<
    string,
    {
      mat: THREE.Material;
      cast: boolean;
      receive: boolean;
      geos: THREE.BufferGeometry[];
    }
  >();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const geo = m.geometry.index
      ? m.geometry.toNonIndexed()
      : m.geometry.clone();
    for (const k of Object.keys(geo.attributes)) {
      if (k !== "position" && k !== "normal") geo.deleteAttribute(k);
    }
    if (!geo.attributes.normal) {
      geo.computeVertexNormals();
    }
    geo.applyMatrix4(tmpMat.multiplyMatrices(inv, m.matrixWorld));
    const mat = m.material as THREE.Material;
    const key = `${mat.uuid}|${m.castShadow ? 1 : 0}|${m.receiveShadow ? 1 : 0}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        mat,
        cast: m.castShadow,
        receive: m.receiveShadow,
        geos: [],
      });
    }
    byKey.get(key)!.geos.push(geo);
  });
  const out = new THREE.Group();
  for (const { mat, cast, receive, geos } of byKey.values()) {
    if (geos.length === 1) {
      const single = mesh(geos[0]!, mat, 0, 0, 0, cast);
      single.receiveShadow = receive;
      out.add(single);
      continue;
    }
    const merged = mergeGeometries(geos);
    if (merged) {
      const mergedMesh = mesh(merged, mat, 0, 0, 0, cast);
      mergedMesh.receiveShadow = receive;
      out.add(mergedMesh);
      for (const geo of geos) geo.dispose();
    } else {
      for (const geo of geos) {
        const fallback = mesh(geo, mat, 0, 0, 0, cast);
        fallback.receiveShadow = receive;
        out.add(fallback);
      }
    }
  }
  return out;
}
