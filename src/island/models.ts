/**
 * Landmark models, built from primitives (no model files). Every builder
 * returns a group standing on y = 0 with its front facing local +z.
 *
 * Animated parts are tagged in userData and picked up by scene.ts:
 *   userData.spin   radians per second around the part's own y axis
 *   userData.flame  flicker (scale and the campfire light)
 * A landmark group can also carry userData.arrive(t), called every frame with
 * t easing from 0 to 1 while the player stands at it (doors open, lights come
 * on). Its windows use kit.glowFor(id), so they can light up on their own.
 */
import * as THREE from "three"
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js"
import type { ModelKind } from "./landmarks"
import { colours } from "./palette"

/** Shared, cached materials and geometries, so the scene stays cheap and easy to dispose. */
export class Kit {
  private materials = new Map<string, THREE.Material>()
  private geometries = new Map<string, THREE.BufferGeometry>()
  private glows = new Map<string, THREE.MeshLambertMaterial>()
  private glowLevel = 1
  /** Windows, lamp bulbs and screens: glow strength follows the theme. */
  readonly glow: THREE.MeshLambertMaterial
  readonly fire: THREE.MeshLambertMaterial
  readonly fireCore: THREE.MeshLambertMaterial

  constructor() {
    this.glow = this.emissive("glow", colours.windowGlow)
    this.fire = this.emissive("fire", colours.fire)
    this.fireCore = this.emissive("fireCore", colours.fireCore)
  }

  private emissive(key: string, colour: string): THREE.MeshLambertMaterial {
    const m = new THREE.MeshLambertMaterial({
      color: colours.glass,
      emissive: colour,
      emissiveIntensity: 1,
      flatShading: true,
    })
    this.materials.set(key, m)
    return m
  }

  /** Flat-shaded Lambert material for a colour (cached). */
  mat(colour: string): THREE.MeshLambertMaterial {
    let m = this.materials.get(colour) as THREE.MeshLambertMaterial | undefined
    if (!m) {
      m = new THREE.MeshLambertMaterial({ color: colour, flatShading: true })
      this.materials.set(colour, m)
    }
    return m
  }

  geo<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
    let g = this.geometries.get(key) as T | undefined
    if (!g) {
      g = make()
      this.geometries.set(key, g)
    }
    return g
  }

  /** A landmark's own copy of the glow material, so its windows can light up on arrival. */
  glowFor(id: string): THREE.MeshLambertMaterial {
    let m = this.glows.get(id)
    if (!m) {
      m = this.glow.clone()
      this.glows.set(id, m)
      this.materials.set(`glow:${id}`, m)
    }
    return m
  }

  /** Theme glow level for every glow material; `boost` (0..1) lights one landmark up. */
  setGlow(intensity: number) {
    this.glowLevel = intensity
    for (const m of [this.glow, ...this.glows.values()]) {
      m.emissiveIntensity = intensity
      m.color.set(intensity > 0.5 ? colours.glass : "#cfd6d6")
    }
  }

  /** Lights up a landmark's windows: t is 0 (theme level) to 1 (fully lit). */
  boostGlow(id: string, t: number) {
    const m = this.glows.get(id)
    if (!m) return
    const level = this.glowLevel + t * (this.glowLevel > 0.5 ? 0.7 : 1.1)
    m.emissiveIntensity = level
    m.color.set(level > 0.5 ? colours.glass : "#cfd6d6")
  }

  dispose() {
    this.materials.forEach((m) => m.dispose())
    this.geometries.forEach((g) => g.dispose())
    this.materials.clear()
    this.geometries.clear()
  }
}

type Vec3 = [number, number, number]

