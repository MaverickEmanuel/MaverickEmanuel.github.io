/**
 * Scene colours per site theme. Dark is dusk (lamps and windows glow), light
 * is warm late afternoon. Values are sRGB hex, in the site's golden-hour
 * family. Switching theme swaps these values on the existing lights,
 * materials and sky (see scene.ts `applyPalette`).
 */
export type Theme = "dark" | "light"

export interface Palette {
  skyTop: string
  /** Also the fog colour, so distant water melts into the sky. */
  horizon: string
  sunGlow: string
  /** Direction toward the visible sun disc (not the shadow light). */
  sunDir: [number, number, number]
  fogNear: number
  fogFar: number
  hemiSky: string
  hemiGround: string
  hemiIntensity: number
  sunColor: string
  sunIntensity: number
  water: string
  /** Emissive strength of windows and lamp bulbs. */
  glow: number
  fireLight: number
}

export const palettes: Record<Theme, Palette> = {
  dark: {
    skyTop: "#1f1b2c",
    horizon: "#9a5639",
    sunGlow: "#ffae6b",
    sunDir: [-0.72, 0.05, -0.69],
    fogNear: 42,
    fogFar: 150,
    hemiSky: "#8e98c0",
    hemiGround: "#5a4030",
    hemiIntensity: 1.25,
    sunColor: "#ffa066",
    sunIntensity: 1.7,
    water: "#3f5d6e",
    glow: 1,
    fireLight: 40,
  },
  light: {
    skyTop: "#86aac2",
    horizon: "#f1d9b4",
    sunGlow: "#fff1cf",
    sunDir: [-0.62, 0.22, -0.75],
    fogNear: 50,
    fogFar: 175,
    hemiSky: "#fff3df",
    hemiGround: "#8f7a58",
    hemiIntensity: 1.5,
    sunColor: "#ffdcaa",
    sunIntensity: 2.4,
    water: "#4f9396",
    glow: 0.15,
    fireLight: 10,
  },
}

/** Fixed material colours shared by the city and the models. */
export const colours = {
  grass: "#8fa456",
  grassDark: "#7a9049",
  grassLight: "#a5b464",
  sand: "#e3c995",
  sandWet: "#cdb07a",
  path: "#d9c49a",
  rock: "#8b8279",
  rockDark: "#6f675f",
  trunk: "#7a5236",
  leaf: "#5f7d3f",
  leafLight: "#7d9645",
  wood: "#9a6a43",
  woodDark: "#6e4a2f",
  ivory: "#efe4d0",
  stone: "#d8cbb4",
  stoneDark: "#b7a78d",
  charcoal: "#3a3430",
  sienna: "#c4622d",
  amber: "#e8a066",
  roofRed: "#8f3a2a",
  slate: "#4d5560",
  glass: "#3f3a36",
  windowGlow: "#ffb066",
  fire: "#ff8a3d",
  fireCore: "#ffd27a",
  teal: "#2f6268",
} as const
