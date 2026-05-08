import * as THREE from "three";

const vertex = /* glsl */ `
attribute float aPhase;
attribute float aScale;
attribute float aOpacity;

varying vec2 vUv;
varying float vPhase;
varying float vOpacity;

void main() {
  vUv = uv;
  vPhase = aPhase;
  vOpacity = aOpacity;

  vec4 instOrigin = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);

  vec3 toCam = cameraPosition - instOrigin.xyz;
  float yaw = atan(toCam.x, toCam.z);
  float c = cos(yaw);
  float s = sin(yaw);
  mat3 rotY = mat3(
    c,   0.0, -s,
    0.0, 1.0, 0.0,
    s,   0.0,  c
  );

  vec3 local = vec3(position.x * aScale, position.y * aScale, 0.0);
  vec3 rotated = rotY * local;

  vec4 worldPos = vec4(instOrigin.xyz + rotated, 1.0);
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const fragment = /* glsl */ `
precision highp float;

uniform sampler2D uMap;
uniform float uFrames;
uniform float uFps;
uniform float uTime;
uniform float uTint;

varying vec2 vUv;
varying float vPhase;
varying float vOpacity;

void main() {
  float frame = floor(mod(uTime * uFps + vPhase * uFrames, uFrames));
  float fx = clamp(vUv.x, 0.001, 0.999);
  vec2 uv = vec2((fx + frame) / uFrames, vUv.y);
  vec4 c = texture2D(uMap, uv);
  if (c.a < 0.05) discard;

  vec3 inv = mix(c.rgb, vec3(1.0) - c.rgb, uTint);
  gl_FragColor = vec4(inv, c.a * vOpacity);
}
`;

export type GrassMaterial = THREE.ShaderMaterial & {
  userData: {
    isGrass: true;
  };
};

export function createGrassMaterial(
  texture: THREE.Texture,
  frames: number,
  fps: number
): GrassMaterial {
  const mat = new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uMap: { value: texture },
      uFrames: { value: frames },
      uFps: { value: fps },
      uTime: { value: 0 },
      uTint: { value: 0.3 },
    },
  }) as GrassMaterial;
  mat.userData = { isGrass: true };
  return mat;
}
