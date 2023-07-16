import { Html } from "@react-three/drei";

export function GrassBit({ grassData, mode, position, data, callback }) {
  const handleClick = (e) => {
    var x = document.getElementById("audio");
    x.play();

    if (mode === "grow") {
      handleGrow(e);
    }
    if (mode === "graze") {
      handleGraze(e);
    }
    if (mode === "seed") {
      handleSeed(e);
    }
    if (mode === "fire") {
      handleFire(e);
    }
  };

  const handleGraze = (e) => {
    console.log("graze");
    const img = document.getElementById(e.target.id);
    img.style.scale = 0.75;
  };

  const handleGrow = (e) => {
    console.log("grow");
    const img = document.getElementById(e.target.id);
    img.style.scale = 1.5;
  };

  const handleSeed = (e) => {
    console.log("seed");
  };

  const handleFire = (e) => {
    const img = document.getElementById(e.target.id);
    img.parentNode.removeChild(img);

    console.log("fire");
  };

  var bluestemData = {
    0: require("./img/grass1.gif"),
    1: require("./img/grass1.gif"),
    2: require("./img/grass2.gif"),
    3: require("./img/grass3.gif"),
    4: require("./img/grass4.gif"),
    5: require("./img/grass5.gif"),
    6: require("./img/grass6.gif"),
    7: require("./img/grass7.gif"),
    8: require("./img/grass8.gif"),
  };

  //   const handleGrow = (e) => {
  //     const grassToGrowIndex = grassData.findIndex((f) => f.id === e.target.id);
  //     if (grassToGrowIndex) {
  //       const grassToGrow = grassData[grassToGrowIndex];
  //       const newGrassSize = grassToGrow.size + 1;
  //       // update size and image
  //       grassToGrow.size = newGrassSize;
  //       grassToGrow.image = bluestemData[newGrassSize];
  //       // replace grass in data
  //       grassData.splice(grassToGrowIndex, 1, grassToGrow);
  //       // send back to parent
  //       callback(grassData);
  //     }
  //   };

  return (
    <>
      <Html transform position={position}>
        <div className="grasswrapper" style={{ height: "1375" }}>
          <img id={data.id} onClick={handleClick} src={data.image} alt="grass" />
        </div>
      </Html>
    </>
  );
}
