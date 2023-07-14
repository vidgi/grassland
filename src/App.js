import "./App.css";

import { Suspense, useState } from "react";

import { Canvas } from "react-three-fiber";
import { Loader, Html, FirstPersonControls, Plane, OrbitControls } from "@react-three/drei";

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

  const [isFirstPersonControls, setFirstPersonControls] = useState(false);
  const [grassData, setGrassData] = useState(setInitialData(gridSize));

  const handleSpace = (e) => {
    if (e.code === "Space") {
      setFirstPersonControls(!isFirstPersonControls);
    }
  };

  return (
    <div className="App">
      <Canvas onKeyDown={handleSpace} camera={{ fov: 75, position: [0, 0, 30] }} style={{ height: "100vh", width: "100vw" }}>
        <Suspense fallback={null}>
          <GrassGrid grassData={grassData} planeSize={planeSize} gridSize={gridSize} />
        </Suspense>
        <ambientLight />

        {isFirstPersonControls ? (
          <FirstPersonControls
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
          />
        ) : (
          <OrbitControls minDistance={5} maxDistance={200} autoRotate={false} autoRotateSpeed={0.8} />
        )}
      </Canvas>
      <Loader />
    </div>
  );
}

export default App;

function GrassGrid(props) {
  const planeArgs = props.planeSize * props.gridSize;
  const grassData = props.grassData;

  var grasses = grassData.map(function (_, index) {
    return <GrassBit key={index + "grass3"} position={grassData[index].position} data={grassData[index]} />;
  });

  return (
    <>
      {grasses}
      <Plane material-color="#99b27a" args={[planeArgs, planeArgs]} position={[0, -10, 0]} rotation={[-Math.PI / 2, 0, 0]} />
    </>
  );
}

function GrassBit(props) {
  return (
    <>
      <Html transform position={props.position} rotation={props.rotation}>
        <div className="grasswrapper" style={{ height: "1375" }}>
          <img src={props.data.image} alt="grass" />
        </div>
      </Html>
    </>
  );
}
