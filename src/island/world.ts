/**
 * Island layout maths shared by the scene, the player and the controls: the
 * ground height function, path and scenery placement, and the circle
 * colliders. No three.js here, so it stays cheap to reason about and test.
 */
import { landmarks, standPoint } from "./landmarks"

/** Radius of the grass top. The sand beach runs out to SAND_RADIUS. */
export const GRASS_RADIUS = 24.5
export const SAND_RADIUS = 27.5
/** The player is kept inside this radius (on the beach), or on the dock. */
export const WALK_RADIUS = 26.6
/** Height of flat grass (and of every landmark's base). */
export const BASE_Y = 0.6
/** Height of the sand top. The grass bank slopes down to it. */
export const SAND_Y = 0.3

/**
 * The wooden dock: a straight jetty from the south-east beach out to sea.
 * `angle` is measured like a landmark's facing (0 points south, +z). Distances
 * are from the island centre along that direction.
 */
export const DOCK = {
  angle: 0.7,
  start: 25.2,
  end: 36,
  halfWidth: 1.1,
  /** Height of the deck top. The first `ramp` units slope up from the sand. */
  deckY: 0.62,
  ramp: 1.2,
}
const dockDir = { x: Math.sin(DOCK.angle), z: Math.cos(DOCK.angle) }

/** (x, z) in dock coordinates: `along` from the island centre, `across` to the side. */
export function dockLocal(x: number, z: number): { along: number; across: number } {
  return { along: x * dockDir.x + z * dockDir.z, across: x * dockDir.z - z * dockDir.x }
}
/** World (x, z) of a point in dock coordinates. */
export function dockPoint(along: number, across: number): [number, number] {
  return [dockDir.x * along + dockDir.z * across, dockDir.z * along - dockDir.x * across]
}
function onDock(x: number, z: number, inset = 0): boolean {
  const d = dockLocal(x, z)
  return d.along >= DOCK.start && d.along <= DOCK.end - inset && Math.abs(d.across) <= DOCK.halfWidth - inset
}
/** Player footprint for collisions. */
export const PLAYER_RADIUS = 0.45

export interface Circle {
  x: number
  z: number
  r: number
}

function smoothstep(a: number, b: number, v: number): number {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

const hills = [
  { x: -7, z: 12.5, r: 5.5, h: 1.3 },
  { x: 17, z: -2, r: 4, h: 0.8 },
]

/**
 * Ground height at (x, z). Gentle bumps and two hills, flattened at the spawn
 * plaza, around every landmark and toward the beach. The rendered terrain
 * samples this same function at its vertices.
 */
export function groundHeight(x: number, z: number): number {
  const r = Math.hypot(x, z)
  if (r > GRASS_RADIUS) {
    const beach = BASE_Y + (SAND_Y - BASE_Y) * smoothstep(GRASS_RADIUS, GRASS_RADIUS + 0.9, r)
    if (!onDock(x, z)) return beach
    const along = dockLocal(x, z).along
    return Math.max(beach, SAND_Y + (DOCK.deckY - SAND_Y) * smoothstep(DOCK.start, DOCK.start + DOCK.ramp, along))
  }
  let bumps =
    0.18 * Math.sin(x * 0.33 + 1.3) * Math.cos(z * 0.29 - 0.7) +
    0.1 * Math.sin(x * 0.71 + z * 0.53) +
    0.12
  for (const hill of hills) {
    const d = Math.hypot(x - hill.x, z - hill.z)
    bumps += hill.h * (1 - smoothstep(0, hill.r, d))
  }
  let flat = smoothstep(2.5, 6, r)
  for (const lm of landmarks) {
    const d = Math.hypot(x - lm.position[0], z - lm.position[1])
    flat *= smoothstep(lm.collider + 0.6, lm.collider + 4, d)
  }
  flat *= 1 - smoothstep(GRASS_RADIUS - 4, GRASS_RADIUS, r)
  return BASE_Y + Math.max(0, bumps) * flat
}

/** Small deterministic PRNG (mulberry32), so the island is the same every visit. */
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

/** Straight paths from the spawn plaza to each landmark's stand point. */
export const paths: Array<{ from: [number, number]; to: [number, number] }> =
  landmarks.map((lm) => ({ from: [0, 0], to: standPoint(lm, 0.6) }))

function distanceToSegment(
  px: number,
  pz: number,
  a: [number, number],
  b: [number, number]
): number {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const len2 = dx * dx + dz * dz
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / len2))
  return Math.hypot(px - (a[0] + dx * t), pz - (a[1] + dz * t))
}

