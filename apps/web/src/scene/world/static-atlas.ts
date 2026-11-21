import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  measureTextPill,
  noOutline,
  paintTextPill,
  TEXT_SCALE,
  type TextOpts,
} from "../toon.ts";
import type { Disposable } from "./constants.ts";

export interface AtlasRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class StaticSignAtlas {
  readonly canvas = document.createElement("canvas");
  private readonly ctx: CanvasRenderingContext2D;
  private readonly geos: THREE.BufferGeometry[] = [];
  private readonly shelves: Array<{ y: number; h: number; x: number }> = [];
  private nextY = 4;

  constructor(
    readonly width = 2048,
    readonly height = 1024
  ) {
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext("2d")!;
  }

  allocRect(w: number, h: number): AtlasRect {
    const pad = 4;
    let bestShelf: { y: number; h: number; x: number } | null = null;
    for (const s of this.shelves) {
      if (h <= s.h && s.x + w + pad <= this.width) {
        if (!bestShelf || s.h < bestShelf.h) {
          bestShelf = s;
        }
      }
    }
    if (bestShelf) {
      const rect = { x: bestShelf.x, y: bestShelf.y, w, h };
      bestShelf.x += w + pad;
      return rect;
    }

    if (this.nextY + h + pad > this.height) {
      throw new Error(`StaticSignAtlas overflow (${w}x${h} at y=${this.nextY})`);
    }
    const shelf = { y: this.nextY, h, x: pad + w + pad };
    this.shelves.push(shelf);
    const rect = { x: pad, y: this.nextY, w, h };
    this.nextY += h + pad;
    return rect;
  }

  draw(
    pxW: number,
    pxH: number,
    painter: (ctx: CanvasRenderingContext2D, w: number, h: number) => void
  ): AtlasRect {
    const rect = this.allocRect(pxW, pxH);
    this.ctx.save();
    this.ctx.translate(rect.x, rect.y);
    painter(this.ctx, rect.w, rect.h);
    this.ctx.restore();
    return rect;
  }

  addPlane(
    rect: AtlasRect,
    worldW: number,
    worldH: number,
    matrix: THREE.Matrix4
  ): void {
    const geo = new THREE.PlaneGeometry(worldW, worldH);
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    const u0 = (rect.x + 0.5) / this.width;
    const u1 = (rect.x + rect.w - 0.5) / this.width;
    const v1 = 1 - (rect.y + 0.5) / this.height;
    const v0 = 1 - (rect.y + rect.h - 0.5) / this.height;
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i);
      const v = uv.getY(i);
      uv.setXY(i, u0 + u * (u1 - u0), v0 + v * (v1 - v0));
    }
    geo.applyMatrix4(matrix);
    const nonIndexed = geo.index ? geo.toNonIndexed() : geo;
    if (nonIndexed !== geo) geo.dispose();
    this.geos.push(nonIndexed);
  }

  buildMesh(disposables: Set<Disposable>): THREE.Mesh | null {
    if (this.geos.length === 0) return null;
    const merged =
      this.geos.length === 1 ? this.geos[0]! : mergeGeometries(this.geos);
    if (this.geos.length > 1) {
      for (const g of this.geos) g.dispose();
    }
    this.geos.length = 0;
    if (!merged) return null;

    const tex = new THREE.CanvasTexture(this.canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      alphaTest: 0.25,
      toneMapped: false,
    });
    mat.userData.outlineParameters = { visible: false };
    disposables.add(tex);
    disposables.add(mat);
    disposables.add(merged);

    const m = new THREE.Mesh(merged, mat);
    m.castShadow = false;
    m.receiveShadow = false;
    return noOutline(m);
  }

  get context(): CanvasRenderingContext2D {
    return this.ctx;
  }
}

const labelDummy = new THREE.Object3D();

export function addTextLabelToAtlas(
  atlas: StaticSignAtlas,
  text: string,
  opts: TextOpts,
  pos: [number, number, number],
  rotY = 0,
  scale = 1
): void {
  const { w, h, size, font } = measureTextPill(atlas.context, text, opts);
  const rect = atlas.draw(w, h, (ctx) => {
    paintTextPill(ctx, w, h, size, font, text, opts);
  });
  labelDummy.position.set(pos[0], pos[1], pos[2]);
  labelDummy.rotation.set(0, rotY, 0);
  labelDummy.scale.set(1, 1, 1);
  labelDummy.updateMatrix();
  atlas.addPlane(
    rect,
    w * TEXT_SCALE * scale,
    h * TEXT_SCALE * scale,
    labelDummy.matrix
  );
}
