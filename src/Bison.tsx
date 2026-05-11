import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { useFrame, useLoader } from "@react-three/fiber";
import grazeMeta from "./assets/sprites/graze.json";
import grazePngUrl from "./assets/sprites/graze.png";
import type { GrassPosEntry } from "./Grass";

export type BisonSpawn = {
  id: number;
  initialX: number;
  initialZ: number;
  isCalf?: boolean;
};

export type BisonPosition = { x: number; z: number; fullness: number };

type BisonRuntime = {
  id: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  facing: 1 | -1;
  fullness: number;        // [0..1]
  starvingForS: number;    // accumulator below STARVING_THRESHOLD
  lastReproduceAt: number; // sec
  pairBuildupS: number;    // accumulator while paired with a fed adult
  isCalf: boolean;
  growUpAt: number;        // remaining seconds until adult
  nextTurnAt: number;
  leaving: boolean;        // true once onLeave was fired (one-shot guard)
};

const GROUND_Y = -10;
const BISON_HEIGHT = 8;
const BISON_WIDTH =
  BISON_HEIGHT * (grazeMeta.frameWidth / grazeMeta.frameHeight);
const BASE_SPEED = 6;
const HUNGRY_SPEED_MULT = 1.4;
const TURN_MIN_S = 2;
const TURN_RANGE_S = 3;

// Hunger / fullness model.
const FULLNESS_DECAY_PER_S = 0.005;
const FULLNESS_PER_GRAZE_PER_S = 0.08;
const HUNGRY_THRESHOLD = 0.7;
const STARVING_THRESHOLD = 0.2;
const STARVE_LEAVE_AFTER_S = 30;

// Reproduction.
const REPRODUCE_FULLNESS_MIN = 0.8;
const REPRODUCE_PROXIMITY = 6;
const REPRODUCE_PROXIMITY_SQ = REPRODUCE_PROXIMITY * REPRODUCE_PROXIMITY;
const REPRODUCE_DURATION_S = 8;
const REPRODUCE_COOLDOWN_S = 30;

// Calves.
const CALF_SCALE = 0.55;
const CALF_GROW_UP_S = 60;
const CALF_INITIAL_FULLNESS = 0.7;
const ADULT_INITIAL_FULLNESS_MIN = 0.6;
const ADULT_INITIAL_FULLNESS_MAX = 0.9;

// Hunger seeking — must match Grass.tsx BISON_GRAZE_RADIUS_SQ for the
// "currently grazing" check to align with grass-side biting behavior.
const BISON_GRAZE_RADIUS_SQ = 36;
const HUNGER_SEEK_MIN_TARGET = 0.5; // only chase plants taller than this scale

// Visual.
const OPACITY_FED = 0.7;
const OPACITY_HUNGRY = 0.55;
const OPACITY_STARVING = 0.4;

function pickHeading(speed: number): { vx: number; vz: number } {
  const a = Math.random() * Math.PI * 2;
  return { vx: Math.cos(a) * speed, vz: Math.sin(a) * speed };
}

// Build a clone of the source texture with the requested horizontal repeat sign.
// THREE.Sprite ignores negative scale.x (uses length() on scale internally), so
// we flip via the texture's UV transform instead.
function makeBisonTexture(source: THREE.Texture, mirror: boolean): THREE.Texture {
  const t = source.clone();
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.repeat.x = (mirror ? -1 : 1) / grazeMeta.frames;
  t.needsUpdate = true;
  return t;
}

// Find nearest live tall plant across all grass types. O(N_total_live) per call.
function nearestTallGrass(
  x: number,
  z: number,
  grassByType: GrassPosEntry[][]
): GrassPosEntry | null {
  let bestSq = Infinity;
  let best: GrassPosEntry | null = null;
  for (let ti = 0; ti < grassByType.length; ti++) {
    const list = grassByType[ti];
    if (!list) continue;
    for (let pi = 0; pi < list.length; pi++) {
      const p = list[pi];
      if (p.targetScale < HUNGER_SEEK_MIN_TARGET) continue;
      const dx = x - p.x;
      const dz = z - p.z;
      const dsq = dx * dx + dz * dz;
      if (dsq < bestSq) {
        bestSq = dsq;
        best = p;
      }
    }
  }
  return best;
}

type BisonGroupProps = {
  spawns: BisonSpawn[];
  bounds: number;
  positionsRef: MutableRefObject<BisonPosition[]>;
  grassPositionsRef: MutableRefObject<GrassPosEntry[][]>;
  onLeave: (id: number) => void;
  onSpawnCalf: (x: number, z: number) => void;
};