function place(mesh: THREE.Mesh, pos: Vec3, scale?: Vec3, rotation?: Vec3) {
  mesh.position.set(...pos)
  if (scale) mesh.scale.set(...scale)
  if (rotation) mesh.rotation.set(...rotation)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

/** Box of size `size`, centred at `pos`. */
function box(kit: Kit, mat: THREE.Material, size: Vec3, pos: Vec3, rotation?: Vec3) {
  const g = kit.geo("box", () => new THREE.BoxGeometry(1, 1, 1))
  return place(new THREE.Mesh(g, mat), pos, size, rotation)
}

/** Cylinder (axis y) with `sides` facets, radius r and height h, centred at `pos`. */
function cyl(
  kit: Kit,
  mat: THREE.Material,
  sides: number,
  r: number,
  h: number,
  pos: Vec3,
  rotation?: Vec3,
  topRatio = 1
) {
  const g = kit.geo(`cyl${sides}-${topRatio}`, () =>
    new THREE.CylinderGeometry(topRatio, 1, 1, sides)
  )
  return place(new THREE.Mesh(g, mat), pos, [r, h, r], rotation)
}

/** Cone/pyramid with `sides` facets, base radius r, height h, base centred at `pos`. */
function cone(
  kit: Kit,
  mat: THREE.Material,
  sides: number,
  r: number,
  h: number,
  pos: Vec3,
  rotation?: Vec3
) {
  const g = kit.geo(`cone${sides}`, () => {
    const c = new THREE.ConeGeometry(1, 1, sides)
    c.translate(0, 0.5, 0)
    return c
  })
  return place(new THREE.Mesh(g, mat), pos, [r, h, r], rotation)
}

/** Gable roof: triangular prism, `width` across x, ridge along z. */
function gable(kit: Kit, mat: THREE.Material, width: number, height: number, depth: number, pos: Vec3) {
  const g = kit.geo("gable", () => {
    const shape = new THREE.Shape()
    shape.moveTo(-0.5, 0)
    shape.lineTo(0.5, 0)
    shape.lineTo(0, 1)
    shape.closePath()
    const e = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false })
    e.translate(0, 0, -0.5)
    return e
  })
  return place(new THREE.Mesh(g, mat), pos, [width, height, depth])
}

/** A door hinged on its left edge: returns the pivot (rotate .y to open). */
function door(kit: Kit, mat: THREE.Material, width: number, height: number, pos: Vec3): THREE.Group {
  const pivot = new THREE.Group()
  pivot.userData.dynamic = true
  pivot.position.set(pos[0] - width / 2, pos[1], pos[2])
  pivot.add(box(kit, mat, [width, height, 0.1], [width / 2, height / 2, 0]))
  return pivot
}

/** Small wooden crate. */
function crate(kit: Kit, size: number, pos: Vec3, rot = 0) {
  return box(kit, kit.mat(colours.wood), [size, size, size], [pos[0], pos[1] + size / 2, pos[2]], [0, rot, 0])
}

