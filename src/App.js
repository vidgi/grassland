import "./App.css";
import React, { Suspense, useState } from "react";
import GrowIcon from "@mui/icons-material/Grass";
import FireIcon from "@mui/icons-material/LocalFireDepartment";
import SeedIcon from "@mui/icons-material/Grain";
import MusicIcon from "@mui/icons-material/MusicNote";
import SvgIcon from "@mui/material/SvgIcon";

// import AnimatedCursor from "react-animated-cursor";

import { Canvas } from "@react-three/fiber";
import { Loader, Html, KeyboardControls } from "@react-three/drei";
import { ToggleButton, ToggleButtonGroup, Tooltip } from "@mui/material";
import { createTheme, ThemeProvider } from "@mui/material/styles";
// import { Perf } from "r3f-perf";
import { Physics } from "@react-three/rapier";
import { Player } from "./Player";
import { Ground } from "./Ground";

function getRandomInt(max) {
  return Math.floor(Math.random() * max);
}

function App() {
  var bluestemData = {
    0: require("./img/plant1.gif"),
    1: require("./img/grass1.gif"),
    2: require("./img/grass2.gif"),
    3: require("./img/grass3.gif"),
    4: require("./img/grass4.gif"),
    5: require("./img/grass5.gif"),
    6: require("./img/grass6.gif"),
    7: require("./img/grass7.gif"),
    8: require("./img/grass8.gif"),
    9: require("./img/plant2.gif"),
    10: require("./img/plant3.gif"),
    11: require("./img/plant4.gif"),
    12: require("./img/plant5.gif"),
    13: require("./img/plant6.gif"),
    14: require("./img/planty6.gif"),
    15: require("./img/planty1.gif"),
    16: require("./img/planty2.gif"),
    17: require("./img/planty3.gif"),
    18: require("./img/planty4.gif"),
    19: require("./img/planty5.gif"),
    // 20: require("./img/plant7.gif"), //  i don't like this one...
  };

  const gridSize = 1;
  const planeSize = 100;
  const plantMultiplier = 75;
  function setInitialData(gridsize) {
    var initialData = [];
    for (let i = 0; i < gridsize * gridsize * plantMultiplier; i++) {
      // put random species selection here once adding more species
      // limit to only smaller sizes at first
      var imageIndex = getRandomInt(20);
      initialData.push({
        id: "big-bluestem-" + i,
        size: imageIndex,
        image: bluestemData[imageIndex],
        position: [
          planeSize * 0.2 - getRandomInt(gridSize * planeSize * 0.6),
          -11,
          planeSize * 0.2 - getRandomInt(0.6 * gridSize * planeSize),
        ],
      });
    }
    return initialData;
  }

  const [grassData, setGrassData] = useState(setInitialData(gridSize));

  const [mode, setMode] = useState("");
  const [mute, setMute] = useState(false);

  const toggleMusic = () => {
    var x = document.getElementById("audio");
    if (mute) x.play();
    else x.pause();
    setMute(!mute);
  };

  const handleModeChange = (e, newMode) => {
    setMode(newMode);
  };

  const callback = (payload) => {
    setGrassData(payload);
  };

  const theme = createTheme({
    palette: {
      primary: {
        light: "#99b27a",
        main: "#99b27a",
        dark: "#000000",
        contrastText: "#99b27a",
      },
    },
    typography: {
      fontFamily: `"DM Mono", "Courier", monospace`,
    },
    card: {
      backgroundColor: "#c5ccb6 !important",
    },
  });

  const handleSeed = (e) => {
    if (mode === "seed") {
      // console.log("seed");
      addShape(e);
    }
  };

  const [shapesOnCanvas, setShapesOnCanvas] = useState([]);
  var imageIndex = getRandomInt(14);
  const addShape = (e) => {
    const shapeCount = shapesOnCanvas.length;
    setShapesOnCanvas([
      ...shapesOnCanvas,
      <Shape
        image={bluestemData[imageIndex]}
        key={shapeCount}
        position={[0 + 1 / getRandomInt(20), -11, planeSize * 0.2 - getRandomInt(0.6 * gridSize * planeSize)]}
      />,
    ]);
  };

  return (
    <div className="App">
      {/* <AnimatedCursor /> */}
      <audio id="audio" loop>
        <source src="https://s3.us-east-2.amazonaws.com/vidyagiri.com/images/birdsong-trim.mp3" type="audio/mpeg" />
      </audio>
      <ThemeProvider theme={theme}>
        <div
          style={{
            position: "absolute",
            top: "1.5em",
            left: "1.5em",
            zIndex: "10000",
          }}
        >
          <Tooltip title="explore a bit of a grassland world! inspired by the tallgrass prairie <3">
            <div>{"patch of prairie"}</div>
          </Tooltip>
        </div>

        <div
          style={{
            position: "absolute",
            bottom: "1.5em",
            left: "1.5em",
            zIndex: "10000",
          }}
        >
          <ToggleButton size={"small"} value={!mute} selected={!mute} onClick={toggleMusic} aria-label="toggle music">
            <Tooltip title="toggle music">
              <MusicIcon />
            </Tooltip>
          </ToggleButton>
        </div>

        <div
          style={{
            position: "absolute",
            bottom: "1.5em",
            right: "1.5em",
            zIndex: "10000",
          }}
        >
          <ToggleButtonGroup value={mode} exclusive onChange={handleModeChange} aria-label="mode selection">
            <ToggleButton value="seed" aria-label="seed mode">
              <Tooltip title="seed">
                <SeedIcon />
              </Tooltip>
            </ToggleButton>
            <ToggleButton value="grow" aria-label="grow mode">
              <Tooltip title="grow">
                <GrowIcon />
              </Tooltip>
            </ToggleButton>
            <ToggleButton value="graze" aria-label="graze mode">
              <Tooltip title="graze">
                <SvgIcon>
                  <svg xmlns="http://www.w3.org/2000/svg" width="28px" fill="currentColor" height="24px" viewBox="0 0 115 95">
                    <g>
                      <path
                        fillRule="evenodd"
                        stroke="none"
                        d="M 37.6 27.2C 19.0342 18.9826 1.67678 37.6838 8.43584 56C 10.1417 60.6227 13.7141 67.0488 16.8037 70.8654C 20.0286 74.849 23.9465 75.2366 25.6 80.8C 29.8188 77.9218 30.3864 71.9331 30.4 67.2L 31.2 67.2L 32 70.4C 33.9748 68.0162 35.1446 65.3693 36 62.4L 36.8 62.4C 36.8 69.1652 35.7665 75.1162 33.8241 81.6C 32.97 84.4512 30.9665 88.7832 32.4834 91.7304C 34.0689 94.8104 37.3707 91.1048 38.4766 89.5848C 42.127 84.5664 46.2706 78.7917 48 72.8L 48.8 72.8C 48.7972 77.07 43.7547 89.2104 46.4222 92.2704C 48.2786 94.4 50.5298 90.9832 51.2963 89.5848C 54.4114 83.8992 58.0532 77.3522 60 71.2C 61.8946 72.4215 63.3486 73.4876 64.8 75.2C 67.8216 73.8163 70.2214 71.6913 72.8 69.6L 72 72C 86.8744 69.9872 78.3675 83.8736 80 92.8C 86.3392 91.8136 91.2856 83.9752 93.6 78.4L 94.4 78.4C 94.2952 82.8752 92.388 86.784 92 91.2C 101.418 87.376 106.745 68.5222 108 59.2L 108.8 59.2C 109.058 66.3701 107.426 72.2554 106.4 79.2C 115.994 76.1977 113.521 58.8202 110.371 52C 104.694 39.708 95.6056 31.9066 86.472 22.3889C 80.5832 16.2529 72.5527 8.04544 63.2 8.2228C 57.3807 8.33321 50.7886 13.5827 46.4006 17.0315C 42.7254 19.92 39.692 23.003 37.6 27.2z"
                      />
                    </g>
                  </svg>
                </SvgIcon>
              </Tooltip>
            </ToggleButton>
            <ToggleButton value="fire" aria-label="fire mode">
              <Tooltip title="fire">
                <FireIcon />
              </Tooltip>
            </ToggleButton>
          </ToggleButtonGroup>
        </div>
        <KeyboardControls
          map={[
            { name: "forward", keys: ["ArrowUp", "w", "W"] },
            { name: "backward", keys: ["ArrowDown", "s", "S"] },
            { name: "left", keys: ["ArrowLeft", "a", "A"] },
            { name: "right", keys: ["ArrowRight", "d", "D"] },
            { name: "jump", keys: ["Space"] },
          ]}
        >
          <Canvas onClick={handleSeed} camera={{ fov: 60, position: [0, 0, -60] }} style={{ height: "100vh", width: "100vw" }}>
            <Suspense fallback={null}>
              {[...shapesOnCanvas]}
              <Physics gravity={[0, -30, 0]}>
                <Ground mute={mute} mode={mode} grassData={grassData} planeSize={planeSize} gridSize={gridSize} callback={callback} />

                <Player />
              </Physics>
            </Suspense>
            <ambientLight />
            {/* <Perf /> */}
          </Canvas>
        </KeyboardControls>

        <Loader />
      </ThemeProvider>
    </div>
  );
}

export default App;

function Shape(props) {
  return (
    <Html transform position={props.position}>
      <div className="grasswrapper" style={{ height: "1375" }}>
        <img src={props.image} alt="grass" />
      </div>
    </Html>
  );
}
