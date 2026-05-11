import {
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { emojiTexture } from "./lib/emojiTexture";
import {
  SPRITE_TYPE_COUNT,
  type GrassPosEntry,
  type SeedRequest,
} from "./Grass";

type BirdState = "flying" | "descending" | "perched" | "ascending";

type BirdRuntime = {
  id: number;
  state: BirdState;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  targetX: number;
  targetZ: number;
  perchTarget: { x: number; z: number; topY: number } | null;
  perchUntil: number;
  attemptedPerch: boolean;
  seedsRemaining: number;
  nextSeedDropAt: number;
  diesAt: number;
};

type SeedDropFlash = {
  id: number;
  x: number;
  y: number;
  z: number;
  bornAt: number;
  diesAt: number;
};

const GROUND_Y = -10;
const MAX_BIRDS = 4;
const SPAWN_INTERVAL_MIN_S = 12;
const SPAWN_INTERVAL_MAX_S = 30;
const FLY_Y = GROUND_Y + 14;
const SPEED = 6;
const DESCEND_SPEED = 4;
const ASCEND_SPEED = 5;
const SEED_DROPS_MIN = 1;
const SEED_DROPS_MAX = 3;
const PERCH_PROB = 0.4;
const PERCH_DURATION_MIN_S = 4;
const PERCH_DURATION_MAX_S = 12;
const PERCH_MIN_TARGET_SCALE = 1.2;
const PERCH_DENSITY_RADIUS_SQ = 25;
const PERCH_DENSITY_MIN = 4;
const SEED_FLASH_LIFETIME_S = 0.5;
const BIRD_SCALE = 1.6;
const SEED_FLASH_SCALE = 0.8;

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

// Find a perch candidate: densest tall-grass cluster.
function findDensestPerch(
  grassByType: GrassPosEntry[][]
): GrassPosEntry | null {
  // Flatten all candidates that satisfy minimum height.
  const candidates: GrassPosEntry[] = [];
  for (let ti = 0; ti < grassByType.length; ti++) {
    const list = grassByType[ti];
    if (!list) continue;
    for (let pi = 0; pi < list.length; pi++) {
      const p = list[pi];
      if (p.targetScale >= PERCH_MIN_TARGET_SCALE) candidates.push(p);
    }
  }
  if (candidates.length === 0) return null;

  let best: GrassPosEntry | null = null;
  let bestDensity = -1;
  // O(N^2) over candidates is fine — N is at most ~few hundred and this
  // runs once per perch attempt, not per frame.
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    let n = 0;
    for (let j = 0; j < candidates.length; j++) {
      if (i === j) continue;
      const dx = c.x - candidates[j].x;
      const dz = c.z - candidates[j].z;
      if (dx * dx + dz * dz < PERCH_DENSITY_RADIUS_SQ) n++;
    }
    if (n >= PERCH_DENSITY_MIN && n > bestDensity) {
      bestDensity = n;
      best = c;
    }
  }
  return best;
}

type BirdGroupProps = {
  bounds: number;
  grassPositionsRef: MutableRefObject<GrassPosEntry[][]>;
  seedQueueRef: MutableRefObject<SeedRequest[]>;
  birdCountRef?: MutableRefObject<number>;
};

