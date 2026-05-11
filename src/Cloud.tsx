import {
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { emojiTexture } from "./lib/emojiTexture";
import type { FireRequest } from "./Fire";

type CloudRuntime = {
  id: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  yLift: number;
  scale: number;
  scheduledStrikeAt: number; // -1 = never, 0 = already struck
  bornAt: number;
};

type LightningRuntime = {
  id: number;
  x: number;
  z: number;
  yTop: number;
  bornAt: number;
};

const CLOUD_Y = 50;
const CLOUD_DRIFT_SPEED_MIN = 2;
const CLOUD_DRIFT_SPEED_MAX = 5;
const CLOUD_SCALE_MIN = 12;
const CLOUD_SCALE_MAX = 22;
const MAX_CLOUDS = 4;
const CLOUD_SPAWN_INTERVAL_MIN_S = 10;
const CLOUD_SPAWN_INTERVAL_MAX_S = 25;
const CLOUD_LIGHTNING_PROBABILITY = 0.3;
const LIGHTNING_DELAY_MIN_S = 4;
const LIGHTNING_DELAY_MAX_S = 12;
const LIGHTNING_FLASH_S = 0.25;

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function nextSpawnDelay(): number {
  return rand(CLOUD_SPAWN_INTERVAL_MIN_S, CLOUD_SPAWN_INTERVAL_MAX_S);
}

type CloudGroupProps = {
  bounds: number;
  fireQueueRef: MutableRefObject<FireRequest[]>;
  cloudCountRef?: MutableRefObject<number>;
};

export function CloudGroup({
  bounds,
  fireQueueRef,
  cloudCountRef,
}: CloudGroupProps) {
  const cloudTexture = useMemo(() => emojiTexture("☁️", 256), []);
  const lightningTexture = useMemo(() => emojiTexture("⚡", 128), []);

  const cloudsRef = useRef<CloudRuntime[]>([]);
  const lightningRef = useRef<LightningRuntime[]>([]);
  const cloudSpriteRefs = useRef<Array<THREE.Sprite | null>>([]);
  const lightningMatRefs = useRef<Array<THREE.SpriteMaterial | null>>([]);

  const nextIdRef = useRef(0);
  const nextLightningIdRef = useRef(0);
  const spawnTimerRef = useRef(0);
  const [, bumpVersion] = useState(0);

  const half = bounds * 0.5;

  function spawnCloud(nowS: number): CloudRuntime {
    // pick a side; cloud drifts inward across the patch
    const fromX = Math.random() < 0.5;
    const dir = Math.random() < 0.5 ? 1 : -1;
    const speed = rand(CLOUD_DRIFT_SPEED_MIN, CLOUD_DRIFT_SPEED_MAX);
    const x = fromX ? -dir * (half + 8) : rand(-half, half);
    const z = fromX ? rand(-half, half) : -dir * (half + 8);
    const vx = fromX ? dir * speed : 0;
    const vz = fromX ? 0 : dir * speed;
    const willStrike = Math.random() < CLOUD_LIGHTNING_PROBABILITY;
    return {
      id: nextIdRef.current++,
      x,
      z,
      vx,
      vz,
      yLift: CLOUD_Y + rand(-3, 3),
      scale: rand(CLOUD_SCALE_MIN, CLOUD_SCALE_MAX),
      scheduledStrikeAt: willStrike
        ? nowS + rand(LIGHTNING_DELAY_MIN_S, LIGHTNING_DELAY_MAX_S)
        : -1,
      bornAt: nowS,
    };
  }

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const clouds = cloudsRef.current;
    const flashes = lightningRef.current;
    let changed = false;

    // 1) spawn timer
    spawnTimerRef.current -= dt;
    if (spawnTimerRef.current <= 0 && clouds.length < MAX_CLOUDS) {
      clouds.push(spawnCloud(t));
      spawnTimerRef.current = nextSpawnDelay();
      changed = true;
    }

    // 2) drift, despawn, lightning trigger
    const offEdge = half + 12;
    for (let i = clouds.length - 1; i >= 0; i--) {
      const c = clouds[i];
      c.x += c.vx * dt;
      c.z += c.vz * dt;

      // lightning strike
      if (c.scheduledStrikeAt > 0 && t >= c.scheduledStrikeAt) {
        c.scheduledStrikeAt = 0; // mark struck
        // strike point is the cloud's ground footprint
        const sx = Math.max(-half, Math.min(half, c.x));
        const sz = Math.max(-half, Math.min(half, c.z));
        flashes.push({
          id: nextLightningIdRef.current++,
          x: sx,
          z: sz,
          yTop: c.yLift,
          bornAt: t,
        });
        fireQueueRef.current.push({ x: sx, z: sz });
        changed = true;
      }

      // despawn off-edge
      if (
        c.x > offEdge ||
        c.x < -offEdge ||
        c.z > offEdge ||
        c.z < -offEdge
      ) {
        clouds.splice(i, 1);
        changed = true;
      }
    }

    // 3) age out lightning flashes
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i];
      if (t - f.bornAt > LIGHTNING_FLASH_S) {
        flashes.splice(i, 1);
        changed = true;
      }
    }

    // 4) update cloud sprite poses
    for (let i = 0; i < clouds.length; i++) {
      const c = clouds[i];
      const sprite = cloudSpriteRefs.current[i];
      if (sprite) {
        sprite.position.set(c.x, c.yLift, c.z);
        sprite.scale.set(c.scale, c.scale * 0.6, 1);
      }
    }

    // 5) update lightning material opacity (fade out over LIGHTNING_FLASH_S)
    for (let i = 0; i < flashes.length; i++) {
      const f = flashes[i];
      const mat = lightningMatRefs.current[i];
      if (mat) {
        const k = 1 - (t - f.bornAt) / LIGHTNING_FLASH_S;
        mat.opacity = Math.max(0, k);
      }
    }

    if (cloudCountRef) cloudCountRef.current = clouds.length;
    if (changed) bumpVersion((v) => v + 1);
  });

  return (
    <>
      {cloudsRef.current.map((c, i) => (
        <sprite
          key={`c${c.id}`}
          ref={(el) => {
            cloudSpriteRefs.current[i] = el;
          }}
          position={[c.x, c.yLift, c.z]}
          scale={[c.scale, c.scale * 0.6, 1]}
        >
          <spriteMaterial
            map={cloudTexture}
            transparent
            opacity={0.9}
            depthWrite={false}
          />
        </sprite>
      ))}
      {lightningRef.current.map((f, i) => (
        <sprite
          key={`l${f.id}`}
          position={[f.x, f.yTop * 0.5, f.z]}
          scale={[10, f.yTop * 0.9, 1]}
        >
          <spriteMaterial
            ref={(el) => {
              lightningMatRefs.current[i] = el;
            }}
            map={lightningTexture}
            transparent
            opacity={1}
            depthWrite={false}
          />
        </sprite>
      ))}
    </>
  );
}
