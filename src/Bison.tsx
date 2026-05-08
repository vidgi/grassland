import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { useFrame, useLoader } from "@react-three/fiber";
import grazeMeta from "./assets/sprites/graze.json";
import grazePngUrl from "./assets/sprites/graze.png";

export type BisonSpawn = {
  initialX: number;
  initialZ: number;
};

export type BisonPosition = { x: number; z: number };

type BisonRuntime = {
  x: number;
  z: number;
  vx: number;
  vz: number;
  facing: 1 | -1;
  nextTurnAt: number;
};

const GROUND_Y = -10;
const BISON_HEIGHT = 8;
const BISON_WIDTH =
  BISON_HEIGHT * (grazeMeta.frameWidth / grazeMeta.frameHeight);
const SPEED = 6;
const TURN_MIN_S = 2;
const TURN_RANGE_S = 3;

function pickHeading(): { vx: number; vz: number } {
  const a = Math.random() * Math.PI * 2;
  return { vx: Math.cos(a) * SPEED, vz: Math.sin(a) * SPEED };
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

type BisonGroupProps = {
  spawns: BisonSpawn[];
  bounds: number;
  positionsRef: MutableRefObject<BisonPosition[]>;
};

export function BisonGroup({ spawns, bounds, positionsRef }: BisonGroupProps) {
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
  const spriteRefs = useRef<Array<THREE.Sprite | null>>([]);
  const matRefs = useRef<Array<THREE.SpriteMaterial | null>>([]);

  // grow runtime + positions arrays to match the spawn list whenever it changes
  useEffect(() => {
    const rts = runtimeRef.current;
    const pos = positionsRef.current;
    while (rts.length < spawns.length) {
      const i = rts.length;
      const s = spawns[i];
      const heading = pickHeading();
      rts.push({
        x: s.initialX,
        z: s.initialZ,
        vx: heading.vx,
        vz: heading.vz,
        facing: heading.vx >= 0 ? -1 : 1, // sprite faces left by default
        nextTurnAt: 0,
      });
      pos.push({ x: s.initialX, z: s.initialZ });
    }
    if (rts.length > spawns.length) {
      rts.length = spawns.length;
      pos.length = spawns.length;
      spriteRefs.current.length = spawns.length;
      matRefs.current.length = spawns.length;
    }
  }, [spawns, positionsRef]);

  const half = bounds * 0.5;

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;

    const frame = Math.floor(t * grazeMeta.fps) % grazeMeta.frames;
    // forward texture: standard offset; back texture: shift by 1 cell so the
    // negative repeat samples the same frame mirrored (uv*(-1/N)+(f+1)/N)
    textureFwd.offset.x = frame / grazeMeta.frames;
    textureBack.offset.x = (frame + 1) / grazeMeta.frames;

    const rts = runtimeRef.current;
    const pos = positionsRef.current;

    for (let i = 0; i < rts.length; i++) {
      const r = rts[i];

      if (t >= r.nextTurnAt) {
        const h = pickHeading();
        r.vx = h.vx;
        r.vz = h.vz;
        r.facing = h.vx >= 0 ? -1 : 1;
        r.nextTurnAt = t + TURN_MIN_S + Math.random() * TURN_RANGE_S;
      }

      r.x += r.vx * dt;
      r.z += r.vz * dt;

      if (r.x > half) { r.x = half; r.vx = -Math.abs(r.vx); r.facing = 1; }
      else if (r.x < -half) { r.x = -half; r.vx = Math.abs(r.vx); r.facing = -1; }
      if (r.z > half) { r.z = half; r.vz = -Math.abs(r.vz); }
      else if (r.z < -half) { r.z = -half; r.vz = Math.abs(r.vz); }

      pos[i].x = r.x;
      pos[i].z = r.z;

      const sprite = spriteRefs.current[i];
      if (sprite) {
        sprite.position.set(r.x, GROUND_Y + BISON_HEIGHT / 2, r.z);
      }
      const mat = matRefs.current[i];
      if (mat) {
        const wanted = r.facing === -1 ? textureBack : textureFwd;
        if (mat.map !== wanted) mat.map = wanted;
      }
    }
  });

  return (
    <>
      {spawns.map((s, i) => (
        <sprite
          key={i}
          ref={(el) => {
            spriteRefs.current[i] = el;
          }}
          position={[s.initialX, GROUND_Y + BISON_HEIGHT / 2, s.initialZ]}
          scale={[BISON_WIDTH, BISON_HEIGHT, 1]}
        >
          <spriteMaterial
            ref={(el) => {
              matRefs.current[i] = el;
            }}
            map={textureFwd}
            transparent
            alphaTest={0.05}
            opacity={0.7}
            color="#a89a7e"
          />
        </sprite>
      ))}
    </>
  );
}