export function BirdGroup({
  bounds,
  grassPositionsRef,
  seedQueueRef,
  birdCountRef,
}: BirdGroupProps) {
  const birdTexture = useMemo(() => emojiTexture("🐦", 128), []);
  const seedTexture = useMemo(() => emojiTexture("🌱", 64), []);

  const runtimeRef = useRef<BirdRuntime[]>([]);
  const flashRef = useRef<SeedDropFlash[]>([]);
  const spriteRefs = useRef<Array<THREE.Sprite | null>>([]);
  const flashMatRefs = useRef<Array<THREE.SpriteMaterial | null>>([]);

  const nextIdRef = useRef(0);
  const nextFlashIdRef = useRef(0);
  const spawnTimerRef = useRef(rand(SPAWN_INTERVAL_MIN_S, SPAWN_INTERVAL_MAX_S));
  const [, bumpVersion] = useState(0);

  const half = bounds * 0.5;

  function spawnBird(nowS: number): BirdRuntime {
    // pick an entry edge and target on the opposite side
    const entryHorizontal = Math.random() < 0.5;
    const dir = Math.random() < 0.5 ? 1 : -1;
    const enterPad = 8;
    const x = entryHorizontal ? -dir * (half + enterPad) : rand(-half, half);
    const z = entryHorizontal ? rand(-half, half) : -dir * (half + enterPad);
    const targetX = entryHorizontal
      ? dir * (half + enterPad)
      : rand(-half, half);
    const targetZ = entryHorizontal
      ? rand(-half, half)
      : dir * (half + enterPad);
    const dx = targetX - x;
    const dz = targetZ - z;
    const d = Math.sqrt(dx * dx + dz * dz) || 1;
    const totalDistance = d;

    const seedDrops = Math.floor(rand(SEED_DROPS_MIN, SEED_DROPS_MAX + 1));
    const traversalTime = totalDistance / SPEED;
    const nextDropDelay = traversalTime / (seedDrops + 1);

    return {
      id: nextIdRef.current++,
      state: "flying",
      x,
      y: FLY_Y,
      z,
      vx: (dx / d) * SPEED,
      vy: 0,
      vz: (dz / d) * SPEED,
      targetX,
      targetZ,
      perchTarget: null,
      perchUntil: 0,
      attemptedPerch: false,
      seedsRemaining: seedDrops,
      nextSeedDropAt: nowS + nextDropDelay,
      diesAt: nowS + traversalTime + 5,
    };
  }

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const rts = runtimeRef.current;
    const flashes = flashRef.current;
    let changed = false;

    // 1) spawn
    spawnTimerRef.current -= dt;
    if (spawnTimerRef.current <= 0 && rts.length < MAX_BIRDS) {
      rts.push(spawnBird(t));
      spawnTimerRef.current = rand(
        SPAWN_INTERVAL_MIN_S,
        SPAWN_INTERVAL_MAX_S
      );
      changed = true;
    }

    // 2) per-bird state machine
    for (let i = rts.length - 1; i >= 0; i--) {
      const b = rts[i];

      // global timeout (e.g. perch never ended)
      if (t > b.diesAt && b.state !== "perched") {
        rts.splice(i, 1);
        changed = true;
        continue;
      }

      switch (b.state) {
        case "flying": {
          b.x += b.vx * dt;
          b.y = FLY_Y;
          b.z += b.vz * dt;

          // seed drop
          if (b.seedsRemaining > 0 && t >= b.nextSeedDropAt) {
            const sx = Math.max(-half, Math.min(half, b.x));
            const sz = Math.max(-half, Math.min(half, b.z));
            seedQueueRef.current.push({
              typeIndex: Math.floor(Math.random() * SPRITE_TYPE_COUNT),
              x: sx,
              z: sz,
            });
            flashes.push({
              id: nextFlashIdRef.current++,
              x: sx,
              y: FLY_Y - 1,
              z: sz,
              bornAt: t,
              diesAt: t + SEED_FLASH_LIFETIME_S,
            });
            b.seedsRemaining--;
            const remaining = b.seedsRemaining;
            if (remaining > 0) {
              const dx = b.targetX - b.x;
              const dz = b.targetZ - b.z;
              const d = Math.sqrt(dx * dx + dz * dz) || 1;
              const remainingTime = d / SPEED;
              b.nextSeedDropAt = t + remainingTime / (remaining + 1);
            }
            changed = true;
          }

          // perch attempt (once per flight, mid-trip)
          if (
            !b.attemptedPerch &&
            Math.random() < PERCH_PROB * dt * 0.5
          ) {
            b.attemptedPerch = true;
            const perch = findDensestPerch(grassPositionsRef.current);
            if (perch) {
              b.perchTarget = {
                x: perch.x,
                z: perch.z,
                topY: perch.topY,
              };
              const dx = perch.x - b.x;
              const dz = perch.z - b.z;
              const d = Math.sqrt(dx * dx + dz * dz) || 1;
              b.vx = (dx / d) * DESCEND_SPEED;
              b.vz = (dz / d) * DESCEND_SPEED;
              b.state = "descending";
            }
          }

          // off-edge: despawn
          const offEdge = half + 14;
          if (
            b.x > offEdge ||
            b.x < -offEdge ||
            b.z > offEdge ||
            b.z < -offEdge
          ) {
            rts.splice(i, 1);
            changed = true;
            continue;
          }
          break;
        }
        case "descending": {
          if (!b.perchTarget) {
            b.state = "flying";
            break;
          }
          const dx = b.perchTarget.x - b.x;
          const dz = b.perchTarget.z - b.z;
          const dy = b.perchTarget.topY - b.y;
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (d < 0.5) {
            b.x = b.perchTarget.x;
            b.y = b.perchTarget.topY;
            b.z = b.perchTarget.z;
            b.state = "perched";
            b.perchUntil =
              t + rand(PERCH_DURATION_MIN_S, PERCH_DURATION_MAX_S);
            // extend life so the perch can run to completion
            b.diesAt = b.perchUntil + 30;
          } else {
            const inv = 1 / d;
            b.x += dx * inv * DESCEND_SPEED * dt;
            b.y += dy * inv * DESCEND_SPEED * dt;
            b.z += dz * inv * DESCEND_SPEED * dt;
          }
          break;
        }
        case "perched": {
          if (t >= b.perchUntil) {
            b.state = "ascending";
            const dx = b.targetX - b.x;
            const dz = b.targetZ - b.z;
            const d = Math.sqrt(dx * dx + dz * dz) || 1;
            b.vx = (dx / d) * ASCEND_SPEED;
            b.vz = (dz / d) * ASCEND_SPEED;
            b.diesAt = t + 30;
          }
          break;
        }
        case "ascending": {
          b.x += b.vx * dt;
          b.z += b.vz * dt;
          b.y += ASCEND_SPEED * dt;
          if (b.y >= FLY_Y) {
            b.y = FLY_Y;
            b.state = "flying";
          }
          break;
        }
      }

      const sprite = spriteRefs.current[i];
      if (sprite) sprite.position.set(b.x, b.y, b.z);
    }

    // 3) flash lifecycles
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i];
      f.y -= 6 * dt; // little fall
      if (t > f.diesAt) {
        flashes.splice(i, 1);
        changed = true;
        continue;
      }
      const mat = flashMatRefs.current[i];
      if (mat) {
        const k = 1 - (t - f.bornAt) / SEED_FLASH_LIFETIME_S;
        mat.opacity = Math.max(0, k);
      }
    }

    if (birdCountRef) birdCountRef.current = rts.length;
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
          scale={[BIRD_SCALE, BIRD_SCALE, 1]}
        >
          <spriteMaterial map={birdTexture} transparent depthWrite={false} />
        </sprite>
      ))}
      {flashRef.current.map((f, i) => (
        <sprite
          key={`s${f.id}`}
          position={[f.x, f.y, f.z]}
          scale={[SEED_FLASH_SCALE, SEED_FLASH_SCALE, 1]}
        >
          <spriteMaterial
            ref={(el) => {
              flashMatRefs.current[i] = el;
            }}
            map={seedTexture}
            transparent
            opacity={1}
            depthWrite={false}
          />
        </sprite>
      ))}
    </>
  );
}

