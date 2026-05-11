import { useEffect, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import type { GrassStat } from "./Grass";
import type { BisonPosition } from "./Bison";

type Sample = { t: number; biomass: number };

const SAMPLE_INTERVAL_MS = 5000;
const WINDOW_MS = 60_000;

type StatsOverlayProps = {
  bisonCount: number;
  seededCount: number;
  grassStatsRef: MutableRefObject<GrassStat[]>;
  bisonPositionsRef: MutableRefObject<BisonPosition[]>;
  cloudCountRef: MutableRefObject<number>;
  butterflyCountRef: MutableRefObject<number>;
  birdCountRef: MutableRefObject<number>;
  dwellerCountRef: MutableRefObject<number>;
  fireCountRef: MutableRefObject<number>;
  startedAtMs: number;
};

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="opacity-70">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

export function StatsOverlay({
  bisonCount,
  seededCount,
  grassStatsRef,
  bisonPositionsRef,
  cloudCountRef,
  butterflyCountRef,
  birdCountRef,
  dwellerCountRef,
  fireCountRef,
  startedAtMs,
}: StatsOverlayProps) {
  const [, setTick] = useState(0);
  const historyRef = useRef<Sample[]>([]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, []);

  let live = 0;
  let biomass = 0;
  let tallest = 0;
  for (const s of grassStatsRef.current) {
    if (!s) continue;
    live += s.live;
    biomass += s.biomass;
    if (s.tallestFt > tallest) tallest = s.tallestFt;
  }

  const now = performance.now();
  const hist = historyRef.current;
  if (
    hist.length === 0 ||
    now - hist[hist.length - 1].t >= SAMPLE_INTERVAL_MS
  ) {
    hist.push({ t: now, biomass });
    while (hist.length > 0 && now - hist[0].t > WINDOW_MS) hist.shift();
  }

  let slope = 0;
  if (hist.length >= 2) {
    const a = hist[0];
    const b = hist[hist.length - 1];
    const dtMin = (b.t - a.t) / 60_000;
    if (dtMin > 0) slope = (b.biomass - a.biomass) / dtMin;
  }
  const slopeStr = `${slope >= 0 ? "+" : ""}${slope.toFixed(1)}`;

  const elapsedSec = Math.max(0, Math.floor((now - startedAtMs) / 1000));
  const mm = Math.floor(elapsedSec / 60);
  const ss = String(elapsedSec % 60).padStart(2, "0");

  return (
    <div
      data-cursor
      className="absolute top-6 right-6 z-[10000] select-none rounded-md border border-[#708558]/40 bg-white/40 backdrop-blur-sm shadow-sm px-3 py-2 text-[10px] leading-relaxed text-[#3d4a30] min-w-[280px]"
    >
      <div className="opacity-60 mb-1 tracking-wide">patch stats</div>
      <div className="grid grid-cols-2 gap-x-4">
        <div>
          <Row label="grass" value={live} />
          <Row label="planted" value={seededCount} />
          <Row label="bison" value={bisonCount} />
        </div>
        <div>
          <Row label="tallest" value={`${tallest.toFixed(1)} ft`} />
          <Row label="biomass" value={`${biomass.toFixed(0)} sq ft`} />
          <Row label={"\u0394/min"} value={`${slopeStr} sq ft`} />
        </div>
      </div>
      <div className="my-1 border-t border-[#708558]/30" />
      <div className="opacity-60 mb-1 tracking-wide">ecology</div>
      <div className="grid grid-cols-2 gap-x-4">
        <div>
          <Row label="clouds" value={cloudCountRef.current} />
          <Row label="butterflies" value={butterflyCountRef.current} />
        </div>
        <div>
          <Row label="birds" value={birdCountRef.current + dwellerCountRef.current} />
          <Row label="fires" value={fireCountRef.current} />
        </div>
      </div>
      {(() => {
        const list = bisonPositionsRef.current;
        if (list.length === 0) return null;
        let total = 0;
        for (let i = 0; i < list.length; i++) total += list[i].fullness;
        const avg = total / list.length;
        return (
          <Row
            label="avg fullness"
            value={`${Math.round(avg * 100)}%`}
          />
        );
      })()}
      <div className="my-1 border-t border-[#708558]/30" />
      <Row label="time" value={`${mm}:${ss}`} />
    </div>
  );
}
