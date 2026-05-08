import { useEffect, useRef } from "react";
import type { Mode } from "./Grass";

import fireGif from "./img/fire.gif";
import grazeGif from "./img/graze.gif";
import growGif from "./img/grow.gif";
import seedGif from "./img/seed.gif";

const MODE_GIF: Record<Exclude<Mode, null>, string> = {
  fire: fireGif,
  graze: grazeGif,
  grow: growGif,
  seed: seedGif,
};

// grayscale -> sepia -> hue-rotate to blue -> boost saturation
const BLUE_TINT =
  "grayscale(0.5) brightness(0.2)";

type CursorProps = { mode: Mode };

export function Cursor({ mode }: CursorProps) {
  const dotRef = useRef<HTMLDivElement>(null);
  const spriteRef = useRef<HTMLImageElement>(null);
  const modeRef = useRef<Mode>(mode);
  const visible = useRef(false);

  modeRef.current = mode;

  useEffect(() => {
    if (window.matchMedia("(pointer: coarse)").matches) return;

    const handleMove = (e: PointerEvent) => {
      if (!visible.current) {
        visible.current = true;
        if (dotRef.current) dotRef.current.style.opacity = "1";
      }
      if (dotRef.current) {
        dotRef.current.style.transform = `translate3d(${e.clientX}px,${e.clientY}px,0) translate(-50%,-50%)`;
      }
      const el = spriteRef.current;
      if (!el || modeRef.current === null) return;
      el.style.transform = `translate3d(${e.clientX}px,${e.clientY}px,0) translate(-50%,-100%)`;
      el.style.opacity = "1";
    };

    const handleLeave = () => {
      visible.current = false;
      if (dotRef.current) dotRef.current.style.opacity = "0";
      if (spriteRef.current) spriteRef.current.style.opacity = "0";
    };

    window.addEventListener("pointermove", handleMove);
    document.addEventListener("mouseleave", handleLeave);

    return () => {
      window.removeEventListener("pointermove", handleMove);
      document.removeEventListener("mouseleave", handleLeave);
    };
  }, []);

  useEffect(() => {
    if (mode === null && spriteRef.current) {
      spriteRef.current.style.opacity = "0";
    }
  }, [mode]);

  const gifSrc = mode !== null ? MODE_GIF[mode] : MODE_GIF.seed;

  return (
    <>
      <div
        ref={dotRef}
        aria-hidden
        className="pointer-events-none fixed top-0 left-0 z-[99999] opacity-0"
        style={{
          width: 6,
          height: 6,
          borderRadius: 9999,
          backgroundColor: "#3d4a30",
          willChange: "transform, opacity",
        }}
      />
      <img
      ref={spriteRef}
      src={gifSrc}
      alt=""
      aria-hidden
      className="pointer-events-none fixed top-0 left-0 z-[99999] opacity-0 select-none"
      style={{
        height: 100,
        width: "auto",
        imageRendering: "pixelated",
        willChange: "transform, opacity",
        filter: BLUE_TINT,
      }}
      />
    </>
  );
}
