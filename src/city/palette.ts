/**
 * Scene colours per site theme. Light is golden hour (warm low sun, pastel
 * stucco), dark is neon dusk (violet-to-coral sky, glowing windows, street
 * lights and signs). Values are sRGB hex. Switching theme swaps these values
 * on the existing lights, materials and sky (see scene.ts `applyTheme`).
 */
export type Theme = "dark" | "light"

export interface Palette {
  skyTop: string
  /** Also the fog colour, so the far skyline melts into the sky. */
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
  /** Emissive strength of windows and lamp heads. */
  glow: number
  /** Emissive strength of neon signs and tubes. */
  neon: number
  /** Brightness of the unlit sign faces (1 = full). */
  signs: number
}

export const palettes: Record<Theme, Palette> = {
  dark: {
    skyTop: "#1d1638",
    horizon: "#c45a6e",
    sunGlow: "#ffb36b",
    sunDir: [-0.78, 0.05, 0.62],
    fogNear: 55,
    fogFar: 190,
    hemiSky: "#8d84c8",
    hemiGround: "#4a3446",
    hemiIntensity: 1.6,
    sunColor: "#ff9a6a",
    sunIntensity: 1.5,
    water: "#3a4f78",
    glow: 1,
    neon: 1.6,
    signs: 1,
  },
  light: {
    skyTop: "#7aa7cc",
    horizon: "#f6d6a8",
    sunGlow: "#fff1cf",
    sunDir: [-0.74, 0.16, 0.65],
    fogNear: 70,
    fogFar: 230,
    hemiSky: "#fff3df",
    hemiGround: "#9a8466",
    hemiIntensity: 1.55,
    sunColor: "#ffd9a6",
    sunIntensity: 2.4,
    water: "#3f9aa6",
    glow: 0.12,
    neon: 0.55,
    signs: 0.92,
  },
}

/** Fixed material colours shared by the city and the models. */
export const colours = {
  asphalt: "#55505a",
  sidewalk: "#cdbfae",
  curb: "#b3a594",
  plaza: "#e0cfb5",
  grass: "#8fa456",
  laneYellow: "#e9b949",
  laneWhite: "#efe6d4",
  trunk: "#8a6a4a",
  frond: "#4f8a4c",
  frondLight: "#6aa457",
  charcoal: "#35303a",
  steel: "#8a8b93",
  concrete: "#b9b1a6",
  concreteDark: "#8f877d",
  glass: "#3a4258",
  glassBlue: "#5c7ea6",
  windowGlow: "#ffc27a",
  ivory: "#efe4d0",
  stone: "#d8cbb4",
  stoneDark: "#a8987f",
  brick: "#a2513a",
  roofRed: "#8f3a2a",
  teal: "#2f6b70",
  sienna: "#c4622d",
  neonPink: "#ff4fa3",
  neonCyan: "#39d6ff",
  neonAmber: "#ffb03b",
  tail: "#ff3b3b",
  /** Pastel stucco for the filler buildings. */
  stucco: ["#e9cfae", "#d98c6a", "#9ec9c0", "#e6b8c4", "#c9d4e0", "#f1e2c6", "#b9a7d6", "#e5c07b"],
} as const
