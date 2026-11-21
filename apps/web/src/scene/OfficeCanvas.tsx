import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Timer } from "three/addons/misc/Timer.js";
import type { AgentRoleId } from "@agent-office/protocol";
import { useOfficeStore } from "../store/office-store.ts";
import { preloadOfficeModels } from "./models.ts";
import { disposeSharedToonCache } from "./toon.ts";
import { ToonOutlineEffect } from "./toon-outline.ts";
import {
  buildAgentOfficeWorld,
  type BuiltOfficeWorld,
} from "./world/world-builder.ts";
import {
  ConfettiSystem,
  OfficeDog,
  ToonLaptopPool,
  ToonWorkerPool,
} from "./toon-actors.ts";

export interface OfficeCanvasProps {
  nightMode: boolean;
  cameraPreset: "overview" | "meeting" | "telescope";
  onReady: () => void;
  onSelectAgentModal: (roleId: AgentRoleId) => void;
}

function disposeObjectTree(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const skeletons = new Set<THREE.Skeleton>();
  const instanced = new Set<THREE.InstancedMesh>();

  root.traverse((obj) => {
    const meshObj = obj as THREE.Mesh & THREE.SkinnedMesh & THREE.InstancedMesh;
    if (meshObj.isInstancedMesh) instanced.add(meshObj);
    if (meshObj.geometry) geometries.add(meshObj.geometry);
    if (meshObj.isSkinnedMesh && meshObj.skeleton) {
      skeletons.add(meshObj.skeleton);
    }
    const mat = (obj as { material?: THREE.Material | THREE.Material[] }).material;
    if (Array.isArray(mat)) {
      for (const m of mat) if (m) materials.add(m);
    } else if (mat) {
      materials.add(mat);
    }
  });

  for (const mat of materials) {
    for (const val of Object.values(mat)) {
      if (val && typeof val === "object" && (val as THREE.Texture).isTexture) {
        textures.add(val as THREE.Texture);
      }
    }
  }

  for (const im of instanced) im.dispose();
  for (const tex of textures) tex.dispose();
  for (const mat of materials) mat.dispose();
  for (const geo of geometries) geo.dispose();
  for (const skel of skeletons) skel.dispose();
}