// ─── Dweller birds ───────────────────────────────────────────────────────────
// Small birds that wander slowly near grass clusters, hopping between plants
// at low altitude. Purely visual — no seed drops, no perching state machine.

type DwellerRuntime = {
  id: number;
  x: number;
  y: number;
  z: number;
  targetX: number;
  targetZ: number;
  retargetAt: number;
  // hop state — progress [0..1] through a single hop arc
  hopProgress: number; // -1 = idle (at rest)
  hopStartX: number;
  hopStartZ: number;
  hopPeak: number;    // max Y lift in world units
  hopSpeed: number;   // progress units per second
};

const MAX_DWELLERS = 10;
const DWELLER_SCALE = 0.9;
const DWELLER_GROUND_Y = -9.6;  // resting y
const DWELLER_HOP_PEAK_MIN = 0.4;
const DWELLER_HOP_PEAK_MAX = 1.2;
const DWELLER_HOP_SPEED_MIN = 1.8; // progress/s — controls hop duration
const DWELLER_HOP_SPEED_MAX = 3.0;
const DWELLER_RETARGET_MIN_S = 1.5;
const DWELLER_RETARGET_MAX_S = 5;
const DWELLER_REACH_SQ = 0.5 * 0.5;

type DwellerGroupProps = {
  bounds: number;
  grassPositionsRef: MutableRefObject<GrassPosEntry[][]>;
  dwellerCountRef?: MutableRefObject<number>;
};

