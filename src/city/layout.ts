/**
 * City layout data and maths shared by the scene, the minimap, the player
 * and the car: road strips, raised blocks (sidewalks, the square, lots),
 * buildings, street furniture and the colliders. No three.js here.
 *
 * The district is a closed-off few blocks: a central square (spawn) ringed
 * by a road, four streets out to a perimeter road, and the edges closed by a
 * concrete barrier (east, west), a highway overpass (north) and the
 * waterfront boardwalk (south). Units are world units (the player is ~2.2
 * tall); x is east, z is south.
 */
import { footprint, landmarks } from "./landmarks"

/** [minX, minZ, maxX, maxZ] */
export type Rect = [number, number, number, number]

/** Height of sidewalks, the square and every lot. Roads are at y = 0. */
export const CURB = 0.15
/** The playable area (after collisions, everything is clamped into it). */
export const BOUNDS: Rect = [-51.2, -51.2, 51.2, 48.8]
export const PLAYER_RADIUS = 0.45

export interface Road {
  rect: Rect
  /** Direction of travel: along x or along z. */
  axis: "x" | "z"
}

export const roads: Road[] = [
  // Ring around the square.
  { rect: [-21, -19, 21, -10], axis: "x" },
  { rect: [-21, 10, 21, 19], axis: "x" },
  { rect: [-21, -19, -12, 19], axis: "z" },
  { rect: [12, -19, 21, 19], axis: "z" },
  // Streets out to the perimeter.
  { rect: [-4.5, -40, 4.5, -19], axis: "z" },
  { rect: [-4.5, 19, 4.5, 36], axis: "z" },
  { rect: [21, -4.5, 40, 4.5], axis: "x" },
  { rect: [-40, -4.5, -21, 4.5], axis: "x" },
  // Perimeter.
  { rect: [40, -49, 49, 45], axis: "z" },
  { rect: [-49, -49, -40, 45], axis: "z" },
  { rect: [-49, -49, 49, -40], axis: "x" },
  { rect: [-49, 36, 49, 45], axis: "x" },
]

export interface Block {
  rect: Rect
  kind: "square" | "lot" | "edge"
}

function mirrorX([x0, z0, x1, z1]: Rect): Rect {
  return [-x1, z0, -x0, z1]
}

const quadrants: Rect[] = [
  [4.5, -40, 40, -19],
  [21, -19, 40, -4.5],
  [4.5, 19, 40, 36],
  [21, 4.5, 40, 19],
]

/** Raised ground: the square, the lots between roads, and the edges outside the district. */
export const blocks: Block[] = [
  { rect: [-12, -10, 12, 10], kind: "square" },
  ...quadrants.flatMap((r) => [
    { rect: r, kind: "lot" as const },
    { rect: mirrorX(r), kind: "lot" as const },
  ]),
  { rect: [-260, -260, 260, -49], kind: "edge" },
  { rect: [-260, -49, -49, 50], kind: "edge" },
  { rect: [49, -49, 260, 50], kind: "edge" },
  { rect: [-49, 45, 49, 50], kind: "edge" },
]

/** z of the seawall: water starts south of it. */
export const SHORE_Z = 50

export type Side = "n" | "s" | "e" | "w"

export interface Building {
  rect: Rect
  height: number
  colour: number
  /** The street-facing side (awning, shopfront). */
  front: Side
}

/** Filler buildings around the places (the places themselves are in landmarks.ts). */
export const buildings: Building[] = [
  { rect: [21, -37.5, 29, -23], height: 14, colour: 0, front: "s" },
  { rect: [30.5, -37.5, 37.5, -25], height: 20, colour: 4, front: "s" },
  { rect: [-29, -37.5, -22, -23], height: 10, colour: 1, front: "s" },
  { rect: [-37.5, -37.5, -30.5, -25], height: 16, colour: 6, front: "s" },
  { rect: [21, 22, 29, 34], height: 9, colour: 2, front: "n" },
  { rect: [30.5, 24, 37.5, 34], height: 13, colour: 3, front: "n" },
  { rect: [-29, 22, -21, 34], height: 11, colour: 7, front: "n" },
  { rect: [-37.5, 24, -30.5, 34], height: 7, colour: 5, front: "n" },
  { rect: [-38, 6, -31, 17], height: 8, colour: 0, front: "e" },
  { rect: [36, 6, 38.5, 17], height: 6, colour: 6, front: "w" },
]

