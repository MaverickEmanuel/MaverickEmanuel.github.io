# Maverick Emanuel: portfolio

My personal portfolio: **<https://maverickemanuel.github.io>**

By default it opens as a small low-poly island that you walk around. Each
landmark opens one part of the portfolio: projects, experience, education,
what I do off the clock, and contact. There's ambient sound you can turn off,
and a "Classic view" button switches to a plain single-page version at any
time. Visitors who prefer reduced motion, or whose browsers can't run WebGL,
get the classic page automatically.

Built with Astro 7, Tailwind CSS v4 and three.js. The site is static, has no
backend and loads no third-party scripts.

---

The rest of this README is for working on the site.

Single-page site built with Astro, Tailwind CSS v4 and shadcn/ui tokens.
Static output. The default view is the 3D island (three.js, loaded on demand,
see [Island](#island)); the classic page is always in the HTML and needs no
JavaScript beyond a few tiny inline scripts (theme, entrance motion).

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

## Island

The default view is a low-poly island you walk around; each landmark opens a
section of the site. The classic page stays fully rendered underneath (no-JS
visitors, search engines and screen readers always get it), and both views
share the same content from `src/content/site.ts`.

### How the views work

- **Before first paint** an inline script in `src/layouts/Base.astro` adds
  `html.view-island` or `html.view-classic`. A saved choice (`localStorage`
  key `view`: `island` or `classic`) wins. Otherwise it is the island, except
  with `prefers-reduced-motion: reduce`, without WebGL support, or after the
  island failed to start earlier in the session (`sessionStorage`
  `island-failed`). With JS off neither class is set and only the classic page
  shows. CSS for both states is at the end of `src/styles/global.css`.
- **Switching:** any `[data-view-switch="island" | "classic"]` button ("Classic
  view" in the island HUD, "Explore the island" in the header) stores the
  choice and switches in place. `src/island/boot.ts` handles this; it is tiny
  and has no three.js.
- **Lazy loading:** `boot.ts` loads `src/island/index.ts` (and three.js) with a
  dynamic `import()` only when the island is shown, so classic visitors
  download none of it. The island chunk is about 165 kB gzipped; its three
  sound files (about 385 kB) are fetched with it, never by the classic page.
- **Fallback:** if WebGL cannot start (or the context is lost), the page
  switches to classic and shows a one-line note.

### Controls

WASD or the arrow keys to walk, Space to jump, E to open the landmark you're
next to, M to mute. Click or tap the ground to walk there, drag to orbit the
camera, and scroll or pinch to zoom. Touch devices also get an on-screen
joystick. In a popup, ← and → (or the buttons at the bottom) show the
previous or next landmark without moving the player, and Esc closes it. On phones the popup is a bottom sheet you can swipe down to close.
Space always jumps (outside popups), even when a HUD button has focus. Enter
presses a focused button.

### First visit, sound and saved state

- **Welcome card:** shown on the first visit only. "Explore" starts the island
  (and the sound, if its switch is on). "View classic portfolio" switches
  views. The name button in the top bar opens the card again.
- **Sound:** an ocean bed, occasional gulls, a campfire that gets louder as you
  approach, popup open and close, an arrival chime, UI clicks, footsteps per
  surface (grass, stone, sand, wood dock) and a jump landing. It's on by
  default for first visits. Returning visitors start silent until they press
  the speaker button or M, because browsers only allow audio after a gesture
  and nothing asks them first. The choice made on a page survives switching
  to the classic view and back. Sources and licences are in
  `THIRD_PARTY_NOTICES.md`; how the files were made is in
  `scripts/audio/README.md`.
- **localStorage keys:** `view`, `theme`, `island-welcomed`, `island-visited`
  (the explored landmarks, for the "x / 6 explored" progress and the ticks),
  and `island-sound` (`on` or `off`).

### Code map

| File | What it does |
| --- | --- |
| `src/island/landmarks.ts` | The stations: id, label, section, model, position, facing, footprint. Pure data, shared by the HUD markup and the scene. |
| `src/island/world.ts` | Ground height, paths, scattered trees and rocks, colliders, walkable radius. No three.js. |
| `src/island/palette.ts` | Dusk (dark theme) and late-afternoon (light theme) lighting, fog and sky values; shared material colours. |
| `src/island/scene.ts` | Renderer, camera, lights, sky, water, terrain, scenery, the dock, arrival ring and landmark animations; theme swap; dispose. |
| `src/island/ambient.ts` | Ambient life: shoreline foam and swash, whitecaps, campfire smoke and sparks, gulls, butterflies or fireflies, lamp light pools, the rowboat and the sailboat. |
| `src/island/models.ts` | Landmark, dock and boat models built from primitives, a cached material/geometry kit, and `bakeStatic` (merges static meshes to cut draw calls). |
| `src/island/audio.ts` | Web Audio: the loops, the sound sprite (`audio-sprite.ts`), mute and its saved state. |
| `src/island/icons.ts` | Phosphor duotone icons, inlined (rendered by `src/components/island/Icon.astro`). |
| `src/island/character.ts` | The blocky player and its walk cycle. |
| `src/island/controls.ts` | Keys, click/tap to walk, drag to orbit, wheel/pinch zoom, with limits. |
| `src/island/ui.ts` | Station chips, open prompt, floating labels, hint, welcome card, sound toggles, the content dialog (browse, progress, phone bottom sheet). |
| `src/island/index.ts` | Wires it together: movement, camera follow, render loop, cleanup. |
| `src/island/boot.ts` | View switching and lazy loading (see above). |
| `src/components/island/IslandShell.astro` | The island's DOM: canvas, HUD, loader, welcome card, dialog. |
| `src/components/island/IslandPanels.astro` | Dialog content per station, rendered from `site.ts`. |

### Moving or adding a landmark

- **Move one:** change its `position` (`[x, z]`; the grass top has a radius
  of 24.5 units and the player spawns at the origin) in
  `src/island/landmarks.ts`. `facing: faceCentre(x, z)` keeps it facing the
  spawn plaza; paths, lamps, the flattened ground and colliders follow
  automatically. Adjust `labelHeight` if the label sits too low or high.
- **Add one:** add an entry to `landmarks` (its `id` is also the panel id;
  give it an `accent` colour and an `icon` from `src/island/icons.ts`),
  add a `<template id="island-panel-{id}">` to `IslandPanels.astro` that
  renders the content from `site.ts` (give its heading
  `id="island-dialog-title" tabindex="-1"`), and either reuse a `model` or
  add a builder to `src/island/models.ts` (front faces local +z, base on
  y = 0). The chip, label and prompt appear automatically.

### Changing the default view

The default lives in the head script in `src/layouts/Base.astro`: replace the
line that picks `"island"` (when no choice is saved) with `"classic"` to make
the classic page the default and the island opt-in via "Explore the island".
