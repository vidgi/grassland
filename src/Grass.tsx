import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { useFrame, useLoader, type ThreeEvent } from "@react-three/fiber";
import { createGrassMaterial } from "./GrassMaterial";
import indexJson from "./assets/sprites/index.json";
import type { BisonPosition } from "./Bison";

export type Mode = "grow" | "bison" | "fire" | "seed" | null;

export type SeededPlantData = {
  typeIndex: number;
  position: [number, number, number];
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
const GRAZE_FLOOR = 0.1;

type GrassProps = {
  patchSize: number;
  density: number;
  mode: Mode;
  onClickGrass: () => void;
  bisonPositionsRef: MutableRefObject<BisonPosition[]>;
};

export function Grass({
  patchSize,
  density,
  mode,
  onClickGrass,
  bisonPositionsRef,
}: GrassProps) {
  const perType = Math.max(1, Math.round(density / SPRITES.length));
  return (
    <>
      {SPRITES.map((meta) => (
        <GrassType
          key={meta.name}
          meta={meta}
          count={perType}
          patchSize={patchSize}
          mode={mode}
          onClickGrass={onClickGrass}
          bisonPositionsRef={bisonPositionsRef}
        />
      ))}
    </>
  );
}

type GrassTypeProps = {
  meta: SpriteMeta;
  count: number;
  patchSize: number;
  mode: Mode;
  onClickGrass: () => void;
  bisonPositionsRef: MutableRefObject<BisonPosition[]>;
};

function GrassType({
  meta,
  count,
  patchSize,
  mode,
  onClickGrass,
  bisonPositionsRef,
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

  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(planeW, planeH, 1, 1);
    geo.translate(0, planeH / 2, 0);
    return geo;
  }, [planeW, planeH]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const meshRef = useRef<THREE.InstancedMesh>(null);
  const scaleAttrRef = useRef<THREE.InstancedBufferAttribute | null>(null);
  const opacityAttrRef = useRef<THREE.InstancedBufferAttribute | null>(null);
  const scalesRef = useRef<Float32Array>(new Float32Array(count));   // current (lerping)
  const targetScalesRef = useRef<Float32Array>(new Float32Array(count)); // target
  const posArrRef = useRef<Float32Array>(new Float32Array(count * 2)); // (x,z) per instance
  const grazeTickRef = useRef(0);
  const modeRef = useRef<Mode>(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const half = patchSize * 0.5;
    const tmp = new THREE.Object3D();

    const phaseArr = new Float32Array(count);
    const scaleArr = new Float32Array(count);
    const opacityArr = new Float32Array(count);
    const posArr = new Float32Array(count * 2);

    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 2 * half;
      const z = (Math.random() - 0.5) * 2 * half;
      tmp.position.set(x, GROUND_Y, z);
      tmp.rotation.set(0, 0, 0);
      tmp.scale.set(1, 1, 1);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);

      phaseArr[i] = Math.random();
      const s = 0.7 + Math.random() * 0.6;
      scaleArr[i] = s;
      opacityArr[i] = OPACITY_DEFAULT;
      posArr[i * 2] = x;
      posArr[i * 2 + 1] = z;
    }

    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);

    const phaseAttr = new THREE.InstancedBufferAttribute(phaseArr, 1);
    const scaleAttr = new THREE.InstancedBufferAttribute(scaleArr, 1);
    const opacityAttr = new THREE.InstancedBufferAttribute(opacityArr, 1);
    scaleAttr.setUsage(THREE.DynamicDrawUsage);
    opacityAttr.setUsage(THREE.DynamicDrawUsage);

    mesh.geometry.setAttribute("aPhase", phaseAttr);
    mesh.geometry.setAttribute("aScale", scaleAttr);
    mesh.geometry.setAttribute("aOpacity", opacityAttr);

    scaleAttrRef.current = scaleAttr;
    opacityAttrRef.current = opacityAttr;
    scalesRef.current = scaleArr;
    targetScalesRef.current = scaleArr.slice(); // copy initial values as targets
    posArrRef.current = posArr;

    mesh.frustumCulled = false;
    mesh.count = count;
  }, [count, patchSize, geometry]);

  useFrame((state, dt) => {
    material.uniforms.uTime.value = state.clock.elapsedTime;

    const cur = scalesRef.current;
    const tgt = targetScalesRef.current;
    const attr = scaleAttrRef.current;
    if (!attr) return;

    grazeTickRef.current -= dt;
    if (grazeTickRef.current <= 0) {
      grazeTickRef.current = GRAZE_TICK_INTERVAL;
      const bisons = bisonPositionsRef.current;
      if (bisons.length > 0) {
        const pos = posArrRef.current;
        for (let i = 0; i < cur.length; i++) {
          const px = pos[i * 2];
          const pz = pos[i * 2 + 1];
          for (let b = 0; b < bisons.length; b++) {
            const dx = px - bisons[b].x;
            const dz = pz - bisons[b].z;
            if (dx * dx + dz * dz < BISON_GRAZE_RADIUS_SQ) {
              tgt[i] = Math.max(tgt[i] * GRAZE_DECAY, GRAZE_FLOOR);
              break;
            }
          }
        }
      }
    }

    let dirty = false;
    for (let i = 0; i < cur.length; i++) {
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
      args={[geometry, material, count]}
      onClick={handleClick}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    />
  );
}

// ─── Seeded Plants ────────────────────────────────────────────────────────────

type SeededPlantMeshProps = {
  meta: SpriteMeta;
  position: [number, number, number];
  mode: Mode;
  onClickGrass: () => void;
  bisonPositionsRef: MutableRefObject<BisonPosition[]>;
};

function SeededPlantMesh({
  meta,
  position,
  mode,
  onClickGrass,
  bisonPositionsRef,
}: SeededPlantMeshProps) {
  const url = useMemo(() => urlFor(meta.name), [meta.name]);
  const texture = useLoader(THREE.TextureLoader, url) as THREE.Texture;
  const matRef = useRef<THREE.SpriteMaterial>(null);
  const spriteRef = useRef<THREE.Sprite>(null);
  const modeRef = useRef<Mode>(mode);

  const initialScale = useMemo(() => 0.7 + Math.random() * 0.6, []);
  const scaleRef = useRef(initialScale);
  const targetRef = useRef(initialScale);
  const grazeTickRef = useRef(0);

  modeRef.current = mode;

  const planeW = meta.frameWidth * WORLD_PER_PIXEL;
  const planeH = meta.frameHeight * WORLD_PER_PIXEL;

  useEffect(() => {
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.repeat.x = 1 / meta.frames;
    texture.wrapS = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
  }, [texture, meta.frames]);

  useFrame(({ clock }, dt) => {
    const mat = matRef.current;
    if (mat?.map) {
      const frame = Math.floor(clock.elapsedTime * meta.fps) % meta.frames;
      mat.map.offset.x = frame / meta.frames;
    }

    grazeTickRef.current -= dt;
    if (grazeTickRef.current <= 0) {
      grazeTickRef.current = GRAZE_TICK_INTERVAL;
      const bisons = bisonPositionsRef.current;
      for (let b = 0; b < bisons.length; b++) {
        const dx = position[0] - bisons[b].x;
        const dz = position[2] - bisons[b].z;
        if (dx * dx + dz * dz < BISON_GRAZE_RADIUS_SQ) {
          targetRef.current = Math.max(targetRef.current * GRAZE_DECAY, GRAZE_FLOOR);
          break;
        }
      }
    }

    const sprite = spriteRef.current;
    if (sprite) {
      const diff = targetRef.current - scaleRef.current;
      if (Math.abs(diff) > 0.001) {
        scaleRef.current += diff * 0.1;
        const s = scaleRef.current;
        sprite.scale.set(planeW * s, planeH * s, 1);
      }
    }
  });

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    const m = modeRef.current;
    if (m === null || m === "seed" || m === "bison") return;
    e.stopPropagation();

    let next = targetRef.current;
    if (m === "grow") next = Math.min(next * 1.5, 6);
    else if (m === "fire") next = 0;

    targetRef.current = next;
    onClickGrass();
  };

  const handlePointerEnter = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (matRef.current) matRef.current.opacity = OPACITY_HOVER;
  };

  const handlePointerLeave = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (matRef.current) matRef.current.opacity = OPACITY_DEFAULT;
  };

  const spriteY = position[1] + (planeH * initialScale) / 2;

  return (
    <sprite
      ref={spriteRef}
      position={[position[0], spriteY, position[2]]}
      scale={[planeW * initialScale, planeH * initialScale, 1]}
      onClick={handleClick}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      <spriteMaterial
        ref={matRef}
        map={texture}
        transparent
        alphaTest={0.05}
        opacity={OPACITY_DEFAULT}
      />
    </sprite>
  );
}

type SeededGrassProps = {
  plants: SeededPlantData[];
  mode: Mode;
  onClickGrass: () => void;
  bisonPositionsRef: MutableRefObject<BisonPosition[]>;
};

export function SeededGrass({
  plants,
  mode,
  onClickGrass,
  bisonPositionsRef,
}: SeededGrassProps) {
  return (
    <>
      {plants.map((p, i) => {
        const meta = SPRITES[p.typeIndex % SPRITES.length];
        return (
          <SeededPlantMesh
            key={i}
            meta={meta}
            position={p.position}
            mode={mode}
            onClickGrass={onClickGrass}
            bisonPositionsRef={bisonPositionsRef}
          />
        );
      })}
    </>
  );
}
