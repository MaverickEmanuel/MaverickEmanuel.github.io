# Third-party notices

## Aura Gradients (MIT)

The decorative background washes (the hero wash and the media panel backdrop)
are derived from the `golden-hour` and `copper-shadow` gradients of Aura
Gradients: https://github.com/CristianOlivera1/Aura

    MIT License

    Copyright (c) 2026 CristianOlivera1

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.

## Fonts (SIL Open Font License 1.1)

The fonts are self-hosted from the Fontsource packages
`@fontsource-variable/instrument-sans` and `@fontsource-variable/inter`, both
licensed under the SIL Open Font License, Version 1.1
(https://openfontlicense.org). The full licence text ships in each package's
`LICENSE` file under `node_modules/@fontsource-variable/`.

- Instrument Sans: Copyright 2022 The Instrument Sans Project Authors
  (https://github.com/Instrument/instrument-sans)
- Inter: Copyright 2016 The Inter Project Authors
  (https://github.com/rsms/inter)

## Roflow logo

The Roflow logo and name belong to Roflow. The logo is shown here as a project
credit and is not covered by this site's licence. `src/assets/roflow-logo-lockup.svg`
is the original lockup with the wordmark re-outlined: the original draws
"Roflow" as live text (Geist, weight 800), and here that text is converted to
vector outlines so it renders identically without the font. The mark itself is
unchanged, and the white parts take their colour from a theme token so the
logo is legible on both the light and the dark backdrop.

## Phosphor Icons (MIT)

The island's section, sound, arrow and close icons (`src/island/icons.ts`) are
the duotone weight of Phosphor Icons, copied in as SVG path data from
`@phosphor-icons/core` 2.1.1: https://github.com/phosphor-icons/core

    MIT License

    Copyright (c) 2023 Phosphor Icons

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.

## Island sounds (CC0)

Every sound in the 3D island view is dedicated to the public domain under
CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/). Credit is not
required by CC0; it is given here anyway. The files in `src/assets/audio/`
are trimmed, level-matched, mixed down where noted and re-encoded to MP3 by
the scripts in `scripts/audio/`; the short sounds are packed into one sprite
(`sfx.mp3`, map in `src/island/audio-sprite.ts`).

- **Ocean bed** (`ocean.mp3`): "Small waves facing the ocean", BigSoundBank
  #1046, https://bigsoundbank.com/small-waves-facing-the-ocean-s1046.html.
  A 24-second excerpt, crossfaded into a seamless loop.
- **Seagulls** (sprite `gull-1`, `gull-3`): "Seagull Ambient 1.wav" and
  "Seagull Ambient 3.wav" from "Solo seagull sound effects" by Rango Mango,
  https://opengameart.org/content/solo-seagull-sound-effects. The uploader
  notes that the sounds were cut from a YouTube video
  (https://www.youtube.com/watch?v=Nm4gg6GBBcc) whose owner gave "full
  permission to share, commercial free use, no attribution required".
- **Campfire** (`fire.mp3`): "fireplace sound loop" (fire.wav) by PagDev,
  https://opengameart.org/content/fireplace-sound-loop. A 14-second
  excerpt, mono, crossfaded into a loop.
- **Sand footsteps** (sprite `step-sand-*`): sand_footsteps_0.mp3 from "Water
  Splash and Sand Footsteps" by Peludo (RNAn),
  https://opengameart.org/content/water-splash-and-sand-footsteps, sliced into
  single steps. With thanks: the author asks to be credited with a link to
  their itch.io page, https://rnan.itch.io.
- **Popup open / close** (sprite `popup-open`, `popup-close`): bookOpen.ogg and
  bookClose.ogg from Kenney's "RPG Audio" (www.kenney.nl), obtained from
  Kenney's own upload at https://opengameart.org/content/50-rpg-sound-effects.
- **Arrival chime and UI click** (sprite `arrive`, `click`): glass_002.ogg and
  click_002.ogg from Kenney's "Interface Sounds" (www.kenney.nl), obtained from
  Kenney's own upload at https://opengameart.org/content/interface-sounds.
- **Grass, stone and wood footsteps; jump landing** (sprite `step-grass-*`,
  `step-stone-*`, `step-wood-*`, `thud`): footstep_grass_000–003,
  footstep_concrete_000–003 (used for stone) and footstep_wood_000–003, and
  impactSoft_heavy_000 from Kenney's "Impact Sounds" 1.0 (www.kenney.nl),
  https://kenney.nl/assets/impact-sounds.
