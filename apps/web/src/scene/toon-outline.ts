import * as THREE from "three";

export interface ToonOutlineParameters {
  defaultThickness?: number;
  defaultColor?: [number, number, number];
  defaultAlpha?: number;
  defaultKeepAlive?: boolean;
}

interface OutlineCacheEntry {
  material: THREE.ShaderMaterial;
  used: boolean;
  keepAlive: boolean;
  count: number;
}

interface SwappedMeshRecord {
  object: THREE.Mesh;
  material: THREE.Material | THREE.Material[];
  onBeforeRender: THREE.Object3D["onBeforeRender"];
}

const OUTLINE_VERTEX_SHADER = /* glsl */ `
#include <common>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>

uniform float outlineThickness;

vec4 calculateOutline( vec4 pos, vec3 normal, vec4 skinned ) {
	float thickness = outlineThickness;
	const float ratio = 1.0;
	vec4 localTip = vec4( skinned.xyz + normal, 1.0 );
	#ifdef USE_INSTANCING
		localTip = instanceMatrix * localTip;
	#endif
	vec4 pos2 = projectionMatrix * modelViewMatrix * localTip;
	vec4 diff = pos - pos2;
	float len = length( diff );
	vec4 norm = len > 1e-6 ? diff / len : vec4( 0.0 );
	return pos + norm * thickness * pos.w * ratio;
}

void main() {
	#include <uv_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>

	vec3 outlineNormal = - objectNormal;
	gl_Position = calculateOutline( gl_Position, outlineNormal, vec4( transformed, 1.0 ) );

	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}
`;

const OUTLINE_FRAGMENT_SHADER = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>

uniform vec3 outlineColor;
uniform float outlineAlpha;