function studio(kit: Kit): THREE.Group {
  const g = new THREE.Group()
  const glow = kit.glowFor("roflow")
  const wall = kit.mat(colours.sienna)
  const trim = kit.mat(colours.amber)
  const dark = kit.mat(colours.charcoal)
  g.add(box(kit, kit.mat(colours.stoneDark), [6.6, 0.3, 5], [0, 0.15, 0]))
  g.add(box(kit, wall, [6, 3, 4.4], [0, 1.8, 0]))
  g.add(box(kit, trim, [6.1, 0.22, 4.5], [0, 3.3, 0]))
  g.add(gable(kit, kit.mat(colours.ivory), 7, 2, 5.2, [0, 3.4, 0]))
  // Big workshop window and door on the front.
  g.add(box(kit, glow, [2.6, 1.5, 0.1], [-1.3, 2, 2.22]))
  g.add(box(kit, dark, [2.8, 0.14, 0.2], [-1.3, 2.8, 2.25]))
  g.add(box(kit, dark, [0.08, 1.5, 0.14], [-1.3, 2, 2.26]))
  g.add(box(kit, glow, [1.2, 2.1, 0.06], [1.7, 1.35, 2.19]))
  const front = door(kit, kit.mat(colours.woodDark), 1.2, 2.1, [1.7, 0.3, 2.26])
  g.add(front)
  // Sign board over the door, and a side window.
  g.add(box(kit, trim, [1.6, 0.5, 0.12], [1.7, 2.75, 2.25]))
  g.add(box(kit, kit.mat(colours.charcoal), [1.2, 0.08, 0.04], [1.7, 2.75, 2.32]))
  g.add(box(kit, glow, [0.1, 1, 1.2], [-3.02, 2, -0.6]))
  // Chimney.
  g.add(box(kit, kit.mat(colours.stoneDark), [0.7, 1.8, 0.7], [2, 4.4, -1]))
  // Workbench outside.
  g.add(box(kit, kit.mat(colours.wood), [1.8, 0.12, 0.8], [-3.9, 1, 1.2]))
  g.add(box(kit, kit.mat(colours.woodDark), [0.12, 0.9, 0.7], [-4.7, 0.5, 1.2]))
  g.add(box(kit, kit.mat(colours.woodDark), [0.12, 0.9, 0.7], [-3.1, 0.5, 1.2]))
  g.add(box(kit, kit.mat(colours.slate), [0.5, 0.36, 0.06], [-4.2, 1.26, 1.05], [-0.25, 0.2, 0]))
  g.add(box(kit, glow, [0.42, 0.28, 0.02], [-4.2, 1.26, 1.09], [-0.25, 0.2, 0]))
  // Crates stacked against the side wall.
  g.add(crate(kit, 0.8, [3.6, 0.3, 1.2], 0.2), crate(kit, 0.7, [3.7, 0.3, 0.2], -0.3), crate(kit, 0.6, [3.6, 1.1, 0.95], 0.6))
  // A floating, spinning block above the roof: a nod to building games.
  const block = box(kit, trim, [0.9, 0.9, 0.9], [0, 6.4, 0], [0.6, 0, 0.6])
  const pivot = new THREE.Group()
  pivot.position.set(0, 0, 0)
  pivot.add(block)
  pivot.userData.spin = 0.8
  g.add(pivot)
  g.userData.arrive = (t: number) => {
    front.rotation.y = -1.9 * t
    pivot.userData.spin = 0.8 + 2.4 * t
    kit.boostGlow("roflow", t)
  }
  return g
}

function camera(kit: Kit): THREE.Group {
  const g = new THREE.Group()
  const glow = kit.glowFor("demopilot")
  const dark = kit.mat(colours.charcoal)
  const metal = kit.mat(colours.slate)
  // Tripod.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2
    g.add(
      cyl(kit, metal, 5, 0.06, 2.3, [Math.sin(a) * 0.45, 1.1, Math.cos(a) * 0.45], [
        -Math.cos(a) * 0.38,
        0,
        Math.sin(a) * 0.38,
      ])
    )
  }
  // Body, lens and two film reels.
  g.add(box(kit, dark, [0.9, 1, 1.6], [0, 2.75, 0]))
  g.add(cyl(kit, metal, 8, 0.32, 0.7, [0, 2.75, 1.1], [Math.PI / 2, 0, 0]))
  g.add(cyl(kit, glow, 8, 0.24, 0.05, [0, 2.75, 1.47], [Math.PI / 2, 0, 0]))
  // Red "recording" light on top.
  g.add(box(kit, kit.mat(colours.sienna), [0.14, 0.1, 0.14], [0.3, 3.3, 0.6]))
  const reels: THREE.Group[] = []
  for (const z of [-0.45, 0.45]) {
    const reel = new THREE.Group()
    reel.position.set(0, 3.75, z)
    reel.add(cyl(kit, kit.mat(colours.amber), 10, 0.55, 0.16, [0, 0, 0], [0, 0, Math.PI / 2]))
    reel.add(box(kit, dark, [0.18, 0.2, 0.2], [0, 0, 0.35]))
    reel.userData.spinX = z > 0 ? 1.6 : 1.2
    reel.userData.baseSpin = reel.userData.spinX
    reels.push(reel)
    g.add(reel)
  }
  // Playback screen on a stand, beside the camera.
  g.add(box(kit, metal, [0.14, 1.6, 0.14], [-2.1, 0.8, -0.4]))
  g.add(box(kit, dark, [2.6, 1.6, 0.16], [-2.1, 2.2, -0.4]))
  g.add(box(kit, glow, [2.3, 1.3, 0.05], [-2.1, 2.2, -0.3]))
  // Clapperboard leaning on the stand, and a studio light on the other side.
  g.add(box(kit, kit.mat(colours.charcoal), [0.7, 0.5, 0.06], [-1.5, 0.27, 0.3], [-0.3, 0.3, 0]))
  g.add(box(kit, kit.mat(colours.ivory), [0.72, 0.1, 0.07], [-1.5, 0.55, 0.22], [-0.3, 0.3, 0.12]))
  g.add(cyl(kit, kit.mat(colours.slate), 5, 0.05, 2, [2, 1, -0.5]))
  g.add(cyl(kit, kit.mat(colours.charcoal), 8, 0.34, 0.5, [2, 2.1, -0.4], [Math.PI / 2 - 0.5, 0, 0], 0.8))
  g.add(cyl(kit, glow, 8, 0.27, 0.04, [2, 2.25, -0.2], [Math.PI / 2 - 0.5, 0, 0]))
  g.userData.arrive = (t: number) => {
    for (const r of reels) r.userData.spinX = r.userData.baseSpin * (1 + 3 * t)
    kit.boostGlow("demopilot", t)
  }
  return g
}