export const OfficeCanvas: React.FC<OfficeCanvasProps> = React.memo(({
  nightMode,
  cameraPreset,
  onReady,
  onSelectAgentModal,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const propsRef = useRef({ nightMode, cameraPreset });
  propsRef.current = { nightMode, cameraPreset };
  const callbacksRef = useRef({ onReady, onSelectAgentModal });
  callbacksRef.current = { onReady, onSelectAgentModal };
  const wakeRef = useRef<((needsShadow?: boolean) => void) | null>(null);

  const worldRef = useRef<{
    world: BuiltOfficeWorld | null;
    scene: THREE.Scene | null;
    sun: THREE.DirectionalLight | null;
    hemi: THREE.HemisphereLight | null;
    camera: THREE.PerspectiveCamera | null;
    controls: OrbitControls | null;
    dog: OfficeDog | null;
    workerPool: ToonWorkerPool | null;
    laptopPool: ToonLaptopPool | null;
  }>({
    world: null,
    scene: null,
    sun: null,
    hemi: null,
    camera: null,
    controls: null,
    dog: null,
    workerPool: null,
    laptopPool: null,
  });

  useEffect(() => {
    const { world, scene, sun, hemi } = worldRef.current;
    if (!world || !scene || !sun || !hemi) return;
    world.setNightMode(nightMode);
    const skyHex = nightMode ? "#141829" : "#bfe3ff";
    if (scene.background instanceof THREE.Color) {
      scene.background.set(skyHex);
    }
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.set(skyHex);
    }
    sun.color.set(nightMode ? "#9bb8ff" : "#fff1d6");
    sun.intensity = nightMode ? 0.95 : 2.2;
    hemi.color.set(nightMode ? "#3b4268" : "#fff5e6");
    hemi.groundColor.set(nightMode ? "#1f2233" : "#c9a27a");
    wakeRef.current?.(true);
  }, [nightMode]);

  useEffect(() => {
    const { camera, controls, world } = worldRef.current;
    if (!camera || !controls || !world) return;
    if (cameraPreset === "telescope") {
      camera.position.set(9.9, 4.15, 8.9);
      controls.target.set(-5.5, 0.9, -3.8);
    } else if (cameraPreset === "meeting") {
      camera.position.set(13.7, 7.2, 4.2);
      controls.target.set(13.7, 0.9, 10.5);
    } else {
      camera.position.set(-4.5, 14.5, 14.5);
      controls.target.set(-5.0, 0.8, -1.5);
    }
    controls.update();
    wakeRef.current?.(false);
  }, [cameraPreset]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    const initialStore = useOfficeStore.getState();
    const storeState = {
      snapshot: initialStore.snapshot,
      roles: initialStore.roles,
      reducedMotion: initialStore.reducedMotion,
      performanceMode: initialStore.performanceMode,
    };

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const effect = new ToonOutlineEffect(renderer, {
      defaultThickness: 0.0032,
      defaultColor: [0.17, 0.18, 0.26],
    });

    const initialNight = propsRef.current.nightMode;
    const initialSky = initialNight ? "#141829" : "#bfe3ff";
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(initialSky);
    scene.fog = new THREE.Fog(initialSky, 40, 92);

    const camera = new THREE.PerspectiveCamera(
      52,
      window.innerWidth / window.innerHeight,
      0.1,
      110
    );
    camera.position.set(-4.5, 14.5, 14.5);

    const controls = new OrbitControls(camera, canvas);
    controls.target.set(-5.0, 0.8, -1.5);
    controls.enableDamping = !initialStore.reducedMotion;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2.08;
    controls.minDistance = 3.5;
    controls.maxDistance = 42;

    const hemi = new THREE.HemisphereLight(
      initialNight ? "#3b4268" : "#fff5e6",
      initialNight ? "#1f2233" : "#c9a27a",
      1.5
    );
    const ambient = new THREE.AmbientLight("#ffffff", 0.5);
    scene.add(hemi, ambient);

    const sun = new THREE.DirectionalLight(
      initialNight ? "#9bb8ff" : "#fff1d6",
      initialNight ? 0.95 : 2.2
    );
    sun.position.set(-8, 18, 10);
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, {
      left: -32,
      right: 32,
      top: 30,
      bottom: -30,
      near: 1,
      far: 100,
    });
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.03;
    scene.add(sun);

    let shadowPending = true;
    let forceShadow = false;
    let lastShadowUpdate = 0;

    const applyRenderQuality = (perfMode: boolean) => {
      const dpr = perfMode ? 1 : Math.min(window.devicePixelRatio, 1.5);
      renderer.setPixelRatio(dpr);
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      effect.enabled = !perfMode;
      renderer.shadowMap.enabled = !perfMode;
      sun.castShadow = !perfMode;
      if (!perfMode) {
        shadowPending = true;
        forceShadow = true;
      }
    };
    applyRenderQuality(storeState.performanceMode);

    const prevStatuses = new Map<AgentRoleId, string>();
    const confetti = new ConfettiSystem();
    scene.add(confetti.group);

    const timer = new Timer();
    let loopRunning = false;
    let rafId = 0;
    let idleTimerId = 0;
    let lastBoardSync = 0;
    const targetVec = new THREE.Vector3();
    const needyPosScratch = new THREE.Vector3();
    let doorNear: boolean[] = [];

    const isHidden = () =>
      document.visibilityState === "hidden" || document.hidden;

    const stopLoop = () => {
      loopRunning = false;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    };

    const tick = () => {
      rafId = 0;
      if (disposed || !loopRunning || isHidden()) {
        loopRunning = false;
        return;
      }
      animate();
      if (loopRunning && !disposed && !isHidden()) {
        rafId = requestAnimationFrame(tick);
      }
    };

    const startLoop = () => {
      if (disposed || isHidden() || loopRunning) return;
      if (idleTimerId) {
        clearTimeout(idleTimerId);
        idleTimerId = 0;
      }
      timer.reset();
      loopRunning = true;
      rafId = requestAnimationFrame(tick);
    };

    const wake = (needsShadow = false) => {
      if (disposed) return;
      if (needsShadow) {
        shadowPending = true;
        forceShadow = true;
      }
      if (!isHidden()) {
        startLoop();
      }
    };
    wakeRef.current = wake;

    const animate = () => {
      if (disposed || isHidden()) {
        stopLoop();
        return;
      }

      timer.update();
      const dt = Math.min(timer.getDelta(), 0.1);
      const nowPerf = performance.now();
      const {
        snapshot: snap,
        roles: currentRoles,
        reducedMotion: isReduced,
        performanceMode: isPerfMode,
      } = storeState;
      const { world: builtWorld, workerPool, laptopPool } = worldRef.current;

      let sceneActive = false;
      let shadowDirty = false;

      if (builtWorld && workerPool && laptopPool) {
        let hasNeedy = false;
        const doors = builtWorld.slidingDoors;
        if (doorNear.length !== doors.length) {
          doorNear = new Array<boolean>(doors.length).fill(false);
        } else {
          doorNear.fill(false);
        }

        for (const role of currentRoles) {
          const desk = builtWorld.roleDesks.get(role.id);
          const live = snap.agents[role.id];
          const pos = workerPool.getPosition(role.id);
          if (!desk || !live || !pos) continue;

          if (live.status === "done" && prevStatuses.get(role.id) !== "done") {
            confetti.burst(pos.x, pos.y, pos.z);
          }
          prevStatuses.set(role.id, live.status);

          if (live.status === "waiting_approval" && !hasNeedy) {
            needyPosScratch.copy(pos);
            hasNeedy = true;
          }

          let desiredRotY = desk.def.rotY + Math.PI;
          if (live.status === "standup") {
            desk.meetingSeatAnchor.getWorldPosition(targetVec);
            desiredRotY = desk.meetingSeatAnchor.rotation.y;
          } else {
            desk.seatAnchor.getWorldPosition(targetVec);
          }

          const dx = targetVec.x - pos.x;
          const dz = targetVec.z - pos.z;
          const dist = Math.hypot(dx, dz);

          let workerMoved = false;
          let nextX = pos.x;
          let nextY = pos.y;
          let nextZ = pos.z;
          let nextRotY = desiredRotY;

          if (isReduced || dist < 0.05) {
            if (dist > 0.001) {
              workerMoved = true;
            }
            nextX = targetVec.x;
            nextY = targetVec.y;
            nextZ = targetVec.z;
            nextRotY = desiredRotY;
          } else {
            const speed = 4.2;
            const step = Math.min(dist, speed * dt);
            nextX = pos.x + (dx / dist) * step;
            nextZ = pos.z + (dz / dist) * step;
            nextRotY = Math.atan2(dx, dz);
            workerMoved = true;
            sceneActive = true;
          }

          workerPool.setTransform(role.id, nextX, nextY, nextZ, nextRotY);

          for (let i = 0; i < doors.length; i++) {
            const d = doors[i]!;
            if (!doorNear[i] && Math.hypot(nextX - d.x, nextZ - d.z) < 2.6) {
              doorNear[i] = true;
            }
          }

          const workerRes = workerPool.updateWorker(
            role.id,
            dt,
            live,
            isReduced,
            snap.activeProvider,
            nowPerf
          );
          const laptopMoved = laptopPool.updateLaptop(
            role.id,
            dt,
            live,
            isReduced,
            nowPerf
          );
          if (workerRes.animating || laptopMoved) sceneActive = true;
          if (workerMoved || workerRes.shadowDirty) shadowDirty = true;
        }

        workerPool.commit();
        laptopPool.commit();

        for (let i = 0; i < doors.length; i++) {
          const d = doors[i]!;
          const want = doorNear[i] ? 1 : 0;
          if (d.open !== want) {
            d.open =
              want > d.open
                ? Math.min(1, d.open + dt * 2.5)
                : Math.max(0, d.open - dt * 1.6);
            d.setOpen(d.open);
            sceneActive = true;
          }
        }

        const dogRes = worldRef.current.dog?.update(
          dt,
          hasNeedy ? needyPosScratch : null,
          isReduced
        );
        if (dogRes?.active) sceneActive = true;
        if (dogRes?.shadowDirty) shadowDirty = true;

        confetti.update(dt);
        if (confetti.isActive) sceneActive = true;

        if (nowPerf - lastBoardSync > 450) {
          lastBoardSync = nowPerf;
          builtWorld.updateBoards(
            snap.tickets,
            snap.taskTable,
            snap.activeProvider,
            snap.lastStandup?.summary ?? null
          );
        }
      }

      const controlsActive = controls.update();
      if (shadowDirty) {
        shadowPending = true;
      }
      if (
        !isPerfMode &&
        shadowPending &&
        (forceShadow ||
          lastShadowUpdate === 0 ||
          nowPerf - lastShadowUpdate >= 100 ||
          !sceneActive)
      ) {
        renderer.shadowMap.needsUpdate = true;
        shadowPending = false;
        forceShadow = false;
        lastShadowUpdate = nowPerf;
      }
      effect.render(scene, camera);

      if (builtWorld && !controlsActive && !sceneActive) {
        stopLoop();
        if (!isReduced && !idleTimerId && !isHidden()) {
          idleTimerId = window.setTimeout(() => {
            idleTimerId = 0;
            if (!disposed && !isHidden()) {
              worldRef.current.dog?.advanceIdleClock(0.9);
              wake(false);
            }
          }, 1000);
        }
      }
    };

    const unsubscribeStore = useOfficeStore.subscribe((next, prev) => {
      if (
        next.snapshot === prev.snapshot &&
        next.roles === prev.roles &&
        next.reducedMotion === prev.reducedMotion &&
        next.performanceMode === prev.performanceMode
      ) {
        return;
      }
      storeState.snapshot = next.snapshot;
      storeState.roles = next.roles;
      storeState.reducedMotion = next.reducedMotion;
      storeState.performanceMode = next.performanceMode;

      let needsShadow = true;
      if (next.reducedMotion !== prev.reducedMotion) {
        controls.enableDamping = !next.reducedMotion;
        controls.update();
        worldRef.current.dog?.unfreezeIfNeeded(next.reducedMotion);
      }
      if (next.performanceMode !== prev.performanceMode) {
        applyRenderQuality(next.performanceMode);
        needsShadow = !next.performanceMode;
      }
      wake(needsShadow);
    });

    useOfficeStore.getState().setModelsError(null);
    void preloadOfficeModels().then((errors) => {
      if (disposed) return;
      if (errors.length > 0) {
        useOfficeStore
          .getState()
          .setModelsError(`Failed to load 3D assets: ${errors.join("; ")}`);
      }
      try {
        const builtWorld = buildAgentOfficeWorld(storeState.roles);
        scene.add(builtWorld.root);
        builtWorld.root.updateMatrixWorld(true);

        const dog = new OfficeDog();
        scene.add(dog.root);

        const workerPool = new ToonWorkerPool(
          storeState.roles,
          builtWorld.roleDesks
        );
        scene.add(workerPool.root);

        const laptopPool = new ToonLaptopPool(
          storeState.roles,
          builtWorld.roleDesks
        );
        scene.add(laptopPool.root);

        for (const role of storeState.roles) {
          prevStatuses.set(role.id, "idle");
        }

        worldRef.current = {
          world: builtWorld,
          scene,
          sun,
          hemi,
          camera,
          controls,
          dog,
          workerPool,
          laptopPool,
        };
        builtWorld.setNightMode(propsRef.current.nightMode);
        builtWorld.updateBoards(
          storeState.snapshot.tickets,
          storeState.snapshot.taskTable,
          storeState.snapshot.activeProvider,
          storeState.snapshot.lastStandup?.summary ?? null
        );
        lastBoardSync = performance.now();
        callbacksRef.current.onReady();
        wake(true);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        useOfficeStore
          .getState()
          .setModelsError(`Failed to build 3D office scene: ${msg}`);
        callbacksRef.current.onReady();
      }
    });

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downX = 0;
    let downY = 0;
    const onPointerDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
      wake(false);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);

      const dog = worldRef.current.dog;
      if (dog) {
        const dogHits = raycaster.intersectObject(dog.root, true);
        if (dogHits.length > 0) {
          dog.pet();
          wake(false);
          return;
        }
      }

      const roleId = worldRef.current.workerPool?.pickRole(raycaster) ?? null;
      if (roleId) {
        useOfficeStore.getState().setSelectedRole(roleId);
        callbacksRef.current.onSelectAgentModal(roleId);
      }
    };
    const onWheel = () => wake(false);
    const onKeyDown = () => wake(false);
    const onControlsWake = () => wake(false);
    const onVisibilityChange = () => {
      if (isHidden()) {
        if (idleTimerId) {
          clearTimeout(idleTimerId);
          idleTimerId = 0;
        }
        stopLoop();
      } else {
        timer.reset();
        wake(false);
      }
    };
    const onResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const dpr = storeState.performanceMode
        ? 1
        : Math.min(window.devicePixelRatio, 1.5);
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      wake(false);
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibilityChange);
    controls.addEventListener("start", onControlsWake);
    controls.addEventListener("change", onControlsWake);

    if (!isHidden()) {
      startLoop();
    }

    return () => {
      disposed = true;
      wakeRef.current = null;
      if (idleTimerId) {
        clearTimeout(idleTimerId);
        idleTimerId = 0;
      }
      stopLoop();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
      controls.removeEventListener("start", onControlsWake);
      controls.removeEventListener("change", onControlsWake);
      unsubscribeStore();
      timer.dispose();
      controls.dispose();

      worldRef.current.dog?.dispose();
      worldRef.current.workerPool?.dispose();
      worldRef.current.laptopPool?.dispose();
      prevStatuses.clear();
      confetti.dispose();
      worldRef.current.world?.dispose();
      sun.shadow.dispose();
      disposeObjectTree(scene);
      scene.clear();
      disposeSharedToonCache();

      worldRef.current = {
        world: null,
        scene: null,
        sun: null,
        hemi: null,
        camera: null,
        controls: null,
        dog: null,
        workerPool: null,
        laptopPool: null,
      };
      effect.enabled = false;
      effect.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <canvas
      id="scene"
      ref={canvasRef}
      tabIndex={-1}
      aria-label="3D Agent Office workspace"
      data-testid="office-webgl-canvas"
    />
  );
});

OfficeCanvas.displayName = "OfficeCanvas";
