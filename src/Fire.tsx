import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import * as THREE from "three";
import { useFrame, useLoader } from "@react-three/fiber";
import fireMeta from "./assets/sprites/fire.json";
import firePngUrl from "./assets/sprites/fire.png";
import { SPRITE_TYPE_COUNT, type SeedRequest } from "./Grass";

export type FireRequest = {
  x: number;
  z: number;
};

export type FirePosition = {
  x: number;
  z: number;
  radius: number;
};

type FireRuntime = {
  id: number;
  x: number;
  z: number;
  ageS: number;
  intensity: number;
  radius: number;
  spreadAt: number;
  spawnedChildren: number;
  conflagrationId: number; // shared by parent + descendants for the family cap
};

const GROUND_Y = -10;
// Visible size at intensity=1. The runtime sprite scale is
// FIRE_BASE_*_{W,H} * (FIRE_SIZE_MIN_MULT + intensity * FIRE_SIZE_PEAK_BOOST),
// so a fresh fire renders at ~1.5x base height (~18 world units tall).
const FIRE_BASE_HEIGHT = 12;
const FIRE_BASE_WIDTH =
  FIRE_BASE_HEIGHT * (fireMeta.frameWidth / fireMeta.frameHeight);
const FIRE_SIZE_MIN_MULT = 0.7;
const FIRE_SIZE_PEAK_BOOST = 0.8;
// Muted, slightly warm terra-cotta — same desaturation approach used for
// bison so the sprite doesn't pop against the soft green palette.
const FIRE_TINT = "#c97a4e";

const FIRE_INITIAL_INTENSITY = 1;
const FIRE_INITIAL_RADIUS = 4;
const FIRE_RADIUS_GROW_PER_S = 0.6;
// Whole-cluster duration target is 5–10s. Per-fire lifetime is 3.5s and
// spreading is gated to the first ~2s of cluster age, so the last spawn
// happens by ~t=2 and dies by ~t=5.5 — leaving a tail of ~1–2s for the
// final members to fade.
const FIRE_LIFETIME_S = 3.5;
const FIRE_SPREAD_INTERVAL_MIN = 0.5;
const FIRE_SPREAD_INTERVAL_MAX = 1.1;
const FIRE_SPREAD_DISTANCE_MIN = 3;
const FIRE_SPREAD_DISTANCE_MAX = 9;
const FIRE_MAX_CHILDREN = 4;
const FIRE_MAX_FAMILY = 12;
// Hard lifetime cap on total fires that ever exist in a single cluster.
// Without this, surviving members refill the FIRE_MAX_FAMILY slot as old
// fires die, so the cluster never burns out.
const FIRE_MAX_TOTAL_PER_CLUSTER = 14;
// No new spreading after this much cluster age. Caps total cluster duration
// at FIRE_CLUSTER_SPREAD_WINDOW_S + FIRE_LIFETIME_S, keeping it in the
// 5–10s band the simulation expects.
const FIRE_CLUSTER_SPREAD_WINDOW_S = 2.5;
// Per-cluster random vigor multiplier rolled at birth. Scales the spread
// window, distance, and lifetime caps so some conflagrations fizzle into
// 3–4 fires while others sprawl into a dozen, without breaking the 5–10s
// total-duration envelope (window * max + lifetime <= 10s for max=1.6).
const FIRE_VIGOR_MIN = 0.6;
const FIRE_VIGOR_MAX = 1.6;

// Renewal is deferred until the cluster is fully out (no live members).
// Seeds are produced per recorded death point so growth maps onto the
// burned area, but they all enter the seed queue together at cluster end.
const POST_FIRE_SEEDLINGS_PER_DEATH = 3;
const POST_FIRE_RENEWAL_RADIUS = 6;

function nextSpreadDelay(): number {
  return (
    FIRE_SPREAD_INTERVAL_MIN +
    Math.random() *
      (FIRE_SPREAD_INTERVAL_MAX - FIRE_SPREAD_INTERVAL_MIN)
  );
}

type FireGroupProps = {
  bounds: number;
  fireQueueRef: MutableRefObject<FireRequest[]>;
  firePositionsRef: MutableRefObject<FirePosition[]>;
  seedQueueRef: MutableRefObject<SeedRequest[]>;
  fireCountRef?: MutableRefObject<number>;
};