function office(kit: Kit): THREE.Group {
  const g = new THREE.Group()
  const glow = kit.glowFor("mpac")
  const wall = kit.mat(colours.stone)
  const slate = kit.mat(colours.slate)
  g.add(box(kit, kit.mat(colours.stoneDark), [6, 0.3, 5.2], [0, 0.15, 0]))
  g.add(box(kit, wall, [5, 7.2, 4.2], [0, 3.9, 0]))
  g.add(box(kit, slate, [5.3, 0.4, 4.5], [0, 7.6, 0]))
  g.add(box(kit, kit.mat(colours.stoneDark), [1.4, 0.8, 1.2], [1, 8.2, -0.6]))
  // Window bands: three floors, front and sides.
  for (let floor = 0; floor < 3; floor++) {
    const y = 2.6 + floor * 2
    for (const x of [-1.6, 0, 1.6]) {
      if (floor === 0 && x === 0) continue
      g.add(box(kit, glow, [1, 1.1, 0.08], [x, y, 2.12]))
    }
    for (const side of [-1, 1]) {
      for (const z of [-1, 1]) g.add(box(kit, glow, [0.08, 1.1, 1], [side * 2.52, y, z]))
    }
  }
  // Entrance and canopy, with a sign band above it.
  g.add(box(kit, glow, [1.2, 1.9, 0.08], [0, 1.25, 2.12]))
  g.add(box(kit, slate, [2.2, 0.15, 1.2], [0, 2.4, 2.6]))
  g.add(box(kit, kit.mat("#5b6f9a"), [1.8, 0.32, 0.08], [0, 2.75, 2.15]))
  // Planters either side of the door, and a bench.
  for (const x of [-1.6, 1.6]) {
    g.add(box(kit, kit.mat(colours.stoneDark), [0.7, 0.5, 0.7], [x, 0.55, 2.9]))
    g.add(place(new THREE.Mesh(kit.geo("shrub", () => new THREE.IcosahedronGeometry(0.42, 0)), kit.mat(colours.leafLight)), [x, 1.05, 2.9]))
  }
  g.add(box(kit, kit.mat(colours.wood), [1.6, 0.1, 0.5], [3.3, 0.75, 2.2]))
  g.add(box(kit, kit.mat(colours.charcoal), [0.1, 0.45, 0.45], [2.6, 0.5, 2.2]))
  g.add(box(kit, kit.mat(colours.charcoal), [0.1, 0.45, 0.45], [4, 0.5, 2.2]))
  g.userData.arrive = (t: number) => kit.boostGlow("mpac", t)
  return g
}

