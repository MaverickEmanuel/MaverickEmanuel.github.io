/**
 * Landmark models, built from primitives (no model files). Every builder
 * returns a group standing on y = 0 with its front facing local +z.
 *
 * Animated parts are tagged in userData and picked up by scene.ts:
 *   userData.spin   radians per second around the part's own y axis
 *   userData.flame  flicker (scale and the campfire light)
 */
import * as THREE from "three"
import type { ModelKind } from "./landmarks"
import { colours } from "./palette"

/** Shared, cached materials and geometries, so the scene stays cheap and easy to dispose. */
export class Kit {
  private materials = new Map<string, THREE.Material>()
  private geometries = new Map<string, THREE.BufferGeometry>()
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

  setGlow(intensity: number) {
    this.glow.emissiveIntensity = intensity
    this.glow.color.set(intensity > 0.5 ? colours.glass : "#cfd6d6")
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

function studio(kit: Kit): THREE.Group {
  const g = new THREE.Group()
  const wall = kit.mat(colours.sienna)
  const trim = kit.mat(colours.amber)
  const dark = kit.mat(colours.charcoal)
  g.add(box(kit, kit.mat(colours.stoneDark), [6.6, 0.3, 5], [0, 0.15, 0]))
  g.add(box(kit, wall, [6, 3, 4.4], [0, 1.8, 0]))
  g.add(box(kit, trim, [6.1, 0.22, 4.5], [0, 3.3, 0]))
  g.add(gable(kit, kit.mat(colours.ivory), 7, 2, 5.2, [0, 3.4, 0]))
  // Big workshop window and door on the front.
  g.add(box(kit, kit.glow, [2.6, 1.5, 0.1], [-1.3, 2, 2.22]))
  g.add(box(kit, dark, [2.8, 0.14, 0.2], [-1.3, 2.8, 2.25]))
  g.add(box(kit, kit.mat(colours.woodDark), [1.2, 2.1, 0.1], [1.7, 1.35, 2.22]))
  g.add(box(kit, trim, [1.6, 0.5, 0.12], [1.7, 2.75, 2.25]))
  // Chimney.
  g.add(box(kit, kit.mat(colours.stoneDark), [0.7, 1.8, 0.7], [2, 4.4, -1]))
  // Workbench outside.
  g.add(box(kit, kit.mat(colours.wood), [1.8, 0.12, 0.8], [-3.9, 1, 1.2]))
  g.add(box(kit, kit.mat(colours.woodDark), [0.12, 0.9, 0.7], [-4.7, 0.5, 1.2]))
  g.add(box(kit, kit.mat(colours.woodDark), [0.12, 0.9, 0.7], [-3.1, 0.5, 1.2]))
  // A floating, spinning block above the roof: a nod to building games.
  const block = box(kit, trim, [0.9, 0.9, 0.9], [0, 6.4, 0], [0.6, 0, 0.6])
  const pivot = new THREE.Group()
  pivot.position.set(0, 0, 0)
  pivot.add(block)
  pivot.userData.spin = 0.8
  g.add(pivot)
  return g
}

function camera(kit: Kit): THREE.Group {
  const g = new THREE.Group()
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
  g.add(cyl(kit, kit.glow, 8, 0.24, 0.05, [0, 2.75, 1.47], [Math.PI / 2, 0, 0]))
  for (const z of [-0.45, 0.45]) {
    const reel = new THREE.Group()
    reel.position.set(0, 3.75, z)
    reel.add(cyl(kit, kit.mat(colours.amber), 10, 0.55, 0.16, [0, 0, 0], [0, 0, Math.PI / 2]))
    reel.add(box(kit, dark, [0.18, 0.2, 0.2], [0, 0, 0.35]))
    reel.userData.spinX = z > 0 ? 1.6 : 1.2
    g.add(reel)
  }
  // Playback screen on a stand, beside the camera.
  g.add(box(kit, metal, [0.14, 1.6, 0.14], [-2.1, 0.8, -0.4]))
  g.add(box(kit, dark, [2.6, 1.6, 0.16], [-2.1, 2.2, -0.4]))
  g.add(box(kit, kit.glow, [2.3, 1.3, 0.05], [-2.1, 2.2, -0.3]))
  return g
}

function office(kit: Kit): THREE.Group {
  const g = new THREE.Group()
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
      g.add(box(kit, kit.glow, [1, 1.1, 0.08], [x, y, 2.12]))
    }
    for (const side of [-1, 1]) {
      for (const z of [-1, 1]) g.add(box(kit, kit.glow, [0.08, 1.1, 1], [side * 2.52, y, z]))
    }
  }
  // Entrance and canopy.
  g.add(box(kit, kit.glow, [1.2, 1.9, 0.08], [0, 1.25, 2.12]))
  g.add(box(kit, slate, [2.2, 0.15, 1.2], [0, 2.4, 2.6]))
  return g
}

