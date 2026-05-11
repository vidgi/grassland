import { type MutableRefObject } from "react";
import { type ThreeEvent } from "@react-three/fiber";
import {
  Grass,
  type GrassPosEntry,
  type GrassStat,
  type Mode,
  type SeedRequest,
} from "./Grass";
import { BisonGroup, type BisonPosition, type BisonSpawn } from "./Bison";
import { FireGroup, type FirePosition, type FireRequest } from "./Fire";
import { CloudGroup } from "./Cloud";
import { ButterflyGroup, type PollinatorPosition } from "./Butterfly";
import { BirdGroup, DwellerGroup } from "./Bird";

type GroundProps = {
  mode: Mode;
  planeSize: number;
  patchSize: number;
  density: number;
  onClickGrass: () => void;
  onSeed: (x: number, z: number) => void;
  onSpawnFire: (x: number, z: number) => void;
  bisons: BisonSpawn[];
  onSpawnBison: (x: number, z: number) => void;
  onBisonLeave: (id: number) => void;
  onSpawnCalf: (x: number, z: number) => void;
  bisonPositionsRef: MutableRefObject<BisonPosition[]>;
  firePositionsRef: MutableRefObject<FirePosition[]>;
  fireQueueRef: MutableRefObject<FireRequest[]>;
  fireCountRef: MutableRefObject<number>;
  pollinatorPositionsRef: MutableRefObject<PollinatorPosition[]>;
  butterflyCountRef: MutableRefObject<number>;
  birdCountRef: MutableRefObject<number>;
  dwellerCountRef: MutableRefObject<number>;
  cloudCountRef: MutableRefObject<number>;
  grassStatsRef: MutableRefObject<GrassStat[]>;
  grassPositionsRef: MutableRefObject<GrassPosEntry[][]>;
  seedQueueRef: MutableRefObject<SeedRequest[]>;
};

export function Ground({
  mode,
  planeSize,
  patchSize,
  density,
  onClickGrass,
  onSeed,
  onSpawnFire,
  bisons,
  onSpawnBison,
  onBisonLeave,
  onSpawnCalf,
  bisonPositionsRef,
  firePositionsRef,
  fireQueueRef,
  fireCountRef,
  pollinatorPositionsRef,
  butterflyCountRef,
  birdCountRef,
  dwellerCountRef,
  cloudCountRef,
  grassStatsRef,
  grassPositionsRef,
  seedQueueRef,
}: GroundProps) {
  const handlePlaneClick = (e: ThreeEvent<MouseEvent>) => {
    if (mode === "seed") {
      e.stopPropagation();
      onSeed(e.point.x, e.point.z);
    } else if (mode === "bison") {
      e.stopPropagation();
      onSpawnBison(e.point.x, e.point.z);
    } else if (mode === "fire") {
      e.stopPropagation();
      onSpawnFire(e.point.x, e.point.z);
    }
  };

  return (
    <group>
      <Grass
        patchSize={patchSize}
        density={density}
        mode={mode}
        onClickGrass={onClickGrass}
        bisonPositionsRef={bisonPositionsRef}
        firePositionsRef={firePositionsRef}
        pollinatorPositionsRef={pollinatorPositionsRef}
        grassStatsRef={grassStatsRef}
        grassPositionsRef={grassPositionsRef}
        seedQueueRef={seedQueueRef}
      />
      <BisonGroup
        spawns={bisons}
        bounds={patchSize}
        positionsRef={bisonPositionsRef}
        grassPositionsRef={grassPositionsRef}
        onLeave={onBisonLeave}
        onSpawnCalf={onSpawnCalf}
      />
      <FireGroup
        bounds={patchSize}
        fireQueueRef={fireQueueRef}
        firePositionsRef={firePositionsRef}
        seedQueueRef={seedQueueRef}
        fireCountRef={fireCountRef}
      />
      <CloudGroup
        bounds={patchSize}
        fireQueueRef={fireQueueRef}
        cloudCountRef={cloudCountRef}
      />
      <ButterflyGroup
        bounds={patchSize}
        grassPositionsRef={grassPositionsRef}
        pollinatorPositionsRef={pollinatorPositionsRef}
        butterflyCountRef={butterflyCountRef}
      />
      <BirdGroup
        bounds={patchSize}
        grassPositionsRef={grassPositionsRef}
        seedQueueRef={seedQueueRef}
        birdCountRef={birdCountRef}
      />
      <DwellerGroup
        bounds={patchSize}
        grassPositionsRef={grassPositionsRef}
        dwellerCountRef={dwellerCountRef}
      />
      <mesh
        position={[0, -10, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={handlePlaneClick}
      >
        <planeGeometry args={[planeSize, planeSize]} />
        <meshBasicMaterial color="#99b27a" />
      </mesh>
    </group>
  );
}
