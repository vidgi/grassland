import "./App.css";
import React, { Suspense, useState } from "react";
import GrazeIcon from "@mui/icons-material/ContentCut";
import GrowIcon from "@mui/icons-material/Grass";
import FireIcon from "@mui/icons-material/LocalFireDepartment";
import SeedIcon from "@mui/icons-material/Grain";
import MusicIcon from "@mui/icons-material/MusicNote";

import AnimatedCursor from "react-animated-cursor";

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
    14: require("./img/plant7.gif"),
  };

  const gridSize = 1;
  const planeSize = 100;
  const plantMultiplier = 75;
  function setInitialData(gridsize) {
    var initialData = [];
    for (let i = 0; i < gridsize * gridsize * plantMultiplier; i++) {
      // put random species selection here once adding more species
      // limit to only smaller sizes at first
      var imageIndex = getRandomInt(14);
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
      <AnimatedCursor />
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
              <Tooltip title="cut">
                <GrazeIcon />
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
                <Ground mode={mode} grassData={grassData} planeSize={planeSize} gridSize={gridSize} callback={callback} />

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
