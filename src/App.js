import "./App.css";

import { Suspense } from "react";

import { Canvas } from "react-three-fiber";
import { Loader, Html, FirstPersonControls, OrbitControls } from "@react-three/drei";

function shuffle(array) {
  let currentIndex = array.length,
    randomIndex;

  // While there remain elements to shuffle.
  while (currentIndex !== 0) {
    // Pick a remaining element.
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    // And swap it with the current element.
    [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
  }

  return array;
}

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
  imageData = shuffle(imageData);

  var viewportData = [
    [0, 10, 60],
    [0, -50, 60],
    [0, -20, 60],
    [0, 20, 60],
    [0, -30, 60],
  ];
  // viewportData = shuffle(viewportData);

  var namesList = imageData.map(function (_, index) {
    return <FeaturedImage position={[-50 + index * 10, 0, getRandomInt(20)]} data={imageData[index]} />;
  });

  var grasses = imageData.map(function (_, index) {
    return <FeaturedImage position={[getRandomInt(50), getRandomInt(20), getRandomInt(20)]} data={imageData[index]} />;
  });

  var grasses2 = imageData.map(function (_, index) {
    return <FeaturedImage position={[-50 + getRandomInt(50), getRandomInt(20), getRandomInt(40)]} data={imageData[index]} />;
  });

  var grasses3 = imageData.map(function (_, index) {
    return <FeaturedImage position={[-20 + getRandomInt(50), getRandomInt(20), getRandomInt(40)]} data={imageData[index]} />;
  });

  return (
    <div className="App">
      {/* <Canvas camera={{ fov: 75, position: [0, -30, 10] }} style={{ height: "100vh", width: "100vw" }}> */}
      <Canvas camera={{ fov: 75, position: viewportData[0] }} style={{ height: "100vh", width: "100vw" }}>
        {/* <color attach="background" args={["#cfe0ba"]} /> */}

        <Suspense fallback={null}>
          <group transform scale={[1, 1, 1]} position={[20, 0, -25]}>
            {namesList}
            {grasses}
            {grasses2}
            {grasses3}
          </group>
          {/* <group transform scale={[1, 1, 1]} position={[20, 0, -25]}>
            <FeaturedImage position={[-20, 0, 55]} data={imageData[0]} rotation={[0 * (Math.PI / 180), 180 * (Math.PI / 180), 0]} />
            <FeaturedImage position={[-5, 0, 51]} data={imageData[1]} rotation={[0 * (Math.PI / 180), -150 * (Math.PI / 180), 0]} />
            <FeaturedImage position={[6, 0, 40]} data={imageData[2]} rotation={[0 * (Math.PI / 180), -120 * (Math.PI / 180), 0]} />
            <FeaturedImage position={[10, 0, 25]} data={imageData[3]} rotation={[0 * (Math.PI / 180), -90 * (Math.PI / 180), 0]} />
            <FeaturedImage position={[6, 0, 10]} data={imageData[4]} rotation={[0 * (Math.PI / 180), -60 * (Math.PI / 180), 0]} />
            <FeaturedImage position={[-5, 0, -1]} data={imageData[5]} rotation={[0 * (Math.PI / 180), -30 * (Math.PI / 180), 0]} />
            <FeaturedImage position={[-20, 0, -5]} data={imageData[6]} rotation={[0 * (Math.PI / 180), 0 * (Math.PI / 180), 0]} />
            <FeaturedImage position={[-35, 0, -1]} data={imageData[7]} rotation={[0 * (Math.PI / 180), 30 * (Math.PI / 180), 0]} />
          </group> */}
        </Suspense>
        <ambientLight />
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
        {/* <OrbitControls /> */}
        {/* <OrbitControls enableRotate={false} enablePan={true} minDistance={5} maxDistance={200} autoRotate={false} autoRotateSpeed={0.8} /> */}
      </Canvas>
      <Loader />
    </div>
  );
}

export default App;

function FeaturedImage(props) {
  return (
    <>
      <Html transform position={props.position} rotation={props.rotation}>
        {/* <a href={props.data.link} target="_blank" rel="noreferrer"> */}
        <img src={props.data.image} alt="thumbnail" />
        {/* </a> */}
        {/* <p className="flip">{props.data.title}</p> */}
      </Html>
    </>
  );
}
