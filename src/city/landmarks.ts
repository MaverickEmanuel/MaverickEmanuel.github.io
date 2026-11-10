/**
 * The city's places: one entry per portfolio section. Pure data (no
 * three.js), so the server-rendered HUD (labels, phone, panels) and the 3D
 * scene read the same list.
 *
 * Coordinates are world units on the ground plane: x to the right (east), z
 * toward the default camera (south). The player spawns in the central square
 * at the origin and every place faces that square, so all of them are in
 * view (and on the minimap) from the start. `facing` is the model's rotation
 * around the vertical axis; a model's front (door, sign) faces local +z, so
 * `facing: 0` faces south. Only multiples of a quarter turn are used, which
 * keeps the footprints axis-aligned boxes.
 *
 * To add a place: add an entry here, a panel for its id in
 * src/components/city/CityPanels.astro, and a model builder in
 * src/city/models.ts keyed by `model`.
 */

export type ModelKind = "studio" | "filmlot" | "tower" | "campus" | "arcade" | "payphone"

export interface Landmark {
  /** Also the panel id: <template id="city-panel-{id}">. */
  id: string
  /** Floating label, phone and minimap text. */
  label: string
  /** Which part of the site the place opens (shown under the label). */
  section: string
  model: ModelKind
  /** Ground position [x, z] of the footprint centre. */
  position: [number, number]
  /** Rotation around the vertical axis, radians (a multiple of π/2). */
  facing: number
  /** Footprint [width, depth] in the model's own axes (front is +z). */
  size: [number, number]
  /** Height of the floating label, which hangs over the entrance marker. */
  labelHeight: number
  /** Blip, marker and phone-app colour. */
  colour: string
  /** One-letter minimap glyph. */
  glyph: string
}

const SOUTH = 0
const NORTH = Math.PI
const WEST = -Math.PI / 2
const EAST = Math.PI / 2

export const landmarks: Landmark[] = [
  {
    id: "mpac",
    label: "MPAC",
    section: "Experience",
    model: "tower",
    position: [13, -28],
    facing: SOUTH,
    size: [10, 10],
    labelHeight: 4.6,
    colour: "#3fb6ff",
    glyph: "M",
  },
  {
    id: "queens",
    label: "Queen's",
    section: "Education",
    model: "campus",
    position: [-13.5, -28.5],
    facing: SOUTH,
    size: [12, 10],
    labelHeight: 4.6,
    colour: "#ffc24a",
    glyph: "Q",
  },
  {
    id: "roflow",
    label: "Roflow",
    section: "Selected work",
    model: "studio",
    position: [-13, 27],
    facing: NORTH,
    size: [10, 8],
    labelHeight: 4.6,
    colour: "#ff6a3d",
    glyph: "R",
  },
  {
    id: "demopilot",
    label: "DemoPilot",
    section: "Selected work",
    model: "filmlot",
    position: [13, 27],
    facing: NORTH,
    size: [10, 8],
    labelHeight: 4.6,
    colour: "#b77cff",
    glyph: "D",
  },
  {
    id: "arcade",
    label: "Arcade",
    section: "Off the clock",
    model: "arcade",
    position: [30, 12],
    facing: WEST,
    size: [9, 8],
    labelHeight: 4.6,
    colour: "#4fe0a6",
    glyph: "A",
  },
  {
    id: "contact",
    label: "Payphone",
    section: "Contact",
    model: "payphone",
    position: [-26.5, 11],
    facing: EAST,
    size: [3, 2],
    labelHeight: 4.6,
    colour: "#ff5fa8",
    glyph: "C",
  },
]

/** Unit vector the landmark's front faces, as [x, z]. */
export function frontOf(landmark: Landmark): [number, number] {
  return [Math.sin(landmark.facing), Math.cos(landmark.facing)]
}

/** The footprint as a world-space box: [minX, minZ, maxX, maxZ]. */
export function footprint(landmark: Landmark): [number, number, number, number] {
  const quarter = Math.abs(Math.round(landmark.facing / (Math.PI / 2)))
  const [w, d] = quarter % 2 === 0 ? landmark.size : [landmark.size[1], landmark.size[0]]
  const [x, z] = landmark.position
  return [x - w / 2, z - d / 2, x + w / 2, z + d / 2]
}

/** Where the player stands when using a place: just in front of its door. */
export function standPoint(landmark: Landmark, gap = 1.8): [number, number] {
  const [fx, fz] = frontOf(landmark)
  const d = landmark.size[1] / 2 + gap
  return [landmark.position[0] + fx * d, landmark.position[1] + fz * d]
}

/** Distance from (x, z) to the landmark's footprint (0 inside it). */
export function distanceTo(landmark: Landmark, x: number, z: number): number {
  const [x0, z0, x1, z1] = footprint(landmark)
  const dx = Math.max(x0 - x, 0, x - x1)
  const dz = Math.max(z0 - z, 0, z - z1)
  return Math.hypot(dx, dz)
}

/** The entrance marker's spot: on the sidewalk just in front of the door. */
export function entrance(landmark: Landmark): [number, number] {
  return standPoint(landmark, 0.9)
}