void main() {
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	gl_FragColor = vec4( outlineColor, outlineAlpha );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}
`;

export class ToonOutlineEffect {
  enabled = true;
  autoClear: boolean;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly defaultThickness: number;
  private readonly defaultColor: THREE.Color;
  private readonly defaultAlpha: number;
  private readonly defaultKeepAlive: boolean;
  private readonly cache = new Map<string, OutlineCacheEntry>();
  private readonly originalMaterials = new Map<string, THREE.Material>();
  private readonly removeThresholdCount = 60;

  constructor(
    renderer: THREE.WebGLRenderer,
    parameters: ToonOutlineParameters = {}
  ) {
    this.renderer = renderer;
    this.autoClear = renderer.autoClear;
    this.defaultThickness = parameters.defaultThickness ?? 0.003;
    this.defaultColor = new THREE.Color().fromArray(
      parameters.defaultColor ?? [0, 0, 0]
    );
    this.defaultAlpha = parameters.defaultAlpha ?? 1.0;
    this.defaultKeepAlive = parameters.defaultKeepAlive ?? false;
  }

  private createMaterial(): THREE.ShaderMaterial {
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        THREE.UniformsLib.displacementmap,
        {
          outlineThickness: { value: this.defaultThickness },
          outlineColor: { value: this.defaultColor.clone() },
          outlineAlpha: { value: this.defaultAlpha },
        },
      ]),
      vertexShader: OUTLINE_VERTEX_SHADER,
      fragmentShader: OUTLINE_FRAGMENT_SHADER,
      side: THREE.BackSide,
    });
    (mat as unknown as { type: string }).type = "OutlineEffect";
    return mat;
  }

  private shouldOutlineMaterial(mat: THREE.Material | undefined): mat is THREE.Material {
    if (!mat || !mat.visible) return false;
    if ((mat as THREE.MeshBasicMaterial).wireframe || !mat.depthTest) return false;
    const params = mat.userData?.outlineParameters as
      | { visible?: boolean }
      | undefined;
    if (params?.visible === false) return false;
    return true;
  }

  private getOutlineMaterial(originalMaterial: THREE.Material): THREE.ShaderMaterial {
    let entry = this.cache.get(originalMaterial.uuid);
    if (!entry) {
      entry = {
        material: this.createMaterial(),
        used: true,
        keepAlive: this.defaultKeepAlive,
        count: 0,
      };
      this.cache.set(originalMaterial.uuid, entry);
    }
    entry.used = true;
    const outMat = entry.material;
    this.originalMaterials.set(outMat.uuid, originalMaterial);

    const params = originalMaterial.userData?.outlineParameters as
      | { alpha?: number; keepAlive?: boolean }
      | undefined;
    outMat.fog = (originalMaterial as THREE.MeshToonMaterial).fog ?? true;
    outMat.toneMapped = originalMaterial.toneMapped;
    outMat.premultipliedAlpha = originalMaterial.premultipliedAlpha;
    const disp = (originalMaterial as THREE.MeshStandardMaterial).displacementMap ?? null;
    (outMat as unknown as { displacementMap: THREE.Texture | null }).displacementMap = disp;
    outMat.transparent =
      params?.alpha !== undefined && params.alpha < 1.0
        ? true
        : originalMaterial.transparent;
    if (params?.keepAlive !== undefined) {
      entry.keepAlive = params.keepAlive;
    }
    if (originalMaterial.clippingPlanes) {
      outMat.clipping = true;
      outMat.clippingPlanes = originalMaterial.clippingPlanes;
      outMat.clipIntersection = originalMaterial.clipIntersection;
      outMat.clipShadows = originalMaterial.clipShadows;
    }
    outMat.version = originalMaterial.version;
    return outMat;
  }

  private readonly onOutlineBeforeRender = (
    _renderer: THREE.WebGLRenderer,
    _scene: THREE.Scene,
    _camera: THREE.Camera,
    _geometry: THREE.BufferGeometry,
    material: THREE.Material
  ) => {
    const original = this.originalMaterials.get(material.uuid);
    if (!original) return;
    const shaderMat = material as THREE.ShaderMaterial;
    const params = original.userData?.outlineParameters as
      | { thickness?: number; color?: number[]; alpha?: number }
      | undefined;
    shaderMat.uniforms.outlineAlpha!.value =
      params?.alpha !== undefined ? params.alpha : original.opacity;
    if (params?.thickness !== undefined) {
      shaderMat.uniforms.outlineThickness!.value = params.thickness;
    }
    if (params?.color !== undefined) {
      (shaderMat.uniforms.outlineColor!.value as THREE.Color).fromArray(
        params.color
      );
    }
  };

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    if (!this.enabled) {
      this.renderer.render(scene, camera);
      return;
    }
    const currentAutoClear = this.renderer.autoClear;
    this.renderer.autoClear = this.autoClear;
    this.renderer.render(scene, camera);
    this.renderer.autoClear = currentAutoClear;
    this.renderOutline(scene, camera);
  }

  renderOutline(scene: THREE.Scene, camera: THREE.Camera): void {
    const currentAutoClear = this.renderer.autoClear;
    const currentMatrixAutoUpdate = scene.matrixWorldAutoUpdate;
    const currentBackground = scene.background;
    const currentShadowEnabled = this.renderer.shadowMap.enabled;

    const swappedMeshes: SwappedMeshRecord[] = [];
    const hiddenSprites: THREE.Sprite[] = [];

    scene.matrixWorldAutoUpdate = false;
    scene.background = null;
    this.renderer.autoClear = false;
    this.renderer.shadowMap.enabled = false;

    // Hide visible sprites during outline pass so labels and bubbles draw once.
    scene.traverseVisible((obj) => {
      if ((obj as THREE.Sprite).isSprite) {
        hiddenSprites.push(obj as THREE.Sprite);
        obj.visible = false;
        return;
      }

      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      if ((mesh as THREE.InstancedMesh).isInstancedMesh && (mesh as THREE.InstancedMesh).count === 0) {
        return;
      }
      if (!mesh.geometry?.attributes?.normal) return;
      const objOutline = mesh.userData?.outlineParameters as
        | { visible?: boolean }
        | undefined;
      if (objOutline?.visible === false) return;

      if (Array.isArray(mesh.material)) {
        if (mesh.material.every((m) => !this.shouldOutlineMaterial(m))) return;
        const origArr = mesh.material.slice();
        swappedMeshes.push({
          object: mesh,
          material: origArr,
          onBeforeRender: mesh.onBeforeRender,
        });
        for (let i = 0; i < mesh.material.length; i++) {
          const m = mesh.material[i];
          if (this.shouldOutlineMaterial(m)) {
            mesh.material[i] = this.getOutlineMaterial(m);
          }
        }
      } else {
        if (!this.shouldOutlineMaterial(mesh.material)) return;
        swappedMeshes.push({
          object: mesh,
          material: mesh.material,
          onBeforeRender: mesh.onBeforeRender,
        });
        mesh.material = this.getOutlineMaterial(mesh.material);
      }
      mesh.onBeforeRender = this.onOutlineBeforeRender;
    });

    try {
      this.renderer.render(scene, camera);
    } finally {
      for (let i = 0; i < hiddenSprites.length; i++) {
        hiddenSprites[i]!.visible = true;
      }
      for (let i = 0; i < swappedMeshes.length; i++) {
        const rec = swappedMeshes[i]!;
        rec.object.material = rec.material;
        rec.object.onBeforeRender = rec.onBeforeRender;
      }
      this.cleanupCache();
      scene.matrixWorldAutoUpdate = currentMatrixAutoUpdate;
      scene.background = currentBackground;
      this.renderer.autoClear = currentAutoClear;
      this.renderer.shadowMap.enabled = currentShadowEnabled;
    }
  }

  private cleanupCache(): void {
    this.originalMaterials.clear();
    for (const [key, entry] of this.cache) {
      if (!entry.used) {
        entry.count++;
        if (!entry.keepAlive && entry.count > this.removeThresholdCount) {
          entry.material.dispose();
          this.cache.delete(key);
        }
      } else {
        entry.used = false;
        entry.count = 0;
      }
    }
  }

  dispose(): void {
    this.originalMaterials.clear();
    for (const entry of this.cache.values()) {
      entry.material.dispose();
    }
    this.cache.clear();
  }
}