export function FireGroup({
  bounds,
  fireQueueRef,
  firePositionsRef,
  seedQueueRef,
  fireCountRef,
}: FireGroupProps) {
  const sourceTexture = useLoader(THREE.TextureLoader, firePngUrl) as THREE.Texture;

  const texture = useMemo(() => {
    const t = sourceTexture.clone();
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.wrapS = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.repeat.x = 1 / fireMeta.frames;
    t.needsUpdate = true;
    return t;
  }, [sourceTexture]);

  useEffect(() => {
    return () => texture.dispose();
  }, [texture]);

  const runtimeRef = useRef<FireRuntime[]>([]);
  const spriteRefs = useRef<Array<THREE.Sprite | null>>([]);
  const matRefs = useRef<Array<THREE.SpriteMaterial | null>>([]);
  const nextIdRef = useRef(0);
  const nextConflagrationIdRef = useRef(0);
  // Lifetime spawn count per conflagration. Persists past death of individual
  // fires so clusters can't self-replenish past FIRE_MAX_TOTAL_PER_CLUSTER.
  const clusterSpawnsRef = useRef<Map<number, number>>(new Map());
  // When the cluster's first member was born. Used to gate spreading by
  // cluster age so the conflagration burns out within FIRE_CLUSTER_SPREAD_WINDOW_S.
  const clusterStartRef = useRef<Map<number, number>>(new Map());
  // Per-cluster random multiplier rolled at the cluster's first spawn. A
  // single value covers all spread-related caps (distance, window, family,
  // total) so the cluster has a coherent "small / medium / sprawling"
  // identity instead of each parameter rolling independently.
  const clusterVigorRef = useRef<Map<number, number>>(new Map());
  // Death points collected during the burn. Renewal seeds for the entire
  // cluster are deferred and pushed to seedQueueRef only once the last
  // member dies — i.e. growth doesn't begin until the fire is fully out.
  const clusterDeathPointsRef = useRef<
    Map<number, Array<{ x: number; z: number }>>
  >(new Map());
  // Bumped whenever the runtime list changes so React reconciles new/removed
  // sprite elements; their positions/scales come from the useFrame loop.
  const [, bumpVersion] = useState(0);

  const half = bounds * 0.5;

  function familyCount(conflagrationId: number): number {
    let n = 0;
    const rts = runtimeRef.current;
    for (let i = 0; i < rts.length; i++) {
      if (rts[i].conflagrationId === conflagrationId) n++;
    }
    return n;
  }

  function clusterTotalSpawns(conflagrationId: number): number {
    return clusterSpawnsRef.current.get(conflagrationId) ?? 0;
  }

  function clusterAgeS(conflagrationId: number, nowS: number): number {
    const startedAt = clusterStartRef.current.get(conflagrationId);
    return startedAt === undefined ? 0 : nowS - startedAt;
  }

  function clusterVigor(conflagrationId: number): number {
    return clusterVigorRef.current.get(conflagrationId) ?? 1;
  }

  function spawnRuntime(
    x: number,
    z: number,
    conflagrationId: number,
    nowS: number
  ): FireRuntime {
    const m = clusterSpawnsRef.current;
    m.set(conflagrationId, (m.get(conflagrationId) ?? 0) + 1);
    if (!clusterStartRef.current.has(conflagrationId)) {
      clusterStartRef.current.set(conflagrationId, nowS);
      clusterVigorRef.current.set(
        conflagrationId,
        FIRE_VIGOR_MIN +
          Math.random() * (FIRE_VIGOR_MAX - FIRE_VIGOR_MIN)
      );
    }
    return {
      id: nextIdRef.current++,
      x: Math.max(-half, Math.min(half, x)),
      z: Math.max(-half, Math.min(half, z)),
      ageS: 0,
      intensity: FIRE_INITIAL_INTENSITY,
      radius: FIRE_INITIAL_RADIUS,
      spreadAt: nowS + nextSpreadDelay(),
      spawnedChildren: 0,
      conflagrationId,
    };
  }

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const frame = Math.floor(t * fireMeta.fps) % fireMeta.frames;
    texture.offset.x = frame / fireMeta.frames;

    const rts = runtimeRef.current;
    let changed = false;

    // 1) drain new fire requests (clicks + lightning)
    const queue = fireQueueRef.current;
    while (queue.length > 0) {
      const req = queue.shift()!;
      const cid = nextConflagrationIdRef.current++;
      rts.push(spawnRuntime(req.x, req.z, cid, t));
      if (fireCountRef) fireCountRef.current += 1;
      changed = true;
    }

    // 2) age, spread, die
    for (let i = rts.length - 1; i >= 0; i--) {
      const r = rts[i];
      r.ageS += dt;
      r.intensity = Math.max(0, 1 - r.ageS / FIRE_LIFETIME_S);
      r.radius = FIRE_INITIAL_RADIUS + FIRE_RADIUS_GROW_PER_S * r.ageS;

      // Spread is gated by all of:
      //   - per-fire timer fired
      //   - per-fire children budget not yet exhausted
      //   - cluster's concurrent and lifetime spawn caps not reached
      //   - cluster is still in its early (spreading) phase
      // Once cluster age exceeds the spread window, no more children can
      // spawn anywhere in the cluster — surviving members age out and the
      // whole conflagration is gone within FIRE_LIFETIME_S.
      // The cluster's per-spawn vigor multiplier scales the spread caps and
      // distance, so some conflagrations stay tight while others sprawl.
      const v = clusterVigor(r.conflagrationId);
      const familyCap = Math.max(1, Math.round(FIRE_MAX_FAMILY * v));
      const totalCap = Math.max(1, Math.round(FIRE_MAX_TOTAL_PER_CLUSTER * v));
      const windowS = FIRE_CLUSTER_SPREAD_WINDOW_S * v;
      if (
        t >= r.spreadAt &&
        r.spawnedChildren < FIRE_MAX_CHILDREN &&
        clusterAgeS(r.conflagrationId, t) < windowS &&
        familyCount(r.conflagrationId) < familyCap &&
        clusterTotalSpawns(r.conflagrationId) < totalCap
      ) {
        const angle = Math.random() * Math.PI * 2;
        const dist =
          (FIRE_SPREAD_DISTANCE_MIN +
            Math.random() *
              (FIRE_SPREAD_DISTANCE_MAX - FIRE_SPREAD_DISTANCE_MIN)) *
          v;
        const cx = r.x + Math.cos(angle) * dist;
        const cz = r.z + Math.sin(angle) * dist;
        rts.push(spawnRuntime(cx, cz, r.conflagrationId, t));
        r.spawnedChildren++;
        r.spreadAt = t + nextSpreadDelay();
        if (fireCountRef) fireCountRef.current += 1;
        changed = true;
      }

      if (r.ageS >= FIRE_LIFETIME_S) {
        const cid = r.conflagrationId;
        // Defer renewal: record this fire's death point. Seeds are pushed
        // only once the entire cluster has burned out (see below) so growth
        // doesn't start while the patch is still on fire.
        const points =
          clusterDeathPointsRef.current.get(cid) ??
          (clusterDeathPointsRef.current.set(cid, []).get(cid) as Array<{
            x: number;
            z: number;
          }>);
        points.push({ x: r.x, z: r.z });

        rts.splice(i, 1);

        if (familyCount(cid) === 0) {
          // last member of the cluster died — flush all renewal seeds now.
          for (const p of points) {
            for (let s = 0; s < POST_FIRE_SEEDLINGS_PER_DEATH; s++) {
              const angle = Math.random() * Math.PI * 2;
              const d = Math.random() * POST_FIRE_RENEWAL_RADIUS;
              const sx = Math.max(
                -half,
                Math.min(half, p.x + Math.cos(angle) * d)
              );
              const sz = Math.max(
                -half,
                Math.min(half, p.z + Math.sin(angle) * d)
              );
              seedQueueRef.current.push({
                typeIndex: Math.floor(Math.random() * SPRITE_TYPE_COUNT),
                x: sx,
                z: sz,
              });
            }
          }
          // drop all per-cluster bookkeeping so ids don't pile up
          clusterSpawnsRef.current.delete(cid);
          clusterStartRef.current.delete(cid);
          clusterDeathPointsRef.current.delete(cid);
          clusterVigorRef.current.delete(cid);
        }
        changed = true;
      }
    }

    // 3) publish active fire footprints for GrassType to read
    const out = firePositionsRef.current;
    out.length = rts.length;
    for (let i = 0; i < rts.length; i++) {
      const r = rts[i];
      let entry = out[i];
      if (!entry) {
        entry = { x: 0, z: 0, radius: 0 };
        out[i] = entry;
      }
      entry.x = r.x;
      entry.z = r.z;
      entry.radius = r.radius;
    }

    // 4) sprite pose updates
    for (let i = 0; i < rts.length; i++) {
      const r = rts[i];
      const mult = FIRE_SIZE_MIN_MULT + r.intensity * FIRE_SIZE_PEAK_BOOST;
      const sprite = spriteRefs.current[i];
      if (sprite) {
        const h = FIRE_BASE_HEIGHT * mult;
        const w = FIRE_BASE_WIDTH * mult;
        sprite.position.set(r.x, GROUND_Y + h / 2, r.z);
        sprite.scale.set(w, h, 1);
      }
      const mat = matRefs.current[i];
      if (mat) {
        mat.opacity = 0.45 + r.intensity * 0.3;
      }
    }

    if (changed) bumpVersion((v) => v + 1);
  });

  return (
    <>
      {runtimeRef.current.map((r, i) => (
        <sprite
          key={r.id}
          ref={(el) => {
            spriteRefs.current[i] = el;
          }}
          position={[r.x, GROUND_Y + FIRE_BASE_HEIGHT, r.z]}
          scale={[FIRE_BASE_WIDTH, FIRE_BASE_HEIGHT, 1]}
        >
          <spriteMaterial
            ref={(el) => {
              matRefs.current[i] = el;
            }}
            map={texture}
            transparent
            opacity={0.75}
            color={FIRE_TINT}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </sprite>
      ))}
    </>
  );
}
