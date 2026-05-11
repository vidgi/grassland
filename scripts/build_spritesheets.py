#!/usr/bin/env python3
"""Build horizontal sprite-sheet PNGs (+ JSON metadata) from GIFs and APNGs.

For each GIF or animated PNG in --in, decode every frame, normalize to RGBA
at the source canvas size, and paste horizontally into a strip image. Each
output sheet gets a sibling JSON file recording the frame count, frame
dimensions, the source's true average fps (computed from per-frame
durations), and the full list of per-frame durations in milliseconds.

Idempotent: skips a source file if the output PNG is newer than the source.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from statistics import mean
from typing import List

from PIL import Image, ImageSequence


def collect_frame_durations(gif: Image.Image) -> List[int]:
    durations: List[int] = []
    for frame in ImageSequence.Iterator(gif):
        durations.append(int(frame.info.get("duration", 0) or 0))
    return durations


def stitch(gif_path: Path, out_dir: Path, max_edge: int | None) -> dict:
    gif = Image.open(gif_path)
    width, height = gif.size

    durations = collect_frame_durations(gif)

    frames: List[Image.Image] = []
    for frame in ImageSequence.Iterator(gif):
        rgba = frame.convert("RGBA")
        canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        canvas.paste(rgba, (0, 0), rgba)
        frames.append(canvas)

    if not frames:
        raise RuntimeError(f"{gif_path.name}: no frames decoded")

    fw, fh = frames[0].size
    if max_edge is not None:
        scale = min(1.0, max_edge / max(fw, fh))
        if scale < 1.0:
            fw, fh = int(fw * scale), int(fh * scale)
            frames = [
                f.resize((fw, fh), Image.Resampling.LANCZOS) for f in frames
            ]

    n = len(frames)
    sheet = Image.new("RGBA", (fw * n, fh), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        sheet.paste(f, (i * fw, 0))

    nonzero = [d for d in durations if d > 0]
    if nonzero:
        avg_ms = mean(nonzero)
        fps = max(1.0, min(60.0, 1000.0 / avg_ms))
        if nonzero and (max(nonzero) / max(min(nonzero), 1)) > 1.5:
            print(
                f"  warn: {gif_path.name} has variable frame timings "
                f"(min={min(nonzero)}ms max={max(nonzero)}ms); "
                f"using avg fps={fps:.2f}"
            )
    else:
        fps = 10.0
        print(
            f"  warn: {gif_path.name} reported zero frame durations; "
            f"falling back to fps={fps}"
        )

    out_png = out_dir / f"{gif_path.stem}.png"
    out_json = out_dir / f"{gif_path.stem}.json"

    sheet.save(out_png, optimize=True)

    meta = {
        "name": gif_path.stem,
        "frames": n,
        "frameWidth": fw,
        "frameHeight": fh,
        "fps": round(fps, 4),
        "frameDurationsMs": durations,
        "image": f"{gif_path.stem}.png",
    }
    out_json.write_text(json.dumps(meta, indent=2) + "\n")

    return meta


def is_up_to_date(src_path: Path, out_dir: Path) -> bool:
    out_png = out_dir / f"{src_path.stem}.png"
    out_json = out_dir / f"{src_path.stem}.json"
    if not out_png.exists() or not out_json.exists():
        return False
    src_mtime = src_path.stat().st_mtime
    return (
        out_png.stat().st_mtime >= src_mtime
        and out_json.stat().st_mtime >= src_mtime
    )


def is_animated_png(path: Path) -> bool:
    """Return True if the PNG has more than one frame (i.e. is an APNG)."""
    try:
        img = Image.open(path)
        return getattr(img, "n_frames", 1) > 1
    except Exception:
        return False


def main() -> int:
    repo_root = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--in",
        dest="in_dir",
        type=Path,
        default=repo_root / "src" / "img",
        help="directory of source GIFs / APNGs",
    )
    parser.add_argument(
        "--out",
        dest="out_dir",
        type=Path,
        default=repo_root / "src" / "assets" / "sprites",
        help="output directory for PNG strips and JSON metadata",
    )
    parser.add_argument(
        "--max-edge",
        type=int,
        default=None,
        help="optional max frame edge length in pixels for downscale",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="rebuild even if outputs are newer than sources",
    )
    parser.add_argument(
        "--include",
        nargs="*",
        default=None,
        help="optional list of basenames (without extension) to include",
    )
    parser.add_argument(
        "--exclude",
        nargs="*",
        default=["fire", "graze", "grow", "seed"],
        help="basenames to skip (default: UI overlay assets)",
    )
    parser.add_argument(
        "--no-index",
        action="store_true",
        help="skip writing index.json (useful for one-off sheets like the bison)",
    )
    args = parser.parse_args()

    in_dir: Path = args.in_dir
    out_dir: Path = args.out_dir
    out_dir.mkdir(parents=True, exist_ok=True)

    # collect GIFs and animated PNGs (APNGs)
    candidates: list[Path] = sorted(in_dir.glob("*.gif")) + [
        p for p in sorted(in_dir.glob("*.png")) if is_animated_png(p)
    ]

    if args.include is not None:
        wanted = {n.lower() for n in args.include}
        candidates = [c for c in candidates if c.stem.lower() in wanted]
    elif args.exclude:
        skip = {n.lower() for n in args.exclude}
        candidates = [c for c in candidates if c.stem.lower() not in skip]

    if not candidates:
        print(f"no animated sources found in {in_dir}", file=sys.stderr)
        return 1

    print(f"building sprite sheets for {len(candidates)} source(s) -> {out_dir}")

    index = []
    for src in candidates:
        if not args.force and is_up_to_date(src, out_dir):
            print(f"  skip {src.name} (up to date)")
            json_path = out_dir / f"{src.stem}.json"
            index.append(json.loads(json_path.read_text()))
            continue
        print(f"  build {src.name}")
        meta = stitch(src, out_dir, args.max_edge)
        index.append(meta)

    if args.no_index:
        print("skipped index.json (--no-index)")
    else:
        (out_dir / "index.json").write_text(json.dumps(index, indent=2) + "\n")
        print(f"wrote {out_dir / 'index.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