function campus(kit: Kit): THREE.Group {
  const g = new THREE.Group()
  const glow = kit.glowFor("queens")
  const stone = kit.mat(colours.stone)
  const roof = kit.mat(colours.roofRed)
  g.add(box(kit, kit.mat(colours.stoneDark), [9.4, 0.3, 5], [0, 0.15, 0]))
  // Hall with a pitched roof.
  g.add(box(kit, stone, [8.6, 3.4, 4], [0, 2, 0]))
  g.add(gable(kit, roof, 4.6, 1.8, 9, [0, 3.7, 0]).rotateY(Math.PI / 2))
  // Arched windows along the front.
  for (const x of [-3.2, -1.9, 1.9, 3.2]) {
    g.add(box(kit, glow, [0.7, 1.5, 0.08], [x, 2.1, 2.02]))
  }
  // Central clock tower with a pyramid roof.
  g.add(box(kit, stone, [2.2, 7, 2.2], [0, 3.8, 0.9]))
  g.add(box(kit, kit.mat(colours.stoneDark), [2.5, 0.3, 2.5], [0, 7.4, 0.9]))
  g.add(cone(kit, kit.mat(colours.teal), 4, 1.75, 2.2, [0, 7.55, 0.9], [0, Math.PI / 4, 0]))
  g.add(cyl(kit, kit.mat(colours.ivory), 12, 0.6, 0.1, [0, 5.6, 2.02], [Math.PI / 2, 0, 0]))
  g.add(box(kit, kit.mat(colours.charcoal), [0.08, 0.45, 0.06], [0, 5.75, 2.1]))
  // Doorway: a lit hall behind a door that swings open on arrival.
  g.add(box(kit, glow, [1.1, 2, 0.06], [0, 1.3, 1.99]))
  const front = door(kit, kit.mat(colours.woodDark), 1.1, 2, [0, 0.3, 2.06])
  g.add(front)
  // Banner poles in the accent colour either side of the steps.
  const banner = kit.mat("#8a4f6e")
  for (const x of [-2.4, 2.4]) {
    g.add(cyl(kit, kit.mat(colours.charcoal), 5, 0.05, 3.2, [x, 1.6, 3]))
    g.add(box(kit, banner, [0.6, 1.2, 0.04], [x + 0.32, 2.4, 3]))
  }
  g.userData.arrive = (t: number) => {
    front.rotation.y = -1.7 * t
    kit.boostGlow("queens", t)
  }
  return g
}

function campfire(kit: Kit): THREE.Group {
  const g = new THREE.Group()
  const rock = kit.mat(colours.rock)
  const log = kit.mat(colours.wood)
  const stoneGeo = kit.geo("stone", () => new THREE.DodecahedronGeometry(1, 0))
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2
    g.add(place(new THREE.Mesh(stoneGeo, rock), [Math.sin(a) * 1, 0.12, Math.cos(a) * 1], [0.28, 0.2, 0.28], [a, a * 2, 0]))
  }
  g.add(cyl(kit, log, 6, 0.12, 1.4, [0, 0.25, 0], [0, 0.4, Math.PI / 2 - 0.25]))
  g.add(cyl(kit, log, 6, 0.12, 1.4, [0, 0.25, 0], [0, -0.9, Math.PI / 2 + 0.25]))
  const flames = new THREE.Group()
  flames.position.set(0, 0.25, 0)
  const outer = cone(kit, kit.fire, 5, 0.5, 1.3, [0, 0, 0])
  const inner = cone(kit, kit.fireCore, 5, 0.28, 0.85, [0.05, 0, 0.05], [0, 0.7, 0])
  outer.castShadow = inner.castShadow = false
  flames.add(outer, inner)
  flames.userData.flame = true
  g.add(flames)
  // Log benches.
  for (const a of [Math.PI * 0.75, Math.PI * 1.25]) {
    g.add(cyl(kit, log, 7, 0.26, 2, [Math.sin(a) * 2.3, 0.26, Math.cos(a) * 2.3], [0, a + Math.PI / 2, Math.PI / 2]))
  }
  // A small tent behind the fire.
  g.add(gable(kit, kit.mat(colours.amber), 2.4, 1.7, 2.6, [0.6, 0, -3]))
  g.add(box(kit, kit.mat(colours.charcoal), [0.6, 1, 0.05], [0.6, 0.5, -1.69]))
  // Firewood pile and a lantern on a stump.
  for (let i = 0; i < 3; i++) {
    g.add(cyl(kit, kit.mat(colours.woodDark), 6, 0.11, 1, [-2.6 + i * 0.24, 0.12 + (i === 1 ? 0.2 : 0), -1.6], [0, 0.3, Math.PI / 2]))
  }
  g.add(cyl(kit, log, 7, 0.3, 0.5, [2.4, 0.25, -1.2]))
  g.add(box(kit, kit.mat(colours.charcoal), [0.26, 0.05, 0.26], [2.4, 0.53, -1.2]))
  g.add(box(kit, kit.glowFor("campfire"), [0.2, 0.28, 0.2], [2.4, 0.7, -1.2]))
  g.userData.arrive = (t: number) => {
    flames.userData.boost = t
    kit.boostGlow("campfire", t)
  }
  return g
}