export function DwellerGroup({ bounds, grassPositionsRef, dwellerCountRef }: DwellerGroupProps) {
  const texture = useMemo(() => emojiTexture("🐦", 96), []);
  const runtimeRef = useRef<DwellerRuntime[]>([]);
  const spriteRefs = useRef<Array<THREE.Sprite | null>>([]);
  const nextIdRef = useRef(0);
  const spawnTimerRef = useRef(8 + Math.random() * 8); // first bird after 8–16s
  const [, bumpVersion] = useState(0);
  const half = bounds * 0.5;

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const rts = runtimeRef.current;
    const allGrass = grassPositionsRef.current;
    let changed = false;

    // spawn one dweller at a time until the flock is full
    spawnTimerRef.current -= dt;
    if (spawnTimerRef.current <= 0 && rts.length < MAX_DWELLERS) {
      const x = (Math.random() - 0.5) * bounds;
      const z = (Math.random() - 0.5) * bounds;
      rts.push({
        id: nextIdRef.current++,
        x, y: DWELLER_GROUND_Y, z,
        targetX: x, targetZ: z,
        retargetAt: t + Math.random() * 2,
        hopProgress: -1,
        hopStartX: x, hopStartZ: z,
        hopPeak: 0.7, hopSpeed: 2.2,
      });
      // stagger next arrival: 5–12s between birds
      spawnTimerRef.current = 5 + Math.random() * 7;
      changed = true;
    }
    if (dwellerCountRef) dwellerCountRef.current = rts.length;

    for (let i = 0; i < rts.length; i++) {
      const d = rts[i];

      if (d.hopProgress >= 0) {
        // ── mid-hop ──────────────────────────────────────────────────────
        d.hopProgress = Math.min(1, d.hopProgress + d.hopSpeed * dt);
        const p = d.hopProgress;
        // lerp xz along arc
        d.x = d.hopStartX + (d.targetX - d.hopStartX) * p;
        d.z = d.hopStartZ + (d.targetZ - d.hopStartZ) * p;
        // parabolic y: sin(π*p) peaks at p=0.5
        d.y = DWELLER_GROUND_Y + d.hopPeak * Math.sin(Math.PI * p);

        if (d.hopProgress >= 1) {
          // landed
          d.x = d.targetX;
          d.z = d.targetZ;
          d.y = DWELLER_GROUND_Y;
          d.hopProgress = -1;
          d.retargetAt = t + DWELLER_RETARGET_MIN_S + Math.random() * (DWELLER_RETARGET_MAX_S - DWELLER_RETARGET_MIN_S);
        }
      } else if (t >= d.retargetAt) {
        // ── idle → pick next hop target ──────────────────────────────────
        let best: GrassPosEntry | null = null;
        let bestScore = Infinity;
        for (let ti = 0; ti < allGrass.length; ti++) {
          const list = allGrass[ti];
          if (!list) continue;
          for (let pi = 0; pi < list.length; pi++) {
            const p = list[pi];
            const dx = p.x - d.x;
            const dz = p.z - d.z;
            const score = (dx * dx + dz * dz) / (Math.random() * 0.5 + 0.5);
            if (score < bestScore) { bestScore = score; best = p; }
          }
        }
        if (best) {
          const angle = Math.random() * Math.PI * 2;
          const r = 0.5 + Math.random() * 2;
          d.targetX = Math.max(-half, Math.min(half, best.x + Math.cos(angle) * r));
          d.targetZ = Math.max(-half, Math.min(half, best.z + Math.sin(angle) * r));
        } else {
          d.targetX = Math.max(-half, Math.min(half, d.x + (Math.random() - 0.5) * 6));
          d.targetZ = Math.max(-half, Math.min(half, d.z + (Math.random() - 0.5) * 6));
        }
        // only hop if the target is meaningfully different
        const dx = d.targetX - d.x;
        const dz = d.targetZ - d.z;
        if (dx * dx + dz * dz > DWELLER_REACH_SQ) {
          d.hopStartX = d.x;
          d.hopStartZ = d.z;
          d.hopPeak = DWELLER_HOP_PEAK_MIN + Math.random() * (DWELLER_HOP_PEAK_MAX - DWELLER_HOP_PEAK_MIN);
          d.hopSpeed = DWELLER_HOP_SPEED_MIN + Math.random() * (DWELLER_HOP_SPEED_MAX - DWELLER_HOP_SPEED_MIN);
          d.hopProgress = 0;
        } else {
          // tiny nudge — just wait a bit
          d.retargetAt = t + 1 + Math.random() * 2;
        }
        changed = true;
      }

      const sprite = spriteRefs.current[i];
      if (sprite) sprite.position.set(d.x, d.y, d.z);
    }

    if (changed) bumpVersion((v) => v + 1);
  });

  return (
    <>
      {runtimeRef.current.map((d, i) => (
        <sprite
          key={d.id}
          ref={(el) => { spriteRefs.current[i] = el; }}
          position={[d.x, d.y, d.z]}
          scale={[DWELLER_SCALE, DWELLER_SCALE, 1]}
        >
          <spriteMaterial map={texture} transparent opacity={0.75} depthWrite={false} />
        </sprite>
      ))}
    </>
  );
}
