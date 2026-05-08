import { type MutableRefObject } from "react";
import { type ThreeEvent } from "@react-three/fiber";
import { Grass, SeededGrass, type Mode, type SeededPlantData } from "./Grass";
import { BisonGroup, type BisonPosition, type BisonSpawn } from "./Bison";

type GroundProps = {
  mode: Mode;
  planeSize: number;
  patchSize: number;
  density: number;
  onClickGrass: () => void;
  seededPlants: SeededPlantData[];
  onSeed: (x: number, z: number) => void;
  bisons: BisonSpawn[];
  onSpawnBison: (x: number, z: number) => void;
  bisonPositionsRef: MutableRefObject<BisonPosition[]>;
};

export function Ground({
  mode,
  planeSize,
  patchSize,
  density,
  onClickGrass,
  seededPlants,
  onSeed,
  bisons,
  onSpawnBison,
  bisonPositionsRef,
}: GroundProps) {
  const handlePlaneClick = (e: ThreeEvent<MouseEvent>) => {
    if (mode === "seed") {
      e.stopPropagation();
      onSeed(e.point.x, e.point.z);
    } else if (mode === "bison") {
      e.stopPropagation();
      onSpawnBison(e.point.x, e.point.z);
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
      />
      <SeededGrass
        plants={seededPlants}
        mode={mode}
        onClickGrass={onClickGrass}
        bisonPositionsRef={bisonPositionsRef}
      />
      <BisonGroup
        spawns={bisons}
        bounds={patchSize}
        positionsRef={bisonPositionsRef}
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
