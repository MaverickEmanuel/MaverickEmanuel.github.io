# portfolio-v3

Single-page personal portfolio built with Astro, Tailwind CSS v4 and shadcn/ui
tokens. Static output, no client-side JavaScript beyond two tiny inline theme
scripts.

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

`pnpm build` runs `scripts/prune-dist.mjs` afterwards (the `postbuild`
script). It deletes JavaScript files in `dist/_astro` that no built HTML or CSS
references (the unused React runtime) and prints what it removed.

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
