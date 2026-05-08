import { type ReactNode } from "react";

type TooltipProps = {
  label: string;
  children: ReactNode;
  side?: "top" | "bottom";
};

export function Tooltip({ label, children, side = "top" }: TooltipProps) {
  const positionClasses =
    side === "top"
      ? "bottom-full mb-2 left-1/2 -translate-x-1/2"
      : "top-full mt-2 left-1/2 -translate-x-1/2";

  return (
    <span className="relative inline-flex group">
      {children}
      <span
        role="tooltip"
        className={[
          "pointer-events-none absolute z-50 whitespace-nowrap",
          "rounded-sm bg-black/80 px-2 py-1 text-xs text-white",
          "opacity-0 group-hover:opacity-100 transition-opacity duration-150",
          positionClasses,
        ].join(" ")}
      >
        {label}
      </span>
    </span>
  );
}