function mailbox(kit: Kit): THREE.Group {
  const g = new THREE.Group()
  const dark = kit.mat(colours.woodDark)
  // Mailbox on a post, slot toward the island.
  g.add(box(kit, dark, [0.22, 1.3, 0.22], [0, 0.65, 0]))
  g.add(box(kit, kit.mat(colours.sienna), [0.7, 0.6, 1], [0, 1.55, 0]))
  g.add(cyl(kit, kit.mat(colours.sienna), 8, 0.35, 1, [0, 1.85, 0], [Math.PI / 2, 0, 0]))
  g.add(box(kit, kit.mat(colours.charcoal), [0.45, 0.06, 0.04], [0, 1.65, 0.52]))
  // The flag lies down at rest and swings up on arrival.
  const flag = new THREE.Group()
  flag.userData.dynamic = true
  flag.position.set(0.4, 1.75, -0.35)
  flag.add(box(kit, kit.mat(colours.amber), [0.06, 0.6, 0.12], [0, 0.25, 0]))
  flag.add(box(kit, kit.mat(colours.amber), [0.06, 0.22, 0.32], [0, 0.45, 0.18]))
  flag.rotation.x = -Math.PI / 2
  g.add(flag)
  // A small picket fence and a lantern post beside the box.
  for (const x of [-1.6, -1.2, -0.8]) g.add(box(kit, kit.mat(colours.ivory), [0.12, 0.7, 0.06], [x, 0.35, -0.2]))
  g.add(box(kit, kit.mat(colours.ivory), [1.1, 0.08, 0.05], [-1.2, 0.5, -0.17]))
  g.add(box(kit, dark, [0.12, 1.8, 0.12], [1.2, 0.9, -0.3]))
  g.add(box(kit, kit.glowFor("contact"), [0.3, 0.36, 0.3], [1.2, 1.95, -0.3]))
  g.userData.arrive = (t: number) => {
    flag.rotation.x = -Math.PI / 2 + (Math.PI / 2) * t
    kit.boostGlow("contact", t)
  }
  return g
}

const builders: Record<ModelKind, (kit: Kit) => THREE.Group> = {
  studio,
  camera,
  office,
  campus,
  campfire,
  mailbox,
}

export function buildModel(kind: ModelKind, kit: Kit): THREE.Group {
  return builders[kind](kit)
}

/** Lamp post with a glowing lantern. */
export function lampPost(kit: Kit): THREE.Group {
  const g = new THREE.Group()
  g.add(cyl(kit, kit.mat(colours.charcoal), 6, 0.08, 2.4, [0, 1.2, 0]))
  g.add(box(kit, kit.mat(colours.charcoal), [0.4, 0.08, 0.4], [0, 2.42, 0]))
  g.add(box(kit, kit.glow, [0.3, 0.38, 0.3], [0, 2.65, 0]))
  g.add(cone(kit, kit.mat(colours.charcoal), 4, 0.32, 0.25, [0, 2.84, 0], [0, Math.PI / 4, 0]))
  return g
}

