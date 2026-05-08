import { Suspense, useRef, useState } from "react";
import { Music, Sprout, Flame, Flower2 } from "lucide-react";
import { Canvas } from "@react-three/fiber";
import { Loader, OrbitControls } from "@react-three/drei";
import { Ground } from "./Ground";
import { Cursor } from "./Cursor";
import { Tooltip } from "./ui/Tooltip";
import { ToggleGroup, ToggleButton } from "./ui/ToggleGroup";
import type { Mode, SeededPlantData } from "./Grass";
const PLANE_SIZE = 100;
const PATCH_SIZE = 100;
const GRASS_DENSITY = 75;

// lock vertical tilt: polar angle for camera at [80,80,80] looking at [0,-10,0]
const ISO_POLAR = Math.acos(90 / Math.sqrt(80 * 80 + 90 * 90 + 80 * 80));

function GrazeIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="18"
      viewBox="0 0 115 95"
      fill="currentColor"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M 37.6 27.2C 19.0342 18.9826 1.67678 37.6838 8.43584 56C 10.1417 60.6227 13.7141 67.0488 16.8037 70.8654C 20.0286 74.849 23.9465 75.2366 25.6 80.8C 29.8188 77.9218 30.3864 71.9331 30.4 67.2L 31.2 67.2L 32 70.4C 33.9748 68.0162 35.1446 65.3693 36 62.4L 36.8 62.4C 36.8 69.1652 35.7665 75.1162 33.8241 81.6C 32.97 84.4512 30.9665 88.7832 32.4834 91.7304C 34.0689 94.8104 37.3707 91.1048 38.4766 89.5848C 42.127 84.5664 46.2706 78.7917 48 72.8L 48.8 72.8C 48.7972 77.07 43.7547 89.2104 46.4222 92.2704C 48.2786 94.4 50.5298 90.9832 51.2963 89.5848C 54.4114 83.8992 58.0532 77.3522 60 71.2C 61.8946 72.4215 63.3486 73.4876 64.8 75.2C 67.8216 73.8163 70.2214 71.6913 72.8 69.6L 72 72C 86.8744 69.9872 78.3675 83.8736 80 92.8C 86.3392 91.8136 91.2856 83.9752 93.6 78.4L 94.4 78.4C 94.2952 82.8752 92.388 86.784 92 91.2C 101.418 87.376 106.745 68.5222 108 59.2L 108.8 59.2C 109.058 66.3701 107.426 72.2554 106.4 79.2C 115.994 76.1977 113.521 58.8202 110.371 52C 104.694 39.708 95.6056 31.9066 86.472 22.3889C 80.5832 16.2529 72.5527 8.04544 63.2 8.2228C 57.3807 8.33321 50.7886 13.5827 46.4006 17.0315C 42.7254 19.92 39.692 23.003 37.6 27.2z"
      />
    </svg>
  );
}

const SPRITES_COUNT = 32; // total sprite types in index.json

export default function App() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [mode, setMode] = useState<Mode>(null);
  const [muted, setMuted] = useState(true);
  const [seededPlants, setSeededPlants] = useState<SeededPlantData[]>([]);

  const toggleMusic = () => {
    const el = audioRef.current;
    if (!el) return;
    if (muted) void el.play().catch(() => {});
    else el.pause();
    setMuted((v) => !v);
  };

  const handleGrassClick = () => {
    if (muted || !audioRef.current) return;
    void audioRef.current.play().catch(() => {});
  };

  const handleSeed = (x: number, z: number) => {
    setSeededPlants((prev) => [
      ...prev,
      {
        typeIndex: Math.floor(Math.random() * SPRITES_COUNT),
        position: [x, -10, z],
      },
    ]);
  };

  return (
    <div className="App relative h-full w-full">
      <Cursor mode={mode} />
      <audio ref={audioRef} loop>
        <source
          src="https://s3.us-east-2.amazonaws.com/vidyagiri.com/images/birdsong-trim.mp3"
          type="audio/mpeg"
        />
      </audio>

      <div className="absolute top-6 left-6 z-[10000] text-[#3d4a30]">
        <Tooltip
          label="explore a bit of a grassland world! inspired by the tallgrass prairie <3"
          side="bottom"
        >
          <span data-cursor className="select-none">
            patch of prairie
          </span>
        </Tooltip>
      </div>

      <div className="absolute bottom-6 left-6 z-[10000]">
        <Tooltip label={muted ? "play music" : "mute music"}>
          <ToggleButton
            pressed={!muted}
            onClick={toggleMusic}
            ariaLabel="toggle music"
          >
            <Music size={20} strokeWidth={1.5} />
          </ToggleButton>
        </Tooltip>
      </div>

      <div className="absolute bottom-6 right-6 z-[10000]">
        <ToggleGroup<Exclude<Mode, null>>
          ariaLabel="mode selection"
          value={mode}
          onChange={(next) => setMode(next)}
          options={[
            {
              value: "grow",
              label: "grow",
              content: (
                <Tooltip label="grow" side="top">
                  <Sprout size={20} strokeWidth={1.5} />
                </Tooltip>
              ),
            },
            {
              value: "graze",
              label: "graze",
              content: (
                <Tooltip label="graze" side="top">
                  <GrazeIcon />
                </Tooltip>
              ),
            },
            {
              value: "fire",
              label: "fire",
              content: (
                <Tooltip label="fire" side="top">
                  <Flame size={20} strokeWidth={1.5} />
                </Tooltip>
              ),
            },
            {
              value: "seed",
              label: "seed",
              content: (
                <Tooltip label="seed" side="top">
                  <Flower2 size={20} strokeWidth={1.5} />
                </Tooltip>
              ),
            },
          ]}
        />
      </div>

      <Canvas
        camera={{ fov: 60, position: [80, 80, 80], near: 0.1, far: 2000 }}
        className="!h-screen !w-screen"
        dpr={[1, 1.5]}
      >
        <Suspense fallback={null}>
          <Ground
            mode={mode}
            planeSize={PLANE_SIZE}
            patchSize={PATCH_SIZE}
            density={GRASS_DENSITY}
            onClickGrass={handleGrassClick}
            seededPlants={seededPlants}
            onSeed={handleSeed}
          />
        </Suspense>
        <ambientLight intensity={1} />
        <OrbitControls
          makeDefault
          target={[0, -10, 0]}
          enablePan={false}
          enableZoom={true}
          enableRotate={true}
          // minPolarAngle={ISO_POLAR}
          // maxPolarAngle={ISO_POLAR}
        />
      </Canvas>

      <Loader />
    </div>
  );
}