export interface ParkedCar {
  x: number
  z: number
  heading: number
  colour: string
}

export const parkedCars: ParkedCar[] = [
  { x: -35, z: -12, heading: 0, colour: "#3d7fb8" },
  { x: -29.5, z: -12, heading: Math.PI, colour: "#e8dcc4" },
  { x: -24, z: -12, heading: 0, colour: "#4a9a6a" },
  { x: -8, z: 17.4, heading: Math.PI / 2, colour: "#7a5ab8" },
  { x: 42.3, z: 22, heading: Math.PI, colour: "#d8a23a" },
]

/** Basketball court in the north-east lot. */
export const court: Rect = [24, -16.5, 37, -7.5]
/** Parking lot in the north-west lot. */
export const parkingLot: Rect = [-38, -17, -22, -7]

/** Where the player starts, and the car parked just ahead of them. */
export const SPAWN = { x: 0, z: 4, heading: Math.PI }
export const CAR_SPAWN = { x: 5, z: -12.4, heading: -Math.PI / 2 }

/** Small deterministic PRNG (mulberry32), so the city is the same every visit. */
export function random(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface Prop {
  x: number
  z: number
  /** Palms: lean direction in radians; lamps: the way the arm points. */
  rotation: number
  scale: number
}

function palmsAlong(x0: number, x1: number, z: number, step: number): Array<[number, number]> {
  const out: Array<[number, number]> = []
  for (let x = x0; x <= x1 + 0.01; x += step) out.push([x, z])
  return out
}

const palmSpots: Array<[number, number]> = [
  // Square corners.
  [-9, -7],
  [9, -7],
  [-9, 7],
  [9, 7],
  // Boardwalk.
  ...palmsAlong(-44, 44, 47.6, 11),
  // Lot corners facing the ring.
  [-22.6, -20.6],
  [22.6, -20.6],
  [-22.6, 20.6],
  [22.6, 20.6],
  [6, -21],
  [-6, -21],
  [6, 21],
  [-6, 21],
  [38.5, -6],
  [-38.5, -6],
]
const palmRand = random(5)
export const palms: Prop[] = palmSpots.map(([x, z]) => ({
  x,
  z,
  rotation: palmRand() * Math.PI * 2,
  scale: 0.85 + palmRand() * 0.35,
}))

/** Street lights: rotation points the arm out over the road. */
export const lamps: Prop[] = [
  { x: -11.3, z: 0, rotation: -Math.PI / 2, scale: 1 },
  { x: 11.3, z: 0, rotation: Math.PI / 2, scale: 1 },
  { x: -5, z: -9.3, rotation: Math.PI, scale: 1 },
  { x: 5, z: 9.3, rotation: 0, scale: 1 },
  { x: -5, z: 9.3, rotation: 0, scale: 1 },
  { x: 5, z: -9.3, rotation: Math.PI, scale: 1 },
  ...[-30, -10, 10, 30].flatMap((z) => [
    { x: 39.4, z, rotation: Math.PI / 2, scale: 1 },
    { x: -39.4, z, rotation: -Math.PI / 2, scale: 1 },
  ]),
  ...[-30, -12, 12, 30].map((x) => ({ x, z: 45.6, rotation: Math.PI, scale: 1 })),
  ...[-30, -12, 12, 30].map((x) => ({ x, z: -39.4, rotation: Math.PI, scale: 1 })),
]

/** Basketball hoops (circle colliders). */
export const hoops: Prop[] = [
  { x: court[0] + 0.6, z: (court[1] + court[3]) / 2, rotation: Math.PI / 2, scale: 1 },
  { x: court[2] - 0.6, z: (court[1] + court[3]) / 2, rotation: -Math.PI / 2, scale: 1 },
]

export interface Circle {
  x: number
  z: number
  r: number
}

/** Parked car footprint (width 2.1, length 4.5) as a box. */
export function carRect(c: { x: number; z: number; heading: number }): Rect {
  const alongX = Math.abs(Math.sin(c.heading)) > 0.7
  const [hw, hl] = [1.05, 2.25]
  return alongX ? [c.x - hl, c.z - hw, c.x + hl, c.z + hw] : [c.x - hw, c.z - hl, c.x + hw, c.z + hl]
}

/** Everything solid, as boxes and circles. */
export const boxColliders: Rect[] = [
  ...landmarks.map(footprint),
  ...buildings.map((b) => b.rect),
  ...parkedCars.map(carRect),
]
export const circleColliders: Circle[] = [
  ...palms.map((p) => ({ x: p.x, z: p.z, r: 0.4 })),
  ...lamps.map((l) => ({ x: l.x, z: l.z, r: 0.22 })),
  ...hoops.map((h) => ({ x: h.x, z: h.z, r: 0.3 })),
]

function inside([x0, z0, x1, z1]: Rect, x: number, z: number): boolean {
  return x >= x0 && x <= x1 && z >= z0 && z <= z1
}

/** Ground height at (x, z): the curb height on any raised block, else road level. */
export function groundHeight(x: number, z: number): number {
  for (const b of blocks) if (inside(b.rect, x, z)) return CURB
  return 0
}

/** The road strip under (x, z), if any. */
export function roadAt(x: number, z: number): Road | null {
  for (const r of roads) if (inside(r.rect, x, z)) return r
  return null
}

/**
 * Pushes a circle at `p` with radius `radius` out of every collider, then
 * clamps it into BOUNDS. Mutates `p` and returns the total push applied as
 * [dx, dz] (zero when nothing was hit), which the car uses as a contact normal.
 */
export function resolveCircle(p: { x: number; z: number }, radius: number): [number, number] {
  const sx = p.x
  const sz = p.z
  for (let pass = 0; pass < 2; pass++) {
    for (const [x0, z0, x1, z1] of boxColliders) {
      if (p.x < x0 - radius || p.x > x1 + radius || p.z < z0 - radius || p.z > z1 + radius) continue
      const cx = Math.max(x0, Math.min(p.x, x1))
      const cz = Math.max(z0, Math.min(p.z, z1))
      const dx = p.x - cx
      const dz = p.z - cz
      const d = Math.hypot(dx, dz)
      if (d > 1e-4) {
        if (d < radius) {
          p.x = cx + (dx / d) * radius
          p.z = cz + (dz / d) * radius
        }
      } else {
        // Centre inside the box: leave by the nearest side.
        const exits: Array<[number, number, number]> = [
          [p.x - x0, -1, 0],
          [x1 - p.x, 1, 0],
          [p.z - z0, 0, -1],
          [z1 - p.z, 0, 1],
        ]
        exits.sort((a, b) => a[0] - b[0])
        const [dist, nx, nz] = exits[0]
        p.x += nx * (dist + radius)
        p.z += nz * (dist + radius)
      }
    }
    for (const c of circleColliders) {
      const dx = p.x - c.x
      const dz = p.z - c.z
      const min = c.r + radius
      const d = Math.hypot(dx, dz)
      if (d < min) {
        const nx = d > 1e-4 ? dx / d : 1
        const nz = d > 1e-4 ? dz / d : 0
        p.x = c.x + nx * min
        p.z = c.z + nz * min
      }
    }
    p.x = Math.max(BOUNDS[0] + radius, Math.min(BOUNDS[2] - radius, p.x))
    p.z = Math.max(BOUNDS[1] + radius, Math.min(BOUNDS[3] - radius, p.z))
  }
  return [p.x - sx, p.z - sz]
}

/** The player's collision: a circle of PLAYER_RADIUS. */
export function resolvePosition(p: { x: number; z: number }): { x: number; z: number } {
  resolveCircle(p, PLAYER_RADIUS)
  return p
}
