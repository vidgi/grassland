import * as THREE from "three";
import { useTexture, Box, Html } from "@react-three/drei";
import { CuboidCollider, RigidBody } from "@react-three/rapier";
import grass from "./assets/grass.jpg";

export function Ground(props) {
  const texture = useTexture(grass);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  const planeArgs = props.planeSize * props.gridSize;
  const grassData = props.grassData;

  var grasses = grassData.map(function (_, index) {
    return <GrassBit key={index + "grass3"} position={grassData[index].position} data={grassData[index]} />;
  });

  return (
    <RigidBody {...props} type="fixed" colliders={false}>
      {/* <planeGeometry args={[1000, 1000]} /> */}
      {/* <group rotation={[0, Math.PI / 4, 0]}> */}
      {grasses}
      <Box material-color="#99b27a" args={[planeArgs, planeArgs, 0]} position={[0, -10, 0]} rotation={[-Math.PI / 2, 0, 0]} />
      {/* </group> */}
      <CuboidCollider args={[1000, 2, 1000]} position={[0, -2, 0]} />
    </RigidBody>
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
