import * as THREE from "three";
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useKeyboardControls } from "@react-three/drei";
import {
  CapsuleCollider,
  RigidBody,
  useRapier,
  type RapierRigidBody,
} from "@react-three/rapier";

const SPEED = 15;

// Isometric camera offset — equal parts X, Y, Z gives classic 45° iso angle
const ISO_OFFSET = new THREE.Vector3(80, 80, 80);

// Movement axes in world space for isometric controls:
// "forward" moves along the iso forward diagonal (-X -Z), "right" along (+X -Z)
const ISO_FORWARD = new THREE.Vector3(-1, 0, -1).normalize();
const ISO_RIGHT = new THREE.Vector3(1, 0, -1).normalize();

const velocity3 = new THREE.Vector3();
const playerPos = new THREE.Vector3();

export function Player() {
  const ref = useRef<RapierRigidBody>(null);
  const { rapier, world } = useRapier();
  const [, get] = useKeyboardControls();

  useFrame((state) => {
    if (!ref.current) return;
    const { forward, backward, left, right, jump } = get() as {
      forward: boolean;
      backward: boolean;
      left: boolean;
      right: boolean;
      jump: boolean;
    };

    const vel = ref.current.linvel();
    const t = ref.current.translation();
    playerPos.set(t.x, t.y, t.z);

    // camera follows player at fixed isometric offset
    state.camera.position.copy(playerPos).add(ISO_OFFSET);
    state.camera.lookAt(playerPos);

    // movement along iso world axes
    velocity3.set(0, 0, 0);
    if (forward) velocity3.addScaledVector(ISO_FORWARD, SPEED);
    if (backward) velocity3.addScaledVector(ISO_FORWARD, -SPEED);
    if (right) velocity3.addScaledVector(ISO_RIGHT, SPEED);
    if (left) velocity3.addScaledVector(ISO_RIGHT, -SPEED);

    ref.current.setLinvel(
      { x: velocity3.x, y: vel.y, z: velocity3.z },
      true
    );

    const ray = world.castRay(
      new rapier.Ray(ref.current.translation(), { x: 0, y: -1, z: 0 }),
      4,
      true
    );
    const grounded = !!ray && Math.abs(ray.timeOfImpact) <= 1.75;
    if (jump && grounded) {
      ref.current.setLinvel({ x: 0, y: 7.5, z: 0 }, true);
    }
  });

  return (
    <RigidBody
      ref={ref}
      colliders={false}
      mass={1}
      type="dynamic"
      position={[0, 0, 0]}
      enabledRotations={[false, false, false]}
    >
      <CapsuleCollider args={[0.75, 0.5]} />
    </RigidBody>
  );
}