function clearOfLayout(x: number, z: number, margin: number): boolean {
  if (Math.hypot(x, z) < 4 + margin) return false
  const d = dockLocal(x, z)
  if (d.along > DOCK.start - 3 && Math.abs(d.across) < DOCK.halfWidth + 2.5 + margin) return false
  for (const lm of landmarks) {
    const d = Math.hypot(x - lm.position[0], z - lm.position[1])
    if (d < lm.collider + 2.5 + margin) return false
  }
  for (const p of paths) {
    if (distanceToSegment(x, z, p.from, p.to) < 1.6 + margin) return false
  }
  return true
}

export interface Prop {
  x: number
  z: number
  scale: number
  rotation: number
  kind: number
}

function scatter(
  seed: number,
  count: number,
  minR: number,
  maxR: number,
  spacing: number,
  kinds: number,
  avoid: Prop[] = []
): Prop[] {
  const rand = random(seed)
  const out: Prop[] = []
  for (let tries = 0; out.length < count && tries < count * 60; tries++) {
    const angle = rand() * Math.PI * 2
    const radius = Math.sqrt(minR * minR + rand() * (maxR * maxR - minR * minR))
    const x = Math.sin(angle) * radius
    const z = Math.cos(angle) * radius
    if (!clearOfLayout(x, z, 0)) continue
    if ([...out, ...avoid].some((p) => Math.hypot(p.x - x, p.z - z) < spacing)) continue
    out.push({
      x,
      z,
      scale: 0.75 + rand() * 0.55,
      rotation: rand() * Math.PI * 2,
      kind: Math.floor(rand() * kinds),
    })
  }
  return out
}

/** Trees: kind 0 is a pine, kind 1 a round broadleaf. */
export const trees = scatter(7, 24, 6, GRASS_RADIUS - 1.5, 2.8, 2)
/** Rocks along the beach and in the grass. */
export const rocks = scatter(19, 14, 10, GRASS_RADIUS + 1.5, 2.2, 3, trees)

/** Flower patches (butterflies visit them by day, fireflies drift over them at night). */
export const flowers = scatter(31, 18, 6, GRASS_RADIUS - 2, 1.6, 3, [...trees, ...rocks])

export type Surface = "grass" | "stone" | "sand" | "wood"

/** What the player is standing on, for footstep sounds. */
export function surfaceAt(x: number, z: number): Surface {
  const r = Math.hypot(x, z)
  if (r > GRASS_RADIUS) return onDock(x, z) && dockLocal(x, z).along > DOCK.start + DOCK.ramp * 0.5 ? "wood" : r > GRASS_RADIUS + 0.4 ? "sand" : "grass"
  if (r < 3.4) return "stone"
  for (const p of paths) {
    if (r > 3.6 && distanceToSegment(x, z, p.from, p.to) < 0.6) return "stone"
  }
  return "grass"
}

/** The plaza signpost (see scene.ts). */
export const SIGNPOST: [number, number] = [-1.3, 2.25]

/** Everything the player cannot walk through. */
export const colliders: Circle[] = [
  { x: SIGNPOST[0], z: SIGNPOST[1], r: 0.35 },
  ...landmarks.map((lm) => ({ x: lm.position[0], z: lm.position[1], r: lm.collider })),
  ...trees.map((t) => ({ x: t.x, z: t.z, r: 0.55 * t.scale })),
  ...rocks.map((r) => ({
    x: r.x,
    z: r.z,
    r: 0.6 * r.scale,
  })),
]

/**
 * Moves a point out of every collider and back inside the walkable radius.
 * Mutates and returns `p`.
 */
export function resolvePosition(p: { x: number; z: number }): { x: number; z: number } {
  for (let pass = 0; pass < 2; pass++) {
    for (const c of colliders) {
      const dx = p.x - c.x
      const dz = p.z - c.z
      const min = c.r + PLAYER_RADIUS
      const d = Math.hypot(dx, dz)
      if (d < min) {
        const nx = d > 1e-4 ? dx / d : 1
        const nz = d > 1e-4 ? dz / d : 0
        p.x = c.x + nx * min
        p.z = c.z + nz * min
      }
    }
    const r = Math.hypot(p.x, p.z)
    if (r > WALK_RADIUS && !onDock(p.x, p.z, PLAYER_RADIUS)) {
      // Outside both walkable areas: move to the nearer of the beach edge and the dock.
      const cx = p.x * (WALK_RADIUS / r)
      const cz = p.z * (WALK_RADIUS / r)
      const d = dockLocal(p.x, p.z)
      const edge = DOCK.halfWidth - PLAYER_RADIUS
      const [dx, dz] = dockPoint(
        Math.min(DOCK.end - PLAYER_RADIUS, Math.max(DOCK.start, d.along)),
        Math.max(-edge, Math.min(edge, d.across))
      )
      const toCircle = Math.hypot(p.x - cx, p.z - cz)
      const toDock = Math.hypot(p.x - dx, p.z - dz)
      p.x = toDock < toCircle ? dx : cx
      p.z = toDock < toCircle ? dz : cz
    }
  }
  return p
}
