# portfolio-v3

Single-page personal portfolio built with Astro, Tailwind CSS v4 and shadcn/ui
tokens. Static output. The default view is a small 3D open-world city district (three.js,
loaded on demand, see [City](#city)); the classic page is always in the HTML and
needs no JavaScript beyond a few tiny inline scripts (theme, entrance motion).

Third-party credits and licences: see `THIRD_PARTY_NOTICES.md`.

## Requirements

- Node 22.23.4 or newer (Astro 7). `.nvmrc` pins the major version (`22`).
- pnpm

## Commands

```sh
pnpm install
pnpm dev       # dev server at http://localhost:4321
pnpm build     # static build to ./dist (then prunes unused JS, see below)
pnpm preview   # serve the built site locally
pnpm check     # type-check with astro check
```

`pnpm build` runs `astro build && node scripts/prune-dist.mjs` (chained in the
`build` script, so it also runs in CI). The prune script deletes JavaScript files in `dist/_astro` that no built HTML or CSS
references (the unused React runtime) and prints what it removed.

## Deploy (GitHub Pages)

The site is served at the root of <https://maverickemanuel.github.io>
(`site` is set in `astro.config.mjs`, no `base`).

- `.github/workflows/deploy.yml` builds with `withastro/action` and publishes
  with `actions/deploy-pages`. **Pushing to `main` deploys**; the workflow can
  also be run by hand (`workflow_dispatch`).
- One-time setup in the GitHub repo: Settings > Pages > Build and deployment >
  Source: **GitHub Actions**.
- On a free GitHub plan, Pages only works for a **public** repository.
- A user site must live in a repo named exactly `MaverickEmanuel.github.io`.
  The plan is to rename the repo (currently `portfolio`) to that, then update
  the local remote (`git remote set-url origin ...`). GitHub redirects the old
  name, but the Pages URL only becomes the root address after the rename.

## Theme

The site is dark by default for every visitor. A saved choice (`localStorage`
key `theme`, `light` or `dark`, set by the toggle) wins when present. The
system colour-scheme preference is not used.

## Updating content

All copy lives in `src/content/site.ts`. Components only render from it.

- **Text, links, tags, experience:** edit the matching fields in `site.ts`.
- **Profile links (GitHub, LinkedIn):** the `profiles` list near the top of
  `site.ts`; it feeds both the header and the footer, in that order.
- **Add the portrait:** put the image in `src/assets/` (for example
  `portrait.jpg`, ideally 4:5 and at least 600 x 750), add
  `import portraitImage from "@/assets/portrait.jpg"` at the top of `site.ts`,
  and change `portrait: null,` to
  `portrait: { image: portraitImage, alt: "Describe the photo" },`.
- **Switch Roflow to a screenshot:** save the image as
  `src/assets/roflow-screenshot.png` (`.jpg` or `.webp` also work), then in the
  Roflow project change `media: roflowLogoMedia,` to
  `media: roflowScreenshotMedia(),`. The screenshot is shown inside a
  desktop-app window frame on the gradient panel.
- **DemoPilot video:** `public/media/demopilot-first-demo.mp4` with its poster
  `public/media/demopilot-poster.jpg`; paths are set in `site.ts`.

## City

The default view is a few closed-off blocks of a low-poly city that you walk
or drive around, in the style of an open-world action game (original art,
wording and fonts; nothing from any existing game). Each place in the
district opens a section of the site. The classic page stays fully rendered
underneath (no-JS visitors, search engines and screen readers always get it),
and both views share the same content from `src/content/site.ts`.

Controls: WASD/arrows to move, Shift to sprint, Space to jump, click/tap to
walk, drag to look, wheel/pinch to zoom, E to enter a place, F to get in or
out of the car (W/S gas and brake/reverse, A/D steer, Space handbrake), P for
the phone. Touch screens get a joystick (push to the rim to sprint; while
driving, x steers and y throttles) plus Gas and Brake pedals. The phone lists
every place, so keyboard and screen-reader users can open any section
directly.

### How the views work

- **Before first paint** an inline script in `src/layouts/Base.astro` adds
  `html.view-city` or `html.view-classic`. A saved choice (`localStorage`
  key `view`: `city` or `classic`; the older `island` value counts as `city`)
  wins. Otherwise it is the city, except with `prefers-reduced-motion:
  reduce`, without WebGL support, or after the city failed to start earlier
  in the session (`sessionStorage` `city-failed`). With JS off neither class
  is set and only the classic page shows. CSS for both states is at the end
  of `src/styles/global.css`.
- **Switching:** any `[data-view-switch="city" | "classic"]` button ("Classic
  view" in the HUD and the phone, "Explore the city" in the header) stores the
  choice and switches in place. `src/city/boot.ts` handles this (and the
  loading-screen tips); it is tiny and has no three.js.
- **Lazy loading:** `boot.ts` loads `src/city/index.ts` (and three.js) with a
  dynamic `import()` only when the city is shown, so classic visitors
  download none of it. The city chunk is about 165 kB gzipped; the HUD font
  (Oswald) is only fetched in the city view.
- **Fallback:** if WebGL cannot start (or the context is lost), the page
  switches to classic and shows a one-line note.
- **Phones:** coarse pointers or narrow screens use a `lowPower` path (pixel
  ratio capped at 1.5, a smaller shadow map, fewer water segments, the
  minimap redrawn every other frame). Static geometry is merged by material,
  so the whole district is roughly 120 to 170 draw calls.

### Code map

| File | What it does |
| --- | --- |
| `src/city/landmarks.ts` | The places: id, label, section, model, position, facing, footprint, blip colour. Pure data, shared by the HUD markup and the scene. |
| `src/city/layout.ts` | Roads, raised blocks, filler buildings, palms, lamps, parked cars, spawn points and the box/circle colliders. No three.js. |
| `src/city/palette.ts` | Neon dusk (dark theme) and golden hour (light theme) lighting, fog and sky; shared material colours. |
| `src/city/scene.ts` | Renderer, camera, lights, sky, water, merged city geometry, skyline, overpass; theme swap; dispose. |
| `src/city/models.ts` | Place models and the car built from primitives, canvas-texture signs, a material kit and `mergeStatic`. |
| `src/city/car.ts` | Arcade car handling (grip, handbrake slide, collisions). |
| `src/city/character.ts` | The blocky player and its walk/sprint cycle. |
| `src/city/controls.ts` | Keys, click/tap to walk, joystick, pedals, drag to orbit, wheel/pinch zoom. |
| `src/city/minimap.ts` | The rotating minimap with blips, car icon and GPS line. |
| `src/city/ui.ts` | Phone, objective card, car prompt, GPS chip, speedometer, floating markers, content dialog. |
| `src/city/index.ts` | Wires it together: on foot and driving, chase camera, intro sweep, waypoints, render loop, cleanup. |
| `src/city/boot.ts` | View switching, lazy loading and loader tips (see above). |
| `src/components/city/CityShell.astro` | The city's DOM: canvas, HUD, loader, phone, dialog. |
| `src/components/city/CityPanels.astro` | Dialog content per place, rendered from `site.ts`. |

### Moving or adding a place

- **Move one:** change its `position` (`[x, z]`, footprint centre) and
  `facing` (a quarter turn; front is local +z) in `src/city/landmarks.ts`,
  and keep its footprint clear of roads and the filler `buildings` in
  `src/city/layout.ts`. Colliders, the entrance marker, the label, the
  minimap and the phone follow automatically.
- **Add one:** add an entry to `landmarks` (its `id` is also the panel id),
  add a `<template id="city-panel-{id}">` to `CityPanels.astro` that renders
  the content from `site.ts` (give its heading `id="city-dialog-title"
  tabindex="-1"`), and either reuse a `model` or add a builder to
  `src/city/models.ts` (front faces local +z, base on y = 0).

### Changing the default view

The default lives in the head script in `src/layouts/Base.astro`: replace the
line that picks `"city"` (when no choice is saved) with `"classic"` to make
the classic page the default and the city opt-in via "Explore the city".