function campus(kit: Kit): THREE.Group {
  const g = new THREE.Group()
  const stone = kit.mat(colours.stone)
  const roof = kit.mat(colours.roofRed)
  g.add(box(kit, kit.mat(colours.stoneDark), [9.4, 0.3, 5], [0, 0.15, 0]))
  // Hall with a pitched roof.
  g.add(box(kit, stone, [8.6, 3.4, 4], [0, 2, 0]))
  g.add(gable(kit, roof, 4.6, 1.8, 9, [0, 3.7, 0]).rotateY(Math.PI / 2))
  // Arched windows along the front.
  for (const x of [-3.2, -1.9, 1.9, 3.2]) {
    g.add(box(kit, kit.glow, [0.7, 1.5, 0.08], [x, 2.1, 2.02]))
  }
  // Central clock tower with a pyramid roof.
  g.add(box(kit, stone, [2.2, 7, 2.2], [0, 3.8, 0.9]))
  g.add(box(kit, kit.mat(colours.stoneDark), [2.5, 0.3, 2.5], [0, 7.4, 0.9]))
  g.add(cone(kit, kit.mat(colours.teal), 4, 1.75, 2.2, [0, 7.55, 0.9], [0, Math.PI / 4, 0]))
  g.add(cyl(kit, kit.mat(colours.ivory), 12, 0.6, 0.1, [0, 5.6, 2.02], [Math.PI / 2, 0, 0]))
  g.add(box(kit, kit.mat(colours.charcoal), [0.08, 0.45, 0.06], [0, 5.75, 2.1]))
  // Doorway.
  g.add(box(kit, kit.mat(colours.woodDark), [1.1, 2, 0.1], [0, 1.3, 2.02]))
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
  return g
}

function mailbox(kit: Kit): THREE.Group {
  const g = new THREE.Group()
  const wood = kit.mat(colours.wood)
  const dark = kit.mat(colours.woodDark)
  // Mailbox on a post, slot toward the island.
  g.add(box(kit, dark, [0.22, 1.3, 0.22], [0, 0.65, 0]))
  g.add(box(kit, kit.mat(colours.sienna), [0.7, 0.6, 1], [0, 1.55, 0]))
  g.add(cyl(kit, kit.mat(colours.sienna), 8, 0.35, 1, [0, 1.85, 0], [Math.PI / 2, 0, 0]))
  g.add(box(kit, kit.mat(colours.charcoal), [0.45, 0.06, 0.04], [0, 1.65, 0.52]))
  g.add(box(kit, kit.mat(colours.amber), [0.06, 0.6, 0.12], [0.4, 2, -0.2]))
  g.add(box(kit, kit.mat(colours.amber), [0.06, 0.22, 0.32], [0.4, 2.2, -0.02]))
  // Dock running out to sea behind the mailbox (local -z).
  const deckY = 0.55
  g.add(box(kit, wood, [2.2, 0.18, 10], [0, deckY, -7]))
  for (let z = -2.6; z >= -11.4; z -= 2.2) {
    for (const x of [-1, 1]) g.add(cyl(kit, dark, 6, 0.13, 1.6, [x, deckY - 0.7, z]))
  }
  // Lantern at the end of the dock.
  g.add(box(kit, dark, [0.14, 1.6, 0.14], [0.9, deckY + 0.8, -11.6]))
  g.add(box(kit, kit.glow, [0.34, 0.4, 0.34], [0.9, deckY + 1.75, -11.6]))
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
