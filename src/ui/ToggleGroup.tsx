import { type ReactNode } from "react";

type ToggleOption<T extends string> = {
  value: T;
  label: string;
  content: ReactNode;
};

type ToggleGroupProps<T extends string> = {
  value: T | null;
  onChange: (next: T | null) => void;
  options: ToggleOption<T>[];
  ariaLabel: string;
};

export function ToggleGroup<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: ToggleGroupProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex rounded-md border border-[#708558]/40 bg-white/40 backdrop-blur-sm shadow-sm"
    >
      {options.map((opt, idx) => {
        const selected = value === opt.value;
        const isFirst = idx === 0;
        const isLast = idx === options.length - 1;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={opt.label}
            data-cursor
            onClick={() => onChange(selected ? null : opt.value)}
            className={[
              "relative px-3 py-2 text-sm transition-colors duration-150 outline-none",
              "border-l border-[#708558]/30 first:border-l-0",
              isFirst ? "rounded-l-md" : "",
              isLast ? "rounded-r-md" : "",
              "focus-visible:ring-2 focus-visible:ring-[#708558]/60",
              selected
                ? "bg-[#99b27a]/70 text-black"
                : "text-[#3d4a30] hover:bg-[#99b27a]/30",
            ].join(" ")}
          >
            {opt.content}
          </button>
        );
      })}
    </div>
  );
}

type ToggleButtonProps = {
  pressed: boolean;
  onClick: () => void;
  ariaLabel: string;
  children: ReactNode;
};

export function ToggleButton({
  pressed,
  onClick,
  ariaLabel,
  children,
}: ToggleButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={ariaLabel}
      data-cursor
      onClick={onClick}
      className={[
        "p-2 rounded-md border border-[#708558]/40 backdrop-blur-sm shadow-sm",
        "transition-colors duration-150 outline-none",
        "focus-visible:ring-2 focus-visible:ring-[#708558]/60",
        pressed
          ? "bg-[#99b27a]/70 text-black"
          : "bg-white/40 text-[#3d4a30] hover:bg-[#99b27a]/30",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
