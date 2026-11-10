# portfolio-v3

Single-page personal portfolio built with Astro, Tailwind CSS v4 and shadcn/ui
tokens. Static output, no JavaScript files: only a few tiny inline scripts (theme,
entrance motion).

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
