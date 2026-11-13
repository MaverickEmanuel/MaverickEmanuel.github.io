# Island audio

How `src/assets/audio/` was made from the CC0 sources listed in
`THIRD_PARTY_NOTICES.md`. The raw downloads are not in the repo.

1. Convert each source to 44.1 kHz WAV in one folder (mono, except the ocean,
   which stays stereo as `ocean_st.wav`), e.g.
   `ffmpeg -i "Seagull Ambient 1.wav" -ac 1 -ar 44100 wav/a1.wav`.
   Names `process.py` expects: `ocean_st.wav`, `fire.wav`, `a1.wav`, `a3.wav`,
   `sand.wav`, `bookOpen.wav`, `bookClose.wav`, `glass_002.wav`,
   `click_002.wav` and from Kenney Impact Sounds `footstep_{grass,concrete,wood}_000`–`003.wav`
   and `impactSoft_heavy_000.wav` (the jump landing).
2. `python3 process.py wav out`: crossfaded loops (ocean 24 s, fire 14 s),
   trimmed and level-matched one-shots, sand sliced into single steps.
3. `python3 sprite.py out sfx.wav`: packs the one-shots into one sprite and
   prints the map for `src/island/audio-sprite.ts` (update both together).
4. Encode: `ffmpeg -i out/ocean.wav -c:a libmp3lame -b:a 64k ocean.mp3`,
   `fire.wav` at 48k, `sfx.wav` at 64k.
