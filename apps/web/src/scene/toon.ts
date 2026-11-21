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
const outlinedToonMaterials = new WeakSet<THREE.MeshToonMaterial>();
const roundedBoxCache = new Map<string, THREE.BufferGeometry>();

export interface ToonOpts {
  emissive?: THREE.ColorRepresentation;
  transparent?: boolean;
  opacity?: number;
  outline?: boolean;
}

export function toon(
  color: THREE.ColorRepresentation,
  opts: ToonOpts = {}
): THREE.MeshToonMaterial {
  const outline = opts.outline !== false;
  const emissiveKey =
    opts.emissive !== undefined ? new THREE.Color(opts.emissive).getHexString() : "";
  const key = `${new THREE.Color(color).getHexString()}|${emissiveKey}|${
    opts.transparent ? 1 : 0
  }|${opts.opacity ?? 1}|${outline ? 1 : 0}`;
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
  if (!outline) {
    m.userData.outlineParameters = { visible: false };
  } else {
    outlinedToonMaterials.add(m);
  }
  materialCache.set(key, m);
  return m;
}

export function toonUnique(
  color: THREE.ColorRepresentation,
  opts: { outline?: boolean } = {}
): THREE.MeshToonMaterial {
  const m = new THREE.MeshToonMaterial({ color, gradientMap: gradientMap() });
  if (opts.outline === false) {
    m.userData.outlineParameters = { visible: false };
  }
  return m;
}

