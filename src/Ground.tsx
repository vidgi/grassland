import { type ThreeEvent } from "@react-three/fiber";
import { Grass, SeededGrass, type Mode, type SeededPlantData } from "./Grass";

type GroundProps = {
  mode: Mode;
  planeSize: number;
  patchSize: number;
  density: number;
  onClickGrass: () => void;
  seededPlants: SeededPlantData[];
  onSeed: (x: number, z: number) => void;
};

export function Ground({
  mode,
  planeSize,
  patchSize,
  density,
  onClickGrass,
  seededPlants,
  onSeed,
}: GroundProps) {
  const handlePlaneClick = (e: ThreeEvent<MouseEvent>) => {
    if (mode !== "seed") return;
    e.stopPropagation();
    onSeed(e.point.x, e.point.z);
  };

  return (
    <group>
      <Grass
        patchSize={patchSize}
        density={density}
        mode={mode}
        onClickGrass={onClickGrass}
      />
      <SeededGrass plants={seededPlants} />
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
