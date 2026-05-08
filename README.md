# grassland

a small wandering-through-grass game inspired by the tallgrass prairie.

## stack

- [vite](https://vitejs.dev/) + [typescript](https://www.typescriptlang.org/) + [pnpm](https://pnpm.io/)
- [tailwindcss v4](https://tailwindcss.com/) for ui chrome
- [react-three-fiber](https://r3f.docs.pmnd.rs/) + [drei](https://github.com/pmndrs/drei) + [@react-three/rapier](https://github.com/pmndrs/react-three-rapier) on [three.js](https://threejs.org/)
- [lucide-react](https://lucide.dev/) icons; the cursor is hand-rolled
- gif fronds are baked into sprite-sheet pngs at build time and animated on
  the gpu via a small custom shader, with the original gif's frame rate
  preserved per type and per-instance phase variance.

## develop

```sh
pnpm install
pnpm dev          # http://localhost:5173/grassland/
```

## build / deploy

```sh
pnpm build        # tsc + vite build -> dist/
pnpm preview      # serve the production bundle locally
pnpm deploy       # gh-pages -d dist
```

## sprite sheets

every plant gif lives in `src/img/`. the python script in `scripts/`
converts them to horizontal sprite-strip pngs plus a json metadata file
(`frames`, `frameWidth`, `frameHeight`, `fps`, `frameDurationsMs`)
written to `src/assets/sprites/`. `fps` is computed from each gif's
real frame durations so each grass type plays at its source rate.

one-time setup:

```sh
pip install -r scripts/requirements.txt
```

regenerate sheets (idempotent — skips when sheet is newer than gif):

```sh
pnpm build:sprites
```

flags:

```sh
python3 scripts/build_spritesheets.py --help
# --in DIR        source gif directory (default src/img)
# --out DIR       output directory (default src/assets/sprites)
# --max-edge PX   downscale frames so longest edge <= PX
# --force         rebuild even when outputs are up to date
# --include ...   only build these gif basenames
# --exclude ...   skip these gif basenames (default: fire graze grow seed)
```

## controls

- `w` / `a` / `s` / `d` (or arrows) to walk
- `space` to jump
- click a grass blade to interact: `grow`, `graze`, or `fire` mode
- `music` toggle in the bottom-left