/**
 * The wooden dock, built along local +z from z = 0 (the beach end) to
 * `length`, deck top at y = `deckY` (the group sits at y = 0). Planks and
 * posts are instanced, so the whole jetty is a handful of draw calls.
 */
export function dock(kit: Kit, length: number, halfWidth: number, deckY: number, ramp: number): THREE.Group {
  const g = new THREE.Group()
  const unit = kit.geo("box", () => new THREE.BoxGeometry(1, 1, 1))
  const pitch = 0.5
  const count = Math.floor(length / pitch)
  // White base material: the per-plank instance colour is the wood tone.
  const planks = new THREE.InstancedMesh(unit, kit.mat("#ffffff"), count)
  const tones = [new THREE.Color(colours.wood), new THREE.Color(colours.wood).lerp(new THREE.Color(colours.woodDark), 0.35)]
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  const v = new THREE.Vector3()
  const sc = new THREE.Vector3()
  for (let i = 0; i < count; i++) {
    const z = i * pitch + pitch / 2
    // The first planks follow the ramp up from the sand.
    const k = Math.min(1, z / ramp)
    const y = 0.3 + (deckY - 0.3) * k * k * (3 - 2 * k) - 0.06
    const tilt = z < ramp ? -0.12 : 0
    q.setFromEuler(e.set(tilt, ((i * 37) % 7) * 0.004 - 0.012, 0))
    m.compose(v.set(0, y, z), q, sc.set(halfWidth * 2, 0.12, pitch - 0.06))
    planks.setMatrixAt(i, m)
    planks.setColorAt(i, tones[(i * 7) % 3 === 0 ? 1 : 0])
  }
  planks.castShadow = planks.receiveShadow = true
  g.add(planks)
  // Stringers under the deck, then posts down into the water.
  for (const x of [-halfWidth + 0.15, halfWidth - 0.15]) {
    g.add(box(kit, kit.mat(colours.woodDark), [0.16, 0.16, length - ramp], [x, deckY - 0.2, ramp + (length - ramp) / 2]))
  }
  const postZ: number[] = []
  for (let z = ramp + 0.6; z < length; z += 2.2) postZ.push(z)
  postZ.push(length - 0.15)
  const postGeo = kit.geo("cyl6-1", () => new THREE.CylinderGeometry(1, 1, 1, 6))
  const posts = new THREE.InstancedMesh(postGeo, kit.mat(colours.woodDark), postZ.length * 2)
  postZ.forEach((z, i) => {
    for (const [j, x] of [-halfWidth + 0.1, halfWidth - 0.1].entries()) {
      const tall = i === postZ.length - 1 ? 0.6 : 0.15
      m.compose(v.set(x, (deckY + tall - 1.8) / 2 + 0.0, z), q.identity(), sc.set(0.13, deckY + tall + 1.8, 0.13))
      posts.setMatrixAt(i * 2 + j, m)
    }
  })
  posts.castShadow = true
  g.add(posts)
  // Rope rail along the last stretch, and a lantern at the end.
  for (const x of [-halfWidth + 0.1, halfWidth - 0.1]) {
    g.add(box(kit, kit.mat(colours.amber), [0.04, 0.04, 4.4], [x, deckY + 0.7, length - 2.4]))
  }
  g.add(box(kit, kit.mat(colours.woodDark), [0.14, 1.6, 0.14], [halfWidth - 0.1, deckY + 0.8, length - 0.15]))
  g.add(box(kit, kit.mat(colours.charcoal), [0.42, 0.06, 0.42], [halfWidth - 0.1, deckY + 1.62, length - 0.15]))
  g.add(box(kit, kit.glow, [0.32, 0.38, 0.32], [halfWidth - 0.1, deckY + 1.85, length - 0.15]))
  return g
}

