import React from "react";
import { Box } from "@react-three/drei";
import { CuboidCollider, RigidBody } from "@react-three/rapier";
import { GrassBit } from "./GrassBit";

export function Ground({ mute, mode, grassData, planeSize, gridSize, callback }) {
  const planeArgs = planeSize * gridSize;

  var grasses = grassData?.map(function (_, index) {
    return (
      <GrassBit
        mute={mute}
        grassData={grassData}
        mode={mode}
        key={grassData[index].id}
        position={grassData[index].position}
        data={grassData[index]}
        callback={callback}
      />
    );
  });

  return (
    <RigidBody type="fixed" colliders={false}>
      {grasses}
      <Box material-color="#99b27a" args={[planeArgs, planeArgs, 0]} position={[0, -10, 0]} rotation={[-Math.PI / 2, 0, 0]} />
      <CuboidCollider args={[1000, 2, 1000]} position={[0, -2, 0]} />
    </RigidBody>
  );
}