function getNoOutlineToonVariant(
  mat: THREE.MeshToonMaterial
): THREE.MeshToonMaterial {
  return toon(mat.color, {
    emissive: mat.emissive.getHex() !== 0 ? mat.emissive : undefined,
    transparent: mat.transparent,
    opacity: mat.opacity,
    outline: false,
  });
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

// Write outlineParameters onto Material.userData (read by ToonOutlineEffect) without mutating shared outline:true materials.
export function noOutline<T extends THREE.Object3D>(root: T): T {
  root.traverse((o) => {
    o.userData.outlineParameters = { visible: false };
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.material) return;
    if (Array.isArray(m.material)) {
      m.material = m.material.map((mat) => {
        if (
          mat instanceof THREE.MeshToonMaterial &&
          outlinedToonMaterials.has(mat)
        ) {
          return getNoOutlineToonVariant(mat);
        }
        mat.userData.outlineParameters = {
          ...(mat.userData.outlineParameters as
            | Record<string, unknown>
            | undefined),
          visible: false,
        };
        return mat;
      });
    } else {
      const mat = m.material;
      if (
        mat instanceof THREE.MeshToonMaterial &&
        outlinedToonMaterials.has(mat)
      ) {
        m.material = getNoOutlineToonVariant(mat);
      } else {
        mat.userData.outlineParameters = {
          ...(mat.userData.outlineParameters as
            | Record<string, unknown>
            | undefined),
          visible: false,
        };
      }
    }
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

export const TEXT_SCALE = 0.0055;
const INK = "#2b2d42";
const FONT = "Nunito, ui-rounded, 'SF Pro Rounded', system-ui, sans-serif";

export function measureTextPill(
  ctx: CanvasRenderingContext2D,
  text: string,
  opts: TextOpts
): { w: number; h: number; size: number; font: string } {
  const size = opts.size ?? 48;
  const font = `800 ${size}px ${FONT}`;
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + size;
  const h = Math.ceil(size * 1.6);
  return { w, h, size, font };
}

export function paintTextPill(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  size: number,
  font: string,
  text: string,
  opts: TextOpts
): void {
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
}

function textTexture(text: string, opts: TextOpts) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const { w, h, size, font } = measureTextPill(ctx, text, opts);
  canvas.width = w;
  canvas.height = h;
  paintTextPill(ctx, w, h, size, font, text, opts);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { tex, w, h };
}

export function paintTextCanvas(
  canvas: HTMLCanvasElement,
  text: string,
  opts: TextOpts = {}
): { w: number; h: number; resized: boolean } {
  const ctx = canvas.getContext("2d")!;
  const { w, h, size, font } = measureTextPill(ctx, text, opts);
  const resized = canvas.width !== w || canvas.height !== h;
  if (resized) {
    canvas.width = w;
    canvas.height = h;
  } else {
    ctx.clearRect(0, 0, w, h);
  }
  paintTextPill(ctx, w, h, size, font, text, opts);
  return { w, h, resized };
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

export interface CardOpts {
  chip?: { text: string; bg: string; color: string };
  title: string;
  body?: string;
  bg: string;
  border?: string;
  maxWidth?: number;
}

export const CARD_RES = 2;

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

export function paintCardCanvas(
  canvas: HTMLCanvasElement,
  o: CardOpts
): { w: number; h: number; resized: boolean } {
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

  const ctx = canvas.getContext("2d")!;
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

  const resized = canvas.width !== w || canvas.height !== h;
  if (resized) {
    canvas.width = w;
    canvas.height = h;
  } else {
    ctx.clearRect(0, 0, w, h);
  }

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

  return { w, h, resized };
}

export function disposeSprite(s: THREE.Sprite | null) {
  if (!s) return;
  s.material.map?.dispose();
  s.material.dispose();
}

export function mergeColoredParts(
  parts: Array<{
    geo: THREE.BufferGeometry;
    color?: THREE.ColorRepresentation;
    matrix?: THREE.Matrix4;
  }>
): THREE.BufferGeometry {
  const prepared: THREE.BufferGeometry[] = [];
  const tmpColor = new THREE.Color();
  for (const p of parts) {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    for (const k of Object.keys(g.attributes)) {
      if (k !== "position" && k !== "normal") g.deleteAttribute(k);
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    if (p.matrix) g.applyMatrix4(p.matrix);
    if (p.color !== undefined) {
      tmpColor.set(p.color);
      const count = g.attributes.position!.count;
      const arr = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        arr[i * 3] = tmpColor.r;
        arr[i * 3 + 1] = tmpColor.g;
        arr[i * 3 + 2] = tmpColor.b;
      }
      g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
    }
    prepared.push(g);
  }
  const merged =
    prepared.length === 1 ? prepared[0]! : mergeGeometries(prepared);
  if (prepared.length > 1) {
    for (const g of prepared) g.dispose();
  }
  if (!merged) throw new Error("Failed to merge actor geometries");
  return merged;
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

// Bake static MeshToonMaterial colors into vertex colors while keeping dynamic Day/Night and emissive materials separate.
export function mergeStaticWorld(
  root: THREE.Object3D,
  keepSeparate: ReadonlySet<THREE.Material>,
  disposables: Set<{ dispose: () => void }>
): THREE.Group {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const tmpMat = new THREE.Matrix4();

  const bakedBuckets: Record<
    "staticShadow" | "staticOutlinedNoShadow" | "staticNoOutline",
    THREE.BufferGeometry[]
  > = {
    staticShadow: [],
    staticOutlinedNoShadow: [],
    staticNoOutline: [],
  };

  const separateBuckets = new Map<
    string,
    {
      mat: THREE.Material;
      cast: boolean;
      receive: boolean;
      noOut: boolean;
      geos: THREE.BufferGeometry[];
    }
  >();

  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || Array.isArray(m.material)) return;
    const mat = m.material as THREE.MeshToonMaterial;

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

    const noOut =
      (m.userData?.outlineParameters as { visible?: boolean } | undefined)
        ?.visible === false ||
      (mat.userData?.outlineParameters as { visible?: boolean } | undefined)
        ?.visible === false;
    const isEmissiveOrSpecial =
      keepSeparate.has(mat) ||
      !(mat instanceof THREE.MeshToonMaterial) ||
      mat.emissive.getHex() !== 0 ||
      mat.transparent ||
      Boolean(mat.map);

    if (isEmissiveOrSpecial) {
      const key = `${mat.uuid}|${m.castShadow ? 1 : 0}|${m.receiveShadow ? 1 : 0}|${noOut ? 1 : 0}`;
      let entry = separateBuckets.get(key);
      if (!entry) {
        entry = {
          mat,
          cast: m.castShadow,
          receive: m.receiveShadow,
          noOut,
          geos: [],
        };
        separateBuckets.set(key, entry);
      }
      entry.geos.push(geo);
      return;
    }

    const vCount = geo.attributes.position!.count;
    const colors = new Float32Array(vCount * 3);
    const { r, g, b } = mat.color;
    for (let i = 0; i < colors.length; i += 3) {
      colors[i] = r;
      colors[i + 1] = g;
      colors[i + 2] = b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    if (noOut) {
      bakedBuckets.staticNoOutline.push(geo);
    } else if (m.castShadow) {
      bakedBuckets.staticShadow.push(geo);
    } else {
      bakedBuckets.staticOutlinedNoShadow.push(geo);
    }
  });

  const out = new THREE.Group();

  const emitBaked = (
    geos: THREE.BufferGeometry[],
    cast: boolean,
    outline: boolean
  ) => {
    if (geos.length === 0) return;
    const merged = geos.length === 1 ? geos[0]! : mergeGeometries(geos);
    if (geos.length > 1) {
      for (const g of geos) g.dispose();
    }
    if (!merged) return;
    const mat = new THREE.MeshToonMaterial({
      color: 0xffffff,
      gradientMap: gradientMap(),
      vertexColors: true,
    });
    if (!outline) {
      mat.userData.outlineParameters = { visible: false };
    }
    disposables.add(mat);
    disposables.add(merged);
    const mergedMesh = mesh(merged, mat, 0, 0, 0, cast);
    mergedMesh.receiveShadow = true;
    out.add(outline ? mergedMesh : noOutline(mergedMesh));
  };

  emitBaked(bakedBuckets.staticShadow, true, true);
  emitBaked(bakedBuckets.staticOutlinedNoShadow, false, true);
  emitBaked(bakedBuckets.staticNoOutline, false, false);

  for (const { mat, cast, receive, noOut, geos } of separateBuckets.values()) {
    const merged = geos.length === 1 ? geos[0]! : mergeGeometries(geos);
    if (geos.length > 1) {
      for (const g of geos) g.dispose();
    }
    if (!merged) continue;
    disposables.add(merged);
    const mergedMesh = mesh(merged, mat, 0, 0, 0, cast);
    mergedMesh.receiveShadow = receive;
    out.add(noOut ? noOutline(mergedMesh) : mergedMesh);
  }

  return out;
}
