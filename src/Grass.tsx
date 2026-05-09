import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { useFrame, useLoader, type ThreeEvent } from "@react-three/fiber";
import { createGrassMaterial } from "./GrassMaterial";
import indexJson from "./assets/sprites/index.json";
import type { BisonPosition } from "./Bison";

export type Mode = "grow" | "bison" | "fire" | "seed" | null;

// User-initiated seed placement. App.tsx pushes one of these per click in
// seed mode; the matching GrassType drains it next frame and creates a new
// instance on its InstancedMesh, identical in every way to a propagated one.
export type SeedRequest = {
  typeIndex: number;
  x: number;
  z: number;
};

export type GrassStat = {
  initial: number;
  active: number;
  live: number;
  biomass: number;   // sq ft of silhouette area, summed
  tallestFt: number; // height in ft of the tallest live plant in this type
};

type SpriteMeta = {
  name: string;
  frames: number;
  frameWidth: number;
  frameHeight: number;
  fps: number;
  image: string;
};

const SPRITES = indexJson as SpriteMeta[];

const PNG_URLS = import.meta.glob("./assets/sprites/*.png", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

function urlFor(name: string): string {
  for (const [path, url] of Object.entries(PNG_URLS)) {
    if (path.endsWith(`/${name}.png`)) return url;
  }
  throw new Error(`missing sprite png: ${name}`);
}

const TALLEST_FRAME_HEIGHT = SPRITES.reduce(
  (m, s) => Math.max(m, s.frameHeight),
  1
);
const WORLD_HEIGHT = 30;
const WORLD_PER_PIXEL = WORLD_HEIGHT / TALLEST_FRAME_HEIGHT;
const GROUND_Y = -10;
const OPACITY_DEFAULT = 0.7;
const OPACITY_HOVER = 1.0;

const BISON_GRAZE_RADIUS = 6;
const BISON_GRAZE_RADIUS_SQ = BISON_GRAZE_RADIUS * BISON_GRAZE_RADIUS;
const GRAZE_TICK_INTERVAL = 0.3;
const GRAZE_DECAY = 0.97;
// Plants whose target scale would render shorter than this (in real ft) die
// outright instead of asymptoting toward zero. Per-type threshold derives
// from each sprite's heightFtAtScale1 so a small sprite dies sooner than a
// big sprite at the same target scale. ~1 ft = ankle-height stub: clearly
// grazed-down and visually "done", well before lerping to invisible.
const DEATH_HEIGHT_FT = 1.0;

// Propagation: pick a healthy existing grass and spawn a seedling near it.
const PROPAGATION_INTERVAL_MIN = 4;
const PROPAGATION_INTERVAL_MAX = 8;
const PROPAGATION_PARENT_MIN_TARGET = 0.5;
const PROPAGATION_DISTANCE_MIN = 2.5;
const PROPAGATION_DISTANCE_MAX = 5.5;
// Real plants compete for ground; reject candidate spawn points that fall
// within this radius (world units) of any live neighbor in the same type.
// 2.5 world units ≈ 0.67 ft of clearance between stem centers.
const PROPAGATION_MIN_NEIGHBOR_DISTANCE = 2.5;
const PROPAGATION_PLACEMENT_ATTEMPTS = 8;
const SEEDLING_SCALE = 0.05;
const SEEDLING_TARGET_MIN = 0.4;
const SEEDLING_TARGET_MAX = 0.8;
// Per-type instance buffer headroom over the starting count. With 21 sprite
// types and density=75 (perType≈4), 30× yields 120 plants/type → ~2520 total
// before the patch saturates. InstancedMesh handles this trivially; a higher
// bound mostly just delays the saturation plateau.
const MAX_CAPACITY_MULT = 30;

// Slow regrowth: every minute, all active grasses scale up a little.
const GROWTH_INTERVAL = 60;
const GROWTH_RATE = 1.05;
const MAX_GROW_SCALE = 6;

// Stats classification.
const LIVE_THRESHOLD = 0.05;
const DEAD_THRESHOLD = 0.02;

// Real-world calibration. The tallest sprite at "typical mature" scale 1.0
// represents ~8 ft of grass; at slow-regrowth peak scale ~1.5 it's ~12 ft —
// matching the upper range of big bluestem on a tallgrass prairie.
const REFERENCE_HEIGHT_FT = 8;
const FT_PER_WORLD_UNIT = REFERENCE_HEIGHT_FT / WORLD_HEIGHT;
const SQFT_PER_WORLD_UNIT_SQ = FT_PER_WORLD_UNIT * FT_PER_WORLD_UNIT;

function nextPropagationDelay(): number {
  return (
    PROPAGATION_INTERVAL_MIN +
    Math.random() * (PROPAGATION_INTERVAL_MAX - PROPAGATION_INTERVAL_MIN)
  );
}

type GrassProps = {
  patchSize: number;
  density: number;
  mode: Mode;
  onClickGrass: () => void;
  bisonPositionsRef: MutableRefObject<BisonPosition[]>;
  grassStatsRef: MutableRefObject<GrassStat[]>;
  seedQueueRef: MutableRefObject<SeedRequest[]>;
};

export function Grass({
  patchSize,
  density,
  mode,
  onClickGrass,
  bisonPositionsRef,
  grassStatsRef,
  seedQueueRef,
}: GrassProps) {
  const perType = Math.max(1, Math.round(density / SPRITES.length));
  return (
    <>
      {SPRITES.map((meta, idx) => (
        <GrassType
          key={meta.name}
          meta={meta}
          count={perType}
          typeIndex={idx}
          patchSize={patchSize}
          mode={mode}
          onClickGrass={onClickGrass}
          bisonPositionsRef={bisonPositionsRef}
          grassStatsRef={grassStatsRef}
          seedQueueRef={seedQueueRef}
        />
      ))}
    </>
  );
}

type GrassTypeProps = {
  meta: SpriteMeta;
  count: number;
  typeIndex: number;
  patchSize: number;
  mode: Mode;
  onClickGrass: () => void;
  bisonPositionsRef: MutableRefObject<BisonPosition[]>;
  grassStatsRef: MutableRefObject<GrassStat[]>;
  seedQueueRef: MutableRefObject<SeedRequest[]>;
};

function GrassType({
  meta,
  count,
  typeIndex,
  patchSize,
  mode,
  onClickGrass,
  bisonPositionsRef,
  grassStatsRef,
  seedQueueRef,
}: GrassTypeProps) {
  const url = useMemo(() => urlFor(meta.name), [meta.name]);
  const texture = useLoader(THREE.TextureLoader, url) as THREE.Texture;

  useEffect(() => {
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
  }, [texture]);

  const material = useMemo(
    () => createGrassMaterial(texture, meta.frames, meta.fps),
    [texture, meta.frames, meta.fps]
  );
  useEffect(() => () => material.dispose(), [material]);

  const planeW = meta.frameWidth * WORLD_PER_PIXEL;
  const planeH = meta.frameHeight * WORLD_PER_PIXEL;

  // Per-type real-world constants for the stats panel.
  // areaPerT2: silhouette area in sq ft, multiplied by t² for current scale.
  // heightFtAtScale1: this sprite's height in ft when target scale is 1.0.
  const areaPerT2 = useMemo(
    () => planeW * planeH * SQFT_PER_WORLD_UNIT_SQ,
    [planeW, planeH]
  );
  const heightFtAtScale1 = useMemo(
    () => planeH * FT_PER_WORLD_UNIT,
    [planeH]
  );
  // Target scale below which a plant in this type is considered dead.
  const deathScale = useMemo(
    () => DEATH_HEIGHT_FT / heightFtAtScale1,
    [heightFtAtScale1]
  );

  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(planeW, planeH, 1, 1);
    geo.translate(0, planeH / 2, 0);
    return geo;
  }, [planeW, planeH]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const maxCapacity = useMemo(
    () => Math.max(count * MAX_CAPACITY_MULT, count + 8),
    [count]
  );

  const meshRef = useRef<THREE.InstancedMesh>(null);
  const scaleAttrRef = useRef<THREE.InstancedBufferAttribute | null>(null);
  const opacityAttrRef = useRef<THREE.InstancedBufferAttribute | null>(null);
  const phaseAttrRef = useRef<THREE.InstancedBufferAttribute | null>(null);
  const scalesRef = useRef<Float32Array>(new Float32Array(maxCapacity));
  const targetScalesRef = useRef<Float32Array>(new Float32Array(maxCapacity));
  const posArrRef = useRef<Float32Array>(new Float32Array(maxCapacity * 2));
  const activeCountRef = useRef(0);
  const grazeTickRef = useRef(0);
  const spawnTimerRef = useRef(nextPropagationDelay());
  const growTimerRef = useRef(GROWTH_INTERVAL);
  const tmpObj = useMemo(() => new THREE.Object3D(), []);
  const modeRef = useRef<Mode>(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const half = patchSize * 0.5;

    const phaseArr = new Float32Array(maxCapacity);
    const scaleArr = new Float32Array(maxCapacity);
    const opacityArr = new Float32Array(maxCapacity);
    const posArr = new Float32Array(maxCapacity * 2);

    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 2 * half;
      const z = (Math.random() - 0.5) * 2 * half;
      tmpObj.position.set(x, GROUND_Y, z);
      tmpObj.rotation.set(0, 0, 0);
      tmpObj.scale.set(1, 1, 1);
      tmpObj.updateMatrix();
      mesh.setMatrixAt(i, tmpObj.matrix);

      phaseArr[i] = Math.random();
      const s = 0.7 + Math.random() * 0.6;
      scaleArr[i] = s;
      opacityArr[i] = OPACITY_DEFAULT;
      posArr[i * 2] = x;
      posArr[i * 2 + 1] = z;
    }

    mesh.instanceMatrix.needsUpdate = true;
    // matrix changes when seedlings spawn, so allow dynamic updates
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    const phaseAttr = new THREE.InstancedBufferAttribute(phaseArr, 1);
    const scaleAttr = new THREE.InstancedBufferAttribute(scaleArr, 1);
    const opacityAttr = new THREE.InstancedBufferAttribute(opacityArr, 1);
    phaseAttr.setUsage(THREE.DynamicDrawUsage);
    scaleAttr.setUsage(THREE.DynamicDrawUsage);
    opacityAttr.setUsage(THREE.DynamicDrawUsage);

    mesh.geometry.setAttribute("aPhase", phaseAttr);
    mesh.geometry.setAttribute("aScale", scaleAttr);
    mesh.geometry.setAttribute("aOpacity", opacityAttr);

    phaseAttrRef.current = phaseAttr;
    scaleAttrRef.current = scaleAttr;
    opacityAttrRef.current = opacityAttr;
    scalesRef.current = scaleArr;
    targetScalesRef.current = scaleArr.slice();
    posArrRef.current = posArr;
    activeCountRef.current = count;
    spawnTimerRef.current = nextPropagationDelay();
    growTimerRef.current = GROWTH_INTERVAL;

    // initial biomass = sum of t² across freshly-set scales, in sq ft.
    let initialT2 = 0;
    let maxT = 0;
    for (let i = 0; i < count; i++) {
      const s = scaleArr[i];
      initialT2 += s * s;
      if (s > maxT) maxT = s;
    }
    grassStatsRef.current[typeIndex] = {
      initial: count,
      active: count,
      live: count,
      biomass: initialT2 * areaPerT2,
      tallestFt: maxT * heightFtAtScale1,
    };

    mesh.frustumCulled = false;
    mesh.count = count;
  }, [count, patchSize, geometry, maxCapacity, tmpObj, typeIndex, grassStatsRef]);

  useFrame((state, dt) => {
    material.uniforms.uTime.value = state.clock.elapsedTime;

    const cur = scalesRef.current;
    const tgt = targetScalesRef.current;
    const attr = scaleAttrRef.current;
    const phaseAttr = phaseAttrRef.current;
    const opacityAttr = opacityAttrRef.current;
    const mesh = meshRef.current;
    if (!attr || !phaseAttr || !opacityAttr || !mesh) return;

    const active = activeCountRef.current;
    const pos = posArrRef.current;

    // bison grazing tick + stats accumulation
    grazeTickRef.current -= dt;
    if (grazeTickRef.current <= 0) {
      grazeTickRef.current = GRAZE_TICK_INTERVAL;
      const bisons = bisonPositionsRef.current;

      let live = 0;
      let areaT2 = 0;
      let maxT = 0;

      for (let i = 0; i < active; i++) {
        const t = tgt[i];
        if (t > LIVE_THRESHOLD) {
          live++;
          areaT2 += t * t;
          if (t > maxT) maxT = t;
        }

        if (bisons.length > 0) {
          const px = pos[i * 2];
          const pz = pos[i * 2 + 1];
          for (let b = 0; b < bisons.length; b++) {
            const dx = px - bisons[b].x;
            const dz = pz - bisons[b].z;
            if (dx * dx + dz * dz < BISON_GRAZE_RADIUS_SQ) {
              const next = t * GRAZE_DECAY;
              // snap below death threshold so the slot becomes recyclable
              tgt[i] = next < deathScale ? 0 : next;
              break;
            }
          }
        }
      }

      const stat = grassStatsRef.current[typeIndex];
      if (stat) {
        stat.live = live;
        stat.biomass = areaT2 * areaPerT2;
        stat.tallestFt = maxT * heightFtAtScale1;
      }
    }

    // slow regrowth — every ~minute, bump all live targets up a bit
    growTimerRef.current -= dt;
    if (growTimerRef.current <= 0) {
      growTimerRef.current = GROWTH_INTERVAL;
      for (let i = 0; i < active; i++) {
        if (tgt[i] > 0.01) {
          tgt[i] = Math.min(tgt[i] * GROWTH_RATE, MAX_GROW_SCALE);
        }
      }
    }

    // propagation — pick a healthy parent and place a seedling either in a
    // fresh slot or, at capacity, in a fully-dead slot (recycle).
    spawnTimerRef.current -= dt;
    if (spawnTimerRef.current <= 0 && active > 0) {
      spawnTimerRef.current = nextPropagationDelay();

      // 1. fresh slot if there's headroom
      let newIdx = active < maxCapacity ? active : -1;

      // 2. otherwise, recycle a fully-dead slot
      if (newIdx === -1) {
        for (let i = 0; i < active; i++) {
          if (tgt[i] < DEAD_THRESHOLD) {
            newIdx = i;
            break;
          }
        }
      }

      if (newIdx >= 0) {
        let parentIdx = -1;
        for (let attempt = 0; attempt < 8; attempt++) {
          const idx = Math.floor(Math.random() * active);
          if (idx !== newIdx && tgt[idx] >= PROPAGATION_PARENT_MIN_TARGET) {
            parentIdx = idx;
            break;
          }
        }

        if (parentIdx >= 0) {
          const half = patchSize * 0.5;
          const parentX = pos[parentIdx * 2];
          const parentZ = pos[parentIdx * 2 + 1];
          const minNeighborSq =
            PROPAGATION_MIN_NEIGHBOR_DISTANCE *
            PROPAGATION_MIN_NEIGHBOR_DISTANCE;

          let placedX = 0;
          let placedZ = 0;
          let placed = false;

          for (let a = 0; a < PROPAGATION_PLACEMENT_ATTEMPTS; a++) {
            const angle = Math.random() * Math.PI * 2;
            const dist =
              PROPAGATION_DISTANCE_MIN +
              Math.random() *
                (PROPAGATION_DISTANCE_MAX - PROPAGATION_DISTANCE_MIN);
            const cx = Math.max(
              -half,
              Math.min(half, parentX + Math.cos(angle) * dist)
            );
            const cz = Math.max(
              -half,
              Math.min(half, parentZ + Math.sin(angle) * dist)
            );

            // reject if any live neighbor of this type is too close
            let tooClose = false;
            for (let j = 0; j < active; j++) {
              if (j === newIdx) continue;
              if (tgt[j] < LIVE_THRESHOLD) continue;
              const dx = cx - pos[j * 2];
              const dz = cz - pos[j * 2 + 1];
              if (dx * dx + dz * dz < minNeighborSq) {
                tooClose = true;
                break;
              }
            }

            if (!tooClose) {
              placedX = cx;
              placedZ = cz;
              placed = true;
              break;
            }
          }

          if (placed) {
            pos[newIdx * 2] = placedX;
            pos[newIdx * 2 + 1] = placedZ;

            tmpObj.position.set(placedX, GROUND_Y, placedZ);
            tmpObj.rotation.set(0, 0, 0);
            tmpObj.scale.set(1, 1, 1);
            tmpObj.updateMatrix();
            mesh.setMatrixAt(newIdx, tmpObj.matrix);
            mesh.instanceMatrix.needsUpdate = true;

            cur[newIdx] = SEEDLING_SCALE;
            tgt[newIdx] =
              SEEDLING_TARGET_MIN +
              Math.random() * (SEEDLING_TARGET_MAX - SEEDLING_TARGET_MIN);
            (phaseAttr.array as Float32Array)[newIdx] = Math.random();
            (opacityAttr.array as Float32Array)[newIdx] = OPACITY_DEFAULT;
            (attr.array as Float32Array)[newIdx] = SEEDLING_SCALE;

            phaseAttr.needsUpdate = true;
            opacityAttr.needsUpdate = true;

            // only bump activeCount when we used a fresh slot
            if (newIdx === active) {
              activeCountRef.current = active + 1;
              mesh.count = activeCountRef.current;
              const stat = grassStatsRef.current[typeIndex];
              if (stat) stat.active = activeCountRef.current;
            }
          }
        }
      }
    }

    // drain user seed requests for this type — same lifecycle as propagation,
    // but the position is taken from the click point exactly (no spacing
    // rejection) so the user gets the plant where they clicked.
    const queue = seedQueueRef.current;
    if (queue.length > 0) {
      const half = patchSize * 0.5;
      for (let q = queue.length - 1; q >= 0; q--) {
        const req = queue[q];
        if (req.typeIndex !== typeIndex) continue;
        queue.splice(q, 1);

        const curActive = activeCountRef.current;
        let slotIdx = curActive < maxCapacity ? curActive : -1;
        if (slotIdx === -1) {
          for (let i = 0; i < curActive; i++) {
            if (tgt[i] < DEAD_THRESHOLD) {
              slotIdx = i;
              break;
            }
          }
        }
        if (slotIdx < 0) continue; // patch saturated; drop the request

        const sx = Math.max(-half, Math.min(half, req.x));
        const sz = Math.max(-half, Math.min(half, req.z));

        pos[slotIdx * 2] = sx;
        pos[slotIdx * 2 + 1] = sz;

        tmpObj.position.set(sx, GROUND_Y, sz);
        tmpObj.rotation.set(0, 0, 0);
        tmpObj.scale.set(1, 1, 1);
        tmpObj.updateMatrix();
        mesh.setMatrixAt(slotIdx, tmpObj.matrix);
        mesh.instanceMatrix.needsUpdate = true;

        cur[slotIdx] = SEEDLING_SCALE;
        tgt[slotIdx] =
          SEEDLING_TARGET_MIN +
          Math.random() * (SEEDLING_TARGET_MAX - SEEDLING_TARGET_MIN);
        (phaseAttr.array as Float32Array)[slotIdx] = Math.random();
        (opacityAttr.array as Float32Array)[slotIdx] = OPACITY_DEFAULT;
        (attr.array as Float32Array)[slotIdx] = SEEDLING_SCALE;

        phaseAttr.needsUpdate = true;
        opacityAttr.needsUpdate = true;

        if (slotIdx === curActive) {
          activeCountRef.current = curActive + 1;
          mesh.count = activeCountRef.current;
          const stat = grassStatsRef.current[typeIndex];
          if (stat) stat.active = activeCountRef.current;
        }
      }
    }

    // scale lerp
    let dirty = false;
    const liveCount = activeCountRef.current;
    for (let i = 0; i < liveCount; i++) {
      const diff = tgt[i] - cur[i];
      if (Math.abs(diff) > 0.001) {
        cur[i] += diff * 0.1;
        (attr.array as Float32Array)[i] = cur[i];
        dirty = true;
      }
    }
    if (dirty) attr.needsUpdate = true;
  });

  const handlePointerEnter = (e: ThreeEvent<PointerEvent>) => {
    const id = e.instanceId;
    const attr = opacityAttrRef.current;
    if (id === undefined || !attr) return;
    e.stopPropagation();
    attr.array[id] = OPACITY_HOVER;
    attr.needsUpdate = true;
  };

  const handlePointerLeave = (e: ThreeEvent<PointerEvent>) => {
    const id = e.instanceId;
    const attr = opacityAttrRef.current;
    if (id === undefined || !attr) return;
    e.stopPropagation();
    attr.array[id] = OPACITY_DEFAULT;
    attr.needsUpdate = true;
  };

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    const id = e.instanceId;
    const m = modeRef.current;
    if (id === undefined || m === null || m === "seed" || m === "bison") return;
    e.stopPropagation();

    const targets = targetScalesRef.current;

    let next = targets[id];
    if (m === "grow") next = Math.min(next * 1.5, 6);
    else if (m === "fire") next = 0;

    targets[id] = next;
    onClickGrass();
  };

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, maxCapacity]}
      onClick={handleClick}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    />
  );
}