/** A small rowboat (bow toward local +z), floating at y = 0. */
export function rowboat(kit: Kit): THREE.Group {
  const g = new THREE.Group()
  const hull = cyl(kit, kit.mat(colours.teal), 8, 1, 0.55, [0, 0.1, 0], undefined, 1.25)
  hull.scale.set(0.75, 0.55, 1.9)
  g.add(hull)
  g.add(box(kit, kit.mat(colours.ivory), [1.5, 0.08, 3.5], [0, 0.39, 0]))
  // Floor sits a little proud of the rim slab: level tops would z-fight (flicker).
  g.add(box(kit, kit.mat(colours.woodDark), [1.3, 0.06, 3.1], [0, 0.418, 0]))
  g.add(box(kit, kit.mat(colours.wood), [1.3, 0.1, 0.4], [0, 0.48, 0.3]))
  g.add(box(kit, kit.mat(colours.wood), [0.07, 0.05, 2.4], [0.4, 0.58, -0.1], [0, 0.25, 0]))
  g.add(box(kit, kit.mat(colours.wood), [0.07, 0.05, 2.4], [-0.4, 0.58, -0.1], [0, -0.25, 0]))
  return g
}

/** A sailboat for the horizon (bow toward local +z), floating at y = 0. */
export function sailboat(kit: Kit): THREE.Group {
  const g = new THREE.Group()
  const hull = cyl(kit, kit.mat(colours.ivory), 8, 1, 1, [0, 0.2, 0], undefined, 1.3)
  hull.scale.set(1.1, 0.9, 3.4)
  g.add(hull)
  g.add(box(kit, kit.mat(colours.sienna), [1.4, 0.2, 5.4], [0, 0.72, 0]))
  g.add(cyl(kit, kit.mat(colours.woodDark), 5, 0.1, 7, [0, 4.2, 0.4]))
  const sail = new THREE.Mesh(
    kit.geo("sail", () => {
      const geo = new THREE.BufferGeometry()
      geo.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0, 6, 0, 0, 0, -3.4, 0, 0, 0, 0, 0, -3.4, 0, 6, 0], 3))
      geo.computeVertexNormals()
      return geo
    }),
    kit.mat(colours.ivory)
  )
  sail.position.set(0.05, 1.1, 0.2)
  g.add(sail)
  return g
}

/** True for parts that move on their own (they keep their own meshes). */
function isDynamic(o: THREE.Object3D): boolean {
  const d = o.userData
  return !!(d.dynamic || d.spin || d.spinX || d.flame)
}

/**
 * Merges every static mesh under `root` into one mesh per material, so a
 * landmark built from dozens of boxes costs a few draw calls. Moving parts
 * (see isDynamic) and instanced meshes are left as they are. The merged
 * geometries are owned by the returned meshes (disposed with the scene).
 */
export function bakeStatic(root: THREE.Object3D) {
  root.updateMatrixWorld(true)
  const inverse = new THREE.Matrix4().copy(root.matrixWorld).invert()
  const groups = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; shadow: boolean }>()
  const remove: THREE.Mesh[] = []
  const visit = (o: THREE.Object3D) => {
    for (const child of o.children) {
      if (isDynamic(child)) continue
      const mesh = child as THREE.Mesh
      if (mesh.isMesh && !(mesh as unknown as THREE.InstancedMesh).isInstancedMesh && !Array.isArray(mesh.material)) {
        const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()
        for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal") g.deleteAttribute(name)
        g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld))
        const entry = groups.get(mesh.material) ?? { geos: [], shadow: false }
        entry.geos.push(g)
        entry.shadow ||= mesh.castShadow
        groups.set(mesh.material, entry)
        remove.push(mesh)
      }
      visit(child)
    }
  }
  visit(root)
  for (const mesh of remove) mesh.removeFromParent()
  for (const [material, { geos, shadow }] of groups) {
    const merged = mergeGeometries(geos)
    geos.forEach((g) => g.dispose())
    if (!merged) continue
    const mesh = new THREE.Mesh(merged, material)
    mesh.castShadow = shadow
    mesh.receiveShadow = true
    root.add(mesh)
  }
}
