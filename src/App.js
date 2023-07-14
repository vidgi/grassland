import "./App.css";

import { Suspense, useState } from "react";

import { Canvas } from "react-three-fiber";
import { Loader, Html, FirstPersonControls, Plane, OrbitControls } from "@react-three/drei";

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
    [0, 0, 60],
    [0, -50, 60],
    [0, -20, 60],
    [0, 20, 60],
    [0, -30, 60],
  ];
  // viewportData = shuffle(viewportData);

  var namesList = imageData.map(function (_, index) {
    return <FeaturedImage key={index + "grass0"} position={[-50 + index * 10, -11, getRandomInt(20)]} data={imageData[index]} />;
  });

  var grasses = imageData.map(function (_, index) {
    return <FeaturedImage key={index + "grass1"} position={[getRandomInt(50), -11, getRandomInt(20)]} data={imageData[index]} />;
  });

  var grasses2 = imageData.map(function (_, index) {
    return <FeaturedImage key={index + "grass2"} position={[-50 + getRandomInt(50), -11, getRandomInt(40)]} data={imageData[index]} />;
  });

  var grasses3 = imageData.map(function (_, index) {
    return <FeaturedImage key={index + "grass3"} position={[-20 + getRandomInt(50), -11, getRandomInt(40)]} data={imageData[index]} />;
  });

  // document.addEventListener('keyup', event => {
  //   if (event.code === 'Space') {
  //     console.log('Space pressed')
  //   }
  // })

  const [isFirstPersonControls, setFirstPersonControls] = useState(true);

  // const toggleControls() => {
  //   setFirstPersonControls(!isFirstPersonControls);
  // };

  const handleSpace = (e) => {
    if (e.code === "Space") {
      // toggleControls();
      setFirstPersonControls(!isFirstPersonControls);

      console.log("Space pressed");
    }
  };

  return (
    <div className="App">
      {/* <Canvas camera={{ fov: 75, position: [0, -30, 10] }} style={{ height: "100vh", width: "100vw" }}> */}
      <Canvas onKeyDown={handleSpace} camera={{ fov: 75, position: viewportData[0] }} style={{ height: "100vh", width: "100vw" }}>
        {/* <color attach="background" args={["#cfe0ba"]} /> */}

        <Suspense fallback={null}>
          {namesList}
          {grasses}
          {grasses2}
          {grasses3}
          <Plane material-color="#99b27a" args={[50, 50]} position={[0, -10, 0]} rotation={[-Math.PI / 2, 0, 0]} />
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

function FeaturedImage(props) {
  return (
    <>
      <Html transform position={props.position} rotation={props.rotation}>
        {/* <a href={props.data.link} target="_blank" rel="noreferrer"> */}
        <div className="grasswrapper" style={{ height: "1375" }}>
          <img src={props.data.image} alt="thumbnail" />
          {/* </a> */}
          {/* <p className="flip">{props.data.title}</p> */}
        </div>
      </Html>
    </>
  );
}
