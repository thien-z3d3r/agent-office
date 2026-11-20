import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { OutlineEffect } from "three/addons/effects/OutlineEffect.js";
import { Timer } from "three/addons/misc/Timer.js";
import type { AgentRoleId } from "@agent-office/protocol";
import { useOfficeStore } from "../store/office-store.ts";
import { preloadOfficeModels } from "./models.ts";
import { disposeSharedToonCache } from "./toon.ts";
import {
  buildAgentOfficeWorld,
  type BuiltOfficeWorld,
} from "./world/world-builder.ts";
import {
  ConfettiSystem,
  OfficeDog,
  ToonLaptop,
  ToonWorker,
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

  root.traverse((obj) => {
    const meshObj = obj as THREE.Mesh & THREE.SkinnedMesh;
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

  for (const tex of textures) tex.dispose();
  for (const mat of materials) mat.dispose();
  for (const geo of geometries) geo.dispose();
  for (const skel of skeletons) skel.dispose();
}

export const OfficeCanvas: React.FC<OfficeCanvasProps> = ({
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
  }>({
    world: null,
    scene: null,
    sun: null,
    hemi: null,
    camera: null,
    controls: null,
    dog: null,
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
    };

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const effect = new OutlineEffect(renderer, {
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
    controls.enableDamping = true;
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
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
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

    const workers = new Map<
      AgentRoleId,
      {
        worker: ToonWorker;
        laptop: ToonLaptop;
        prevStatus: string;
      }
    >();
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
        renderer.shadowMap.needsUpdate = true;
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
      const now = Date.now();
      const {
        snapshot: snap,
        roles: currentRoles,
        reducedMotion: isReduced,
      } = storeState;
      const builtWorld = worldRef.current.world;

      let sceneActive = false;
      let shadowDirty = false;

      if (builtWorld) {
        let hasNeedy = false;
        const doors = builtWorld.slidingDoors;
        if (doorNear.length !== doors.length) {
          doorNear = new Array<boolean>(doors.length).fill(false);
        } else {
          doorNear.fill(false);
        }

        for (const role of currentRoles) {
          const entry = workers.get(role.id);
          const desk = builtWorld.roleDesks.get(role.id);
          const live = snap.agents[role.id];
          if (!entry || !desk || !live) continue;

          if (live.status === "done" && entry.prevStatus !== "done") {
            confetti.burst(
              entry.worker.root.position.x,
              entry.worker.root.position.y,
              entry.worker.root.position.z
            );
          }
          entry.prevStatus = live.status;

          if (live.status === "waiting_approval" && !hasNeedy) {
            needyPosScratch.copy(entry.worker.root.position);
            hasNeedy = true;
          }

          let desiredRotY = desk.def.rotY + Math.PI;
          if (live.status === "standup") {
            desk.meetingSeatAnchor.getWorldPosition(targetVec);
            desiredRotY = desk.meetingSeatAnchor.rotation.y;
          } else {
            desk.seatAnchor.getWorldPosition(targetVec);
          }

          const pos = entry.worker.root.position;
          const dx = targetVec.x - pos.x;
          const dz = targetVec.z - pos.z;
          const dist = Math.hypot(dx, dz);

          let workerMoved = false;
          if (isReduced || dist < 0.05) {
            if (
              dist > 0.001 ||
              Math.abs(entry.worker.root.rotation.y - desiredRotY) > 0.001
            ) {
              workerMoved = true;
            }
            pos.copy(targetVec);
            entry.worker.root.rotation.y = desiredRotY;
          } else {
            const speed = 4.2;
            const step = Math.min(dist, speed * dt);
            pos.x += (dx / dist) * step;
            pos.z += (dz / dist) * step;
            entry.worker.root.rotation.y = Math.atan2(dx, dz);
            workerMoved = true;
            sceneActive = true;
          }

          for (let i = 0; i < doors.length; i++) {
            const d = doors[i]!;
            if (!doorNear[i] && Math.hypot(pos.x - d.x, pos.z - d.z) < 2.6) {
              doorNear[i] = true;
            }
          }

          const workerRes = entry.worker.update(
            dt,
            live,
            isReduced,
            snap.activeProvider
          );
          const laptopMoved = entry.laptop.update(dt, live, isReduced);
          if (workerRes.animating || laptopMoved) sceneActive = true;
          if (workerMoved || workerRes.shadowDirty) shadowDirty = true;
        }

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

        if (now - lastBoardSync > 450) {
          lastBoardSync = now;
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
        renderer.shadowMap.needsUpdate = true;
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
        next.reducedMotion === prev.reducedMotion
      ) {
        return;
      }
      storeState.snapshot = next.snapshot;
      storeState.roles = next.roles;
      storeState.reducedMotion = next.reducedMotion;
      if (next.reducedMotion !== prev.reducedMotion) {
        worldRef.current.dog?.unfreezeIfNeeded(next.reducedMotion);
      }
      wake(true);
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

        const seatWorld = new THREE.Vector3();
        for (const role of storeState.roles) {
          const desk = builtWorld.roleDesks.get(role.id);
          if (!desk) continue;
          const worker = new ToonWorker(role);
          desk.seatAnchor.getWorldPosition(seatWorld);
          worker.root.position.copy(seatWorld);
          worker.root.rotation.y = desk.def.rotY + Math.PI;
          scene.add(worker.root);

          const laptop = new ToonLaptop(role.tint);
          desk.laptopAnchor.add(laptop.root);

          workers.set(role.id, {
            worker,
            laptop,
            prevStatus: "idle",
          });
        }

        worldRef.current = {
          world: builtWorld,
          scene,
          sun,
          hemi,
          camera,
          controls,
          dog,
        };
        builtWorld.setNightMode(propsRef.current.nightMode);
        builtWorld.updateBoards(
          storeState.snapshot.tickets,
          storeState.snapshot.taskTable,
          storeState.snapshot.activeProvider,
          storeState.snapshot.lastStandup?.summary ?? null
        );
        lastBoardSync = Date.now();
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

      for (const [roleId, entry] of workers) {
        const hits = raycaster.intersectObject(entry.worker.root, true);
        if (hits.length > 0) {
          useOfficeStore.getState().setSelectedRole(roleId);
          callbacksRef.current.onSelectAgentModal(roleId);
          return;
        }
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
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
      for (const entry of workers.values()) {
        entry.worker.dispose();
      }
      workers.clear();
      confetti.dispose();
      worldRef.current.world?.dispose();
      sun.shadow.dispose();
      disposeObjectTree(scene);
      disposeSharedToonCache();

      worldRef.current = {
        world: null,
        scene: null,
        sun: null,
        hemi: null,
        camera: null,
        controls: null,
        dog: null,
      };
      effect.enabled = false;
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
};