export function BisonGroup({
  spawns,
  bounds,
  positionsRef,
  grassPositionsRef,
  onLeave,
  onSpawnCalf,
}: BisonGroupProps) {
  const sourceTexture = useLoader(THREE.TextureLoader, grazePngUrl) as THREE.Texture;

  const textureFwd = useMemo(() => makeBisonTexture(sourceTexture, false), [sourceTexture]);
  const textureBack = useMemo(() => makeBisonTexture(sourceTexture, true), [sourceTexture]);

  useEffect(() => {
    return () => {
      textureFwd.dispose();
      textureBack.dispose();
    };
  }, [textureFwd, textureBack]);

  const runtimeRef = useRef<BisonRuntime[]>([]);
  // sprite/material refs are keyed by stable bison id rather than by index
  // so that adding or removing bison can't desync the index <-> ref mapping
  // (a previous bug truncated newly-set refs in the sync effect, freezing
  // the latest spawned bison in place).
  const spriteByIdRef = useRef<Map<number, THREE.Sprite | null>>(new Map());
  const matByIdRef = useRef<Map<number, THREE.SpriteMaterial | null>>(new Map());

  // Sync runtimes with the spawn list, matching by id. Removed spawns drop
  // their runtime; new spawns get a fresh runtime initialised from the spawn.
  useEffect(() => {
    const rts = runtimeRef.current;
    const pos = positionsRef.current;
    const present = new Set(spawns.map((s) => s.id));

    // compact: keep runtimes whose id is still in spawns
    let writeIdx = 0;
    for (let r = 0; r < rts.length; r++) {
      if (present.has(rts[r].id)) {
        if (writeIdx !== r) {
          rts[writeIdx] = rts[r];
          pos[writeIdx] = pos[r];
        }
        writeIdx++;
      }
    }
    rts.length = writeIdx;
    pos.length = writeIdx;

    // drop sprite/material entries for ids that have been removed
    for (const id of spriteByIdRef.current.keys()) {
      if (!present.has(id)) spriteByIdRef.current.delete(id);
    }
    for (const id of matByIdRef.current.keys()) {
      if (!present.has(id)) matByIdRef.current.delete(id);
    }

    // append new spawns we haven't seen yet
    const known = new Set(rts.map((r) => r.id));
    for (const s of spawns) {
      if (known.has(s.id)) continue;
      const heading = pickHeading(BASE_SPEED);
      rts.push({
        id: s.id,
        x: s.initialX,
        z: s.initialZ,
        vx: heading.vx,
        vz: heading.vz,
        facing: heading.vx >= 0 ? -1 : 1,
        fullness: s.isCalf
          ? CALF_INITIAL_FULLNESS
          : ADULT_INITIAL_FULLNESS_MIN +
            Math.random() *
              (ADULT_INITIAL_FULLNESS_MAX - ADULT_INITIAL_FULLNESS_MIN),
        starvingForS: 0,
        lastReproduceAt: -REPRODUCE_COOLDOWN_S,
        pairBuildupS: 0,
        isCalf: !!s.isCalf,
        growUpAt: s.isCalf ? CALF_GROW_UP_S : 0,
        nextTurnAt: 0,
        leaving: false,
      });
      pos.push({ x: s.initialX, z: s.initialZ, fullness: 0 });
    }
  }, [spawns, positionsRef]);

  const half = bounds * 0.5;

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;

    const frame = Math.floor(t * grazeMeta.fps) % grazeMeta.frames;
    textureFwd.offset.x = frame / grazeMeta.frames;
    textureBack.offset.x = (frame + 1) / grazeMeta.frames;

    const rts = runtimeRef.current;
    const pos = positionsRef.current;
    const allGrass = grassPositionsRef.current;

    for (let i = 0; i < rts.length; i++) {
      const r = rts[i];
      if (r.leaving) continue;

      // calf grow-up
      if (r.isCalf) {
        r.growUpAt -= dt;
        if (r.growUpAt <= 0) r.isCalf = false;
      }

      // 1) fullness decay
      r.fullness = Math.max(0, r.fullness - FULLNESS_DECAY_PER_S * dt);

      // 2) detect grazing — any live grass within radius?
      let grazing = false;
      for (let ti = 0; ti < allGrass.length && !grazing; ti++) {
        const list = allGrass[ti];
        if (!list) continue;
        for (let pi = 0; pi < list.length; pi++) {
          const p = list[pi];
          const dx = r.x - p.x;
          const dz = r.z - p.z;
          if (dx * dx + dz * dz < BISON_GRAZE_RADIUS_SQ) {
            grazing = true;
            break;
          }
        }
      }
      if (grazing) {
        r.fullness = Math.min(1, r.fullness + FULLNESS_PER_GRAZE_PER_S * dt);
      }

      // 3) starvation tracking
      if (r.fullness < STARVING_THRESHOLD) r.starvingForS += dt;
      else r.starvingForS = 0;
      if (r.starvingForS > STARVE_LEAVE_AFTER_S && !r.leaving) {
        r.leaving = true;
        onLeave(r.id);
        continue; // spawn-sync effect will compact the runtime next render
      }

      // 4) heading update on turn timer
      const hungry = r.fullness < HUNGRY_THRESHOLD;
      const speed = hungry ? BASE_SPEED * HUNGRY_SPEED_MULT : BASE_SPEED;
      if (t >= r.nextTurnAt) {
        let heading = pickHeading(speed);
        if (hungry) {
          const target = nearestTallGrass(r.x, r.z, allGrass);
          if (target) {
            const dx = target.x - r.x;
            const dz = target.z - r.z;
            const d = Math.sqrt(dx * dx + dz * dz) || 1;
            heading = { vx: (dx / d) * speed, vz: (dz / d) * speed };
          }
        }
        r.vx = heading.vx;
        r.vz = heading.vz;
        r.facing = heading.vx >= 0 ? -1 : 1;
        r.nextTurnAt = t + TURN_MIN_S + Math.random() * TURN_RANGE_S;
      }

      // 5) integrate position + bounce off bounds
      r.x += r.vx * dt;
      r.z += r.vz * dt;
      if (r.x > half) {
        r.x = half;
        r.vx = -Math.abs(r.vx);
        r.facing = 1;
      } else if (r.x < -half) {
        r.x = -half;
        r.vx = Math.abs(r.vx);
        r.facing = -1;
      }
      if (r.z > half) {
        r.z = half;
        r.vz = -Math.abs(r.vz);
      } else if (r.z < -half) {
        r.z = -half;
        r.vz = Math.abs(r.vz);
      }

      pos[i].x = r.x;
      pos[i].z = r.z;
      pos[i].fullness = r.fullness;

      // 6) sprite pose + visual cues — look up by stable id, not index
      const sprite = spriteByIdRef.current.get(r.id);
      if (sprite) {
        const yScale = r.isCalf ? CALF_SCALE : 1;
        sprite.position.set(r.x, GROUND_Y + (BISON_HEIGHT * yScale) / 2, r.z);
        sprite.scale.set(BISON_WIDTH * yScale, BISON_HEIGHT * yScale, 1);
      }
      const mat = matByIdRef.current.get(r.id);
      if (mat) {
        const wanted = r.facing === -1 ? textureBack : textureFwd;
        if (mat.map !== wanted) mat.map = wanted;
        mat.opacity =
          r.fullness < STARVING_THRESHOLD
            ? OPACITY_STARVING
            : r.fullness < HUNGRY_THRESHOLD
              ? OPACITY_HUNGRY
              : OPACITY_FED;
      }
    }

    // 7) reproduction — pairwise pass. Each adult bison accumulates
    //    pairBuildupS while in proximity to another fed adult; the
    //    lower-id partner fires the calf event to avoid double-spawns.
    for (let i = 0; i < rts.length; i++) {
      const a = rts[i];
      if (a.leaving) continue;
      if (
        a.isCalf ||
        a.fullness < REPRODUCE_FULLNESS_MIN ||
        t - a.lastReproduceAt < REPRODUCE_COOLDOWN_S
      ) {
        a.pairBuildupS = Math.max(0, a.pairBuildupS - dt);
        continue;
      }
      let partner: BisonRuntime | null = null;
      for (let j = 0; j < rts.length; j++) {
        if (j === i) continue;
        const b = rts[j];
        if (b.leaving) continue;
        if (
          b.isCalf ||
          b.fullness < REPRODUCE_FULLNESS_MIN ||
          t - b.lastReproduceAt < REPRODUCE_COOLDOWN_S
        )
          continue;
        const dx = a.x - b.x;
        const dz = a.z - b.z;
        if (dx * dx + dz * dz > REPRODUCE_PROXIMITY_SQ) continue;
        partner = b;
        break;
      }

      if (partner) a.pairBuildupS += dt;
      else a.pairBuildupS = Math.max(0, a.pairBuildupS - dt);

      if (
        partner &&
        a.pairBuildupS >= REPRODUCE_DURATION_S &&
        partner.pairBuildupS >= REPRODUCE_DURATION_S &&
        a.id < partner.id
      ) {
        onSpawnCalf((a.x + partner.x) / 2, (a.z + partner.z) / 2);
        a.lastReproduceAt = t;
        partner.lastReproduceAt = t;
        a.pairBuildupS = 0;
        partner.pairBuildupS = 0;
      }
    }
  });

  return (
    <>
      {spawns.map((s) => {
        const calfScale = s.isCalf ? CALF_SCALE : 1;
        return (
          <sprite
            key={s.id}
            ref={(el) => {
              if (el) spriteByIdRef.current.set(s.id, el);
              else spriteByIdRef.current.delete(s.id);
            }}
            position={[
              s.initialX,
              GROUND_Y + (BISON_HEIGHT * calfScale) / 2,
              s.initialZ,
            ]}
            scale={[BISON_WIDTH * calfScale, BISON_HEIGHT * calfScale, 1]}
          >
            <spriteMaterial
              ref={(el) => {
                if (el) matByIdRef.current.set(s.id, el);
                else matByIdRef.current.delete(s.id);
              }}
              map={textureFwd}
              transparent
              alphaTest={0.05}
              opacity={OPACITY_FED}
              color="#a89a7e"
            />
          </sprite>
        );
      })}
    </>
  );
}
