import "./App.css";

import React, { Suspense, useState } from "react";
import GrazeIcon from "@mui/icons-material/Agriculture";
import GrowIcon from "@mui/icons-material/Grass";
import FireIcon from "@mui/icons-material/LocalFireDepartment";
import SeedIcon from "@mui/icons-material/Grain";

import { Canvas } from "@react-three/fiber";
import { Loader, GizmoHelper, GizmoViewport, PointerLockControls, KeyboardControls, FirstPersonControls } from "@react-three/drei";
import { ToggleButton, ToggleButtonGroup } from "@mui/material";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { Perf } from "r3f-perf";
import { Physics } from "@react-three/rapier";
import { Player } from "./Player";
import { Ground } from "./Ground";

function getRandomInt(max) {
  return Math.floor(Math.random() * max);
}

function App() {
  var imageData = [
    { image: require("./img/grass1.gif") },
    { image: require("./img/grass2.gif") },
    { image: require("./img/grass3.gif") },
    { image: require("./img/grass4.gif") },
    { image: require("./img/grass5.gif") },
    { image: require("./img/grass6.gif") },
    { image: require("./img/grass7.gif") },
    { image: require("./img/grass8.gif") },
  ];

  const [gridSize, setGridSize] = useState(1);
  const planeSize = gridSize * 25;

  function setInitialData(gridsize) {
    var initialData = [];
    for (let i = 0; i < gridsize * gridsize * 10; i++) {
      var imageIndex = getRandomInt(imageData.length);
      initialData.push({
        image: imageData[imageIndex].image,
        position: [getRandomInt(-planeSize + gridSize * planeSize * 0.5), -11, planeSize * 0.3 - getRandomInt(0.6 * gridSize * planeSize)],
      });
    }
    return initialData;
  }

  const [grassData, setGrassData] = useState(setInitialData(gridSize));

  const [mode, setMode] = useState("grow");

  const handleModeChange = (e, newMode) => {
    setMode(newMode);
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

  return (
    <div className="App">
      <ThemeProvider theme={theme}>
        <div
          style={{
            position: "absolute",
            top: "1em",
            left: "1.5em",
            zIndex: "10000",
          }}
        >
          {"patch of prairie"}// or maybe prairie bit
        </div>

        <div
          style={{
            position: "absolute",
            bottom: "1em",
            right: "0.5em",
            zIndex: "10000",
          }}
        >
          <ToggleButtonGroup value={mode} exclusive onChange={handleModeChange} aria-label="mode selection">
            <ToggleButton value="seed" aria-label="seed mode">
              <SeedIcon />
            </ToggleButton>
            <ToggleButton value="grow" aria-label="grow mode">
              <GrowIcon />
            </ToggleButton>
            <ToggleButton value="graze" aria-label="graze mode">
              <GrazeIcon />
            </ToggleButton>
            <ToggleButton value="fire" aria-label="fire mode">
              <FireIcon />
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
          <Canvas camera={{ fov: 60, position: [0, 0, -40] }} style={{ height: "100vh", width: "100vw" }}>
            <Suspense fallback={null}>
              {/* <GizmoHelper
                alignment="top-right" // widget alignment within scene
                margin={[80, 80]} // widget margins (X, Y)
              >
                <GizmoViewport axisColors={["#c6cc8f", "#bdbb99", "#acbd99"]} labelColor="gray" hoverColor="black" />
              </GizmoHelper> */}

              <Physics gravity={[0, -30, 0]}>
                <Ground grassData={grassData} planeSize={planeSize} gridSize={gridSize} />

                <Player />
              </Physics>
            </Suspense>
            <ambientLight />

            {/* <FirstPersonControls
              // activeLook
              enabled
              heightCoef={1}
              heightMax={0.5}
              heightMin={0.5}
              lookSpeed={0}
              lookVertical
              movementSpeed={20}
              verticalMax={3.141592653589793}
              verticalMin={0}
            /> */}
            {/* <PointerLockControls /> */}
            {/* <Perf /> */}
          </Canvas>
        </KeyboardControls>

        <Loader />
      </ThemeProvider>
    </div>
  );
}

export default App;
