import {
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import * as THREE from "three";
import { useFrame, useLoader } from "@react-three/fiber";
import butterflySheetUrl from "./assets/sprites/butterfly.png";
import butterflyMeta from "./assets/sprites/butterfly.json";
import type { GrassPosEntry } from "./Grass";

export type PollinatorPosition = { x: number; z: number };

type ButterflyRuntime = {
  id: number;
  x: number;
  y: number;
  z: number;
  targetX: number;
  targetZ: number;
  retargetAt: number;
  bornAt: number;
  diesAt: number;
};

const GROUND_Y = -10;
const FLY_Y_MIN = GROUND_Y + 1;
const FLY_Y_MAX = GROUND_Y + 5;
const MAX_BUTTERFLIES = 8;
const SPAWN_INTERVAL_MIN_S = 4;
const SPAWN_INTERVAL_MAX_S = 9;
const LIFETIME_MIN_S = 25;
const LIFETIME_MAX_S = 45;
const SPEED = 2;
const FLUTTER_AMP = 0.4;
const RETARGET_INTERVAL_MIN_S = 2;
const RETARGET_INTERVAL_MAX_S = 4;
const REACH_RADIUS_SQ = 0.6 * 0.6;
const BUTTERFLY_SCALE = 1.1;
const BUTTERFLY_ASPECT =
  butterflyMeta.frameWidth / butterflyMeta.frameHeight;

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

// Pick a random live grass position across all types. Returns null if no
// live grass exists yet (very early in the run).
function randomLiveGrass(
  grassByType: GrassPosEntry[][]
): GrassPosEntry | null {
  let total = 0;
  for (let ti = 0; ti < grassByType.length; ti++) {
    const list = grassByType[ti];
    if (list) total += list.length;
  }
  if (total === 0) return null;
  let pick = Math.floor(Math.random() * total);
  for (let ti = 0; ti < grassByType.length; ti++) {
    const list = grassByType[ti];
    if (!list) continue;
    if (pick < list.length) return list[pick];
    pick -= list.length;
  }
  return null;
}

type ButterflyGroupProps = {
  bounds: number;
  grassPositionsRef: MutableRefObject<GrassPosEntry[][]>;
  pollinatorPositionsRef: MutableRefObject<PollinatorPosition[]>;
  butterflyCountRef?: MutableRefObject<number>;
};

export function ButterflyGroup({
  bounds,
  grassPositionsRef,
  pollinatorPositionsRef,
  butterflyCountRef,
}: ButterflyGroupProps) {
  const texture = useLoader(THREE.TextureLoader, butterflySheetUrl);
  texture.repeat.set(1 / butterflyMeta.frames, 1);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;

  const runtimeRef = useRef<ButterflyRuntime[]>([]);
  const spriteRefs = useRef<Array<THREE.Sprite | null>>([]);
  const nextIdRef = useRef(0);
  const spawnTimerRef = useRef(rand(SPAWN_INTERVAL_MIN_S, SPAWN_INTERVAL_MAX_S));
  const [, bumpVersion] = useState(0);

  const half = bounds * 0.5;

  function spawnButterfly(nowS: number): ButterflyRuntime {
    const x = rand(-half, half);
    const z = rand(-half, half);
    return {
      id: nextIdRef.current++,
      x,
      y: rand(FLY_Y_MIN, FLY_Y_MAX),
      z,
      targetX: x,
      targetZ: z,
      retargetAt: nowS, // retarget immediately
      bornAt: nowS,
      diesAt: nowS + rand(LIFETIME_MIN_S, LIFETIME_MAX_S),
    };
  }

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const rts = runtimeRef.current;
    let changed = false;

    // 1) spawn
    spawnTimerRef.current -= dt;
    if (spawnTimerRef.current <= 0 && rts.length < MAX_BUTTERFLIES) {
      rts.push(spawnButterfly(t));
      spawnTimerRef.current = rand(
        SPAWN_INTERVAL_MIN_S,
        SPAWN_INTERVAL_MAX_S
      );
      changed = true;
    }

    // 2) integrate / retarget / despawn
    for (let i = rts.length - 1; i >= 0; i--) {
      const b = rts[i];
      if (t > b.diesAt) {
        rts.splice(i, 1);
        changed = true;
        continue;
      }

      // retarget if scheduled or close enough to current target
      const tdx = b.targetX - b.x;
      const tdz = b.targetZ - b.z;
      const distSq = tdx * tdx + tdz * tdz;
      if (t >= b.retargetAt || distSq < REACH_RADIUS_SQ) {
        const target = randomLiveGrass(grassPositionsRef.current);
        if (target) {
          b.targetX = target.x;
          b.targetZ = target.z;
        } else {
          b.targetX = rand(-half, half);
          b.targetZ = rand(-half, half);
        }
        b.retargetAt = t + rand(RETARGET_INTERVAL_MIN_S, RETARGET_INTERVAL_MAX_S);
      }

      // step toward target with flutter
      const dx = b.targetX - b.x;
      const dz = b.targetZ - b.z;
      const d = Math.sqrt(dx * dx + dz * dz) || 1;
      b.x += (dx / d) * SPEED * dt;
      b.z += (dz / d) * SPEED * dt;
      b.x += Math.sin(t * 6 + b.id) * FLUTTER_AMP * dt;
      b.z += Math.cos(t * 5 + b.id * 2) * FLUTTER_AMP * dt;
      b.y =
        FLY_Y_MIN +
        (FLY_Y_MAX - FLY_Y_MIN) *
          (0.5 + 0.5 * Math.sin(t * 2 + b.id));

      const sprite = spriteRefs.current[i];
      if (sprite) {
        sprite.position.set(b.x, b.y, b.z);
      }
    }

    // 3) publish pollinator positions
    const out = pollinatorPositionsRef.current;
    out.length = rts.length;
    for (let i = 0; i < rts.length; i++) {
      let entry = out[i];
      if (!entry) {
        entry = { x: 0, z: 0 };
        out[i] = entry;
      }
      entry.x = rts[i].x;
      entry.z = rts[i].z;
    }
    if (butterflyCountRef) butterflyCountRef.current = rts.length;

    // advance sprite-sheet frame
    const frame =
      Math.floor(t * butterflyMeta.fps) % butterflyMeta.frames;
    texture.offset.x = frame / butterflyMeta.frames;
    texture.needsUpdate = true;

    if (changed) bumpVersion((v) => v + 1);
  });

  return (
    <>
      {runtimeRef.current.map((b, i) => (
        <sprite
          key={b.id}
          ref={(el) => {
            spriteRefs.current[i] = el;
          }}
          position={[b.x, b.y, b.z]}
          scale={[BUTTERFLY_SCALE * BUTTERFLY_ASPECT, BUTTERFLY_SCALE, 1]}
        >
          <spriteMaterial
            map={texture}
            color={new THREE.Color(0.6, 0.6, 0.6)}
            transparent
            depthWrite={false}
          />
        </sprite>
      ))}
    </>
  );
}
