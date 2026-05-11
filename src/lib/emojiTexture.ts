import * as THREE from "three";

const cache = new Map<string, THREE.Texture>();

// Render a single emoji glyph to a square canvas and wrap it as a Three
// texture. Result is cached per (emoji, size) so multiple agents share one
// GPU upload.
export function emojiTexture(emoji: string, size = 128): THREE.Texture {
  const key = `${emoji}@${size}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("emojiTexture: no 2d context");

  // Apple Color Emoji on macOS, Segoe UI Emoji on Windows, Noto Color Emoji
  // on Linux — fallback chain renders something on every platform.
  ctx.font = `${Math.floor(size * 0.8)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",serif`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText(emoji, size / 2, size / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  cache.set(key, tex);
  return tex;
}
