import * as THREE from "three";
import {
  GLTFLoader,
  type GLTF,
} from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { toon } from "./toon.ts";

const MODEL_URLS = {
  desk_props: "/models/desk_props.glb",
  kitchen: "/models/kitchen.glb",
  lounge: "/models/lounge.glb",
  plants: "/models/plants.glb",
  "dog-corgi": "/models/dog-corgi.glb",
} as const;

export type ModelName = keyof typeof MODEL_URLS;

export interface LoadedModel {
  scene: THREE.Object3D;
  clips: THREE.AnimationClip[];
}

const loading = new Map<ModelName, Promise<GLTF>>();
const loaded = new Map<ModelName, GLTF>();
const gltfLoader = new GLTFLoader();

export interface ModelsProgress {
  asked: number;
  done: number;
}

const progress: ModelsProgress = { asked: 0, done: 0 };
const watchers = new Set<(p: ModelsProgress) => void>();

export function onModelsProgress(
  fn: (p: ModelsProgress) => void
): () => void {
  watchers.add(fn);
  fn({ ...progress });
  return () => {
    watchers.delete(fn);
  };
}

function notifyProgress() {
  for (const fn of watchers) fn({ ...progress });
}

function fetchModel(name: ModelName): Promise<GLTF> {
  let p = loading.get(name);
  if (!p) {
    p = gltfLoader
      .loadAsync(MODEL_URLS[name])
      .then((gltf) => {
        loaded.set(name, gltf);
        return gltf;
      })
      .catch((err: unknown) => {
        loading.delete(name);
        throw err;
      });
    loading.set(name, p);
    progress.asked++;
    notifyProgress();
    const markDone = () => {
      progress.done++;
      notifyProgress();
    };
    void p.then(markDone, markDone);
  }
  return p;
}

const cloneModel = (gltf: GLTF): LoadedModel => ({
  scene: SkeletonUtils.clone(gltf.scene),
  clips: gltf.animations,
});

export async function preloadOfficeModels(): Promise<string[]> {
  const names = Object.keys(MODEL_URLS) as ModelName[];
  const errors: string[] = [];
  await Promise.all(
    names.map((name) =>
      fetchModel(name).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`${name}.glb failed to load`, err);
        errors.push(`${name}.glb: ${msg}`);
      })
    )
  );
  return errors;
}

export function getPreloadedModel(name: ModelName): LoadedModel | null {
  const gltf = loaded.get(name);
  return gltf ? cloneModel(gltf) : null;
}

export function paintModel(
  root: THREE.Object3D,
  paint: (name: string) => THREE.Material,
  castShadow = true
) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const matName = (m.material as THREE.Material)?.name ?? "";
    m.material = paint(matName);
    m.castShadow = castShadow;
    m.receiveShadow = true;
  });
}

export function palette(
  colors: Record<string, string>
): (name: string) => THREE.Material {
  return (name) => toon(colors[name] ?? "#8d99ae");
}

export function piece(
  name: ModelName,
  part: string,
  paint: (name: string) => THREE.Material,
  castShadow = true
): THREE.Object3D {
  const found = loaded.get(name)?.scene.getObjectByName(part);
  if (!found) return new THREE.Group();
  const copy = found.clone();
  paintModel(copy, paint, castShadow);
  return copy;
}
