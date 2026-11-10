/**
 * Models built from primitives (no model files): the six places and the car.
 * Every builder returns a group standing on y = 0 with its front facing
 * local +z. Static parts are merged per material (mergeStatic) so each
 * place costs a handful of draw calls.
 *
 * Animated parts are tagged in userData and picked up by scene.ts:
 *   userData.spin   radians per second around the part's own y axis
 *   userData.blink  blink period in seconds (rooftop beacons)
 *   userData.keep   never merged (animated, or a sign with its own texture)
 */
import * as THREE from "three"
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js"
import type { ModelKind } from "./landmarks"
import { colours } from "./palette"

const SIGN_FONT = '"Oswald Variable", "Arial Narrow", Impact, sans-serif'

interface SignSpec {
  text: string
  sub?: string
  fg: string
  bg: string | null
  border?: string
  aspect: number
}

/** Shared, cached materials, geometries and sign textures. */
export class Kit {
  private materials = new Map<string, THREE.Material>()
  private geometries = new Map<string, THREE.BufferGeometry>()
  private signs: Array<{ spec: SignSpec; canvas: HTMLCanvasElement; texture: THREE.CanvasTexture; mat: THREE.MeshBasicMaterial }> = []
  private neons: THREE.MeshLambertMaterial[] = []
  /** Windows and lamp heads: glow strength follows the theme. */
  readonly glow: THREE.MeshLambertMaterial
  readonly tail: THREE.MeshLambertMaterial

  constructor() {
    this.glow = new THREE.MeshLambertMaterial({ color: colours.glass, emissive: colours.windowGlow, flatShading: true })
    this.tail = new THREE.MeshLambertMaterial({ color: "#5a1414", emissive: colours.tail, emissiveIntensity: 0.6 })
    this.materials.set("glow", this.glow)
    this.materials.set("tail", this.tail)
    // Redraw the signs once the HUD font has loaded (it is already in use by then).
    document.fonts?.load(`700 64px ${SIGN_FONT}`).then(() => this.signs.forEach((s) => this.drawSign(s)), () => {})
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

  /** Glowing tube colour (cached); strength follows the theme. */
  neon(colour: string): THREE.MeshLambertMaterial {
    const key = `neon:${colour}`
    let m = this.materials.get(key) as THREE.MeshLambertMaterial | undefined
    if (!m) {
      m = new THREE.MeshLambertMaterial({ color: colour, emissive: colour, emissiveIntensity: 1 })
      this.materials.set(key, m)
      this.neons.push(m)
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

  /** An unlit sign face with text drawn on a canvas. */
  sign(spec: SignSpec): THREE.MeshBasicMaterial {
    const canvas = document.createElement("canvas")
    canvas.width = 512
    canvas.height = Math.max(32, Math.round(512 / spec.aspect))
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 4
    const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: spec.bg === null, fog: true })
    const entry = { spec, canvas, texture, mat }
    this.signs.push(entry)
    this.drawSign(entry)
    return mat
  }

  private drawSign({ spec, canvas, texture }: (typeof this.signs)[number]) {
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const { width: w, height: h } = canvas
    ctx.clearRect(0, 0, w, h)
    if (spec.bg) {
      ctx.fillStyle = spec.bg
      ctx.fillRect(0, 0, w, h)
    }
    if (spec.border) {
      ctx.strokeStyle = spec.border
      ctx.lineWidth = Math.max(6, h * 0.07)
      ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth)
    }
    ctx.fillStyle = spec.fg
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    const mainH = spec.sub ? h * 0.58 : h * 0.72
    let size = mainH
    ctx.font = `700 ${size}px ${SIGN_FONT}`
    const maxW = w * 0.86
    const measured = ctx.measureText(spec.text).width
    if (measured > maxW) size *= maxW / measured
    ctx.font = `700 ${size}px ${SIGN_FONT}`
    ctx.fillText(spec.text, w / 2, spec.sub ? h * 0.4 : h * 0.54)
    if (spec.sub) {
      ctx.font = `500 ${h * 0.2}px ${SIGN_FONT}`
      ctx.globalAlpha = 0.85
      ctx.fillText(spec.sub, w / 2, h * 0.8)
      ctx.globalAlpha = 1
    }
    texture.needsUpdate = true
  }

  setTheme(glow: number, neon: number, signs: number) {
    this.glow.emissiveIntensity = glow
    this.glow.color.set(glow > 0.5 ? colours.glass : "#c9d3dc")
    for (const m of this.neons) m.emissiveIntensity = neon * 0.6
    for (const s of this.signs) s.mat.color.setScalar(signs)
    this.tail.emissiveIntensity = glow > 0.5 ? 1.4 : 0.6
  }

  dispose() {
    this.materials.forEach((m) => m.dispose())
    this.geometries.forEach((g) => g.dispose())
    for (const s of this.signs) {
      s.texture.dispose()
      s.mat.dispose()
    }
    this.materials.clear()
    this.geometries.clear()
    this.signs = []
    this.neons = []
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
export function box(kit: Kit, mat: THREE.Material, size: Vec3, pos: Vec3, rotation?: Vec3) {
  const g = kit.geo("box", () => new THREE.BoxGeometry(1, 1, 1))
  return place(new THREE.Mesh(g, mat), pos, size, rotation)
}

/** Cylinder (axis y) with `sides` facets, radius r and height h, centred at `pos`. */
export function cyl(kit: Kit, mat: THREE.Material, sides: number, r: number, h: number, pos: Vec3, rotation?: Vec3, topRatio = 1) {
  const g = kit.geo(`cyl${sides}-${topRatio}`, () => new THREE.CylinderGeometry(topRatio, 1, 1, sides))
  return place(new THREE.Mesh(g, mat), pos, [r, h, r], rotation)
}

/** Cone/pyramid with `sides` facets, base radius r, height h, base centred at `pos`. */
function cone(kit: Kit, mat: THREE.Material, sides: number, r: number, h: number, pos: Vec3, rotation?: Vec3) {
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

/** A flat sign facing +z (a plane, slightly in front of the wall it sits on). */
function signPlane(kit: Kit, mat: THREE.Material, w: number, h: number, pos: Vec3, rotY = 0) {
  const g = kit.geo("plane", () => new THREE.PlaneGeometry(1, 1))
  const m = new THREE.Mesh(g, mat)
  m.position.set(...pos)
  m.scale.set(w, h, 1)
  m.rotation.y = rotY
  m.userData.keep = true
  return m
}

/** A grid of window panes on the +z face of a box (front at z = `z`). */
function windowGrid(kit: Kit, g: THREE.Group, x0: number, x1: number, y0: number, y1: number, z: number, pw = 1.1, ph = 1.3, gapX = 1, gapY = 1.4) {
  const cols = Math.max(1, Math.floor((x1 - x0 + gapX) / (pw + gapX)))
  const rows = Math.max(1, Math.floor((y1 - y0 + gapY) / (ph + gapY)))
  const spanX = cols * pw + (cols - 1) * gapX
  const spanY = rows * ph + (rows - 1) * gapY
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const x = (x0 + x1) / 2 - spanX / 2 + pw / 2 + c * (pw + gapX)
      const y = (y0 + y1) / 2 - spanY / 2 + ph / 2 + r * (ph + gapY)
      const pane = box(kit, kit.glow, [pw, ph, 0.08], [x, y, z])
      pane.castShadow = false
      g.add(pane)
    }
  }
}

/**
 * Merges every static mesh in `group` (not tagged userData.keep, and not
 * under a tagged parent) into one mesh per material, in the group's space.
 */
export function mergeStatic(group: THREE.Group): THREE.Group {
  group.updateMatrixWorld(true)
  const inverse = new THREE.Matrix4().copy(group.matrixWorld).invert()
  const buckets = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; cast: boolean }>()
  const remove: THREE.Object3D[] = []
  group.traverse((o) => {
    if (o === group) return
    for (let p: THREE.Object3D | null = o; p && p !== group; p = p.parent) if (p.userData.keep) return
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh || Array.isArray(mesh.material)) return
    const geo = (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()).applyMatrix4(
      new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld)
    )
    for (const name of Object.keys(geo.attributes)) if (!["position", "normal", "uv"].includes(name)) geo.deleteAttribute(name)
    let bucket = buckets.get(mesh.material)
    if (!bucket) {
      bucket = { geos: [], cast: false }
      buckets.set(mesh.material, bucket)
    }
    bucket.geos.push(geo)
    bucket.cast ||= mesh.castShadow
    remove.push(mesh)
  })
  for (const o of remove) o.removeFromParent()
  for (const [material, { geos, cast }] of buckets) {
    const merged = mergeGeometries(geos)
    geos.forEach((g) => g.dispose())
    if (!merged) continue
    const mesh = new THREE.Mesh(merged, material)
    mesh.castShadow = cast
    mesh.receiveShadow = true
    group.add(mesh)
  }
  return group
}

/** Glass office tower (Experience). Footprint 10 x 10, about 25 tall. */
function tower(kit: Kit): THREE.Group {
  const g = new THREE.Group()
  const concrete = kit.mat(colours.concrete)
  const glass = kit.mat(colours.glassBlue)
  const trim = kit.mat(colours.ivory)
  // Podium with a glass lobby.
  g.add(box(kit, concrete, [10, 4, 10], [0, 2, 0]))
  g.add(box(kit, kit.glow, [6, 2.8, 0.1], [0, 1.6, 5.02]))
  g.add(box(kit, trim, [7, 0.25, 1.6], [0, 3.2, 5.6]))
  // Tower.
  g.add(box(kit, glass, [8, 20, 8], [0, 14, 0]))
  for (let y = 6; y <= 22; y += 2.6) g.add(box(kit, trim, [8.2, 0.22, 8.2], [0, y, 0]))
  for (const x of [-4, 4]) for (const z of [-4, 4]) g.add(box(kit, trim, [0.3, 20, 0.3], [x, 14, z]))
  // Lit floors on the front and sides.
  for (let y = 7.3; y < 23; y += 2.6) {
    for (let i = -3; i <= 3; i += 2) {
      if ((y * 3 + i) % 5 < 2.2) continue
      g.add(box(kit, kit.glow, [1.4, 1.2, 0.08], [i, y, 4.05]))
      g.add(box(kit, kit.glow, [0.08, 1.2, 1.4], [4.05, y, i]))
      g.add(box(kit, kit.glow, [0.08, 1.2, 1.4], [-4.05, y, -i]))
    }
  }
  // Crown, antenna and a blinking beacon.
  g.add(box(kit, concrete, [6, 1.6, 6], [0, 24.8, 0]))
  g.add(cyl(kit, kit.mat(colours.charcoal), 6, 0.08, 4, [1.5, 27.5, 0]))
  const beacon = box(kit, kit.neon(colours.tail), [0.3, 0.3, 0.3], [1.5, 29.6, 0])
  beacon.userData = { keep: true, blink: 1.6 }
  g.add(beacon)
  // Signs: one on the crown, one over the lobby.
  const top = kit.sign({ text: "MPAC", fg: "#ffffff", bg: "#1f4f86", aspect: 3 })
  g.add(signPlane(kit, top, 5.4, 1.8, [0, 24.8, 3.02]))
  const lobby = kit.sign({ text: "MPAC", sub: "AI TEAM", fg: "#1f2d44", bg: "#eef3f8", aspect: 3.6 })
  g.add(signPlane(kit, lobby, 4.4, 1.2, [0, 3.2, 6.42]))
  return g
}

/** Campus hall with a clock tower (Education). Footprint 12 x 10. */
function campus(kit: Kit): THREE.Group {
  const g = new THREE.Group()
  const stone = kit.mat(colours.stone)
  const stoneDark = kit.mat(colours.stoneDark)
  const roof = kit.mat(colours.roofRed)
  const copper = kit.mat(colours.teal)
  g.add(box(kit, stoneDark, [12, 0.6, 10], [0, 0.3, 0]))
  g.add(box(kit, stone, [11.4, 7, 8], [0, 4, -0.5]))
  g.add(gable(kit, roof, 12, 3, 8.6, [0, 7.5, -0.5]))
  windowGrid(kit, g, -5.2, -2.2, 1.6, 6.6, 3.55, 0.9, 1.6, 0.7, 1.4)
  windowGrid(kit, g, 2.2, 5.2, 1.6, 6.6, 3.55, 0.9, 1.6, 0.7, 1.4)
  // Clock tower.
  g.add(box(kit, stone, [3.4, 13, 3.4], [0, 6.5, 2]))
  g.add(box(kit, stoneDark, [3.8, 0.4, 3.8], [0, 13.2, 2]))
  g.add(cone(kit, copper, 4, 2.6, 3.4, [0, 13.4, 2], [0, Math.PI / 4, 0]))
  g.add(cyl(kit, kit.mat(colours.ivory), 12, 1.05, 0.12, [0, 10.6, 3.72], [Math.PI / 2, 0, 0]))
  const hands = new THREE.Group()
  hands.position.set(0, 10.6, 3.82)
  // Each hand hangs from its own pivot at the clock centre: [minute, hour].
  for (const [len, width] of [[0.8, 0.1], [0.55, 0.14]]) {
    const pivot = new THREE.Group()
    pivot.add(box(kit, kit.mat(colours.charcoal), [width, len, 0.06], [0, len / 2 - 0.08, 0]))
    hands.add(pivot)
  }
  hands.userData = { keep: true, clock: true }
  g.add(hands)
  // Arched door and steps.
  g.add(box(kit, kit.mat(colours.charcoal), [1.8, 2.8, 0.1], [0, 2, 3.73]))
  g.add(cyl(kit, kit.mat(colours.charcoal), 12, 0.9, 0.1, [0, 3.4, 3.73], [Math.PI / 2, 0, 0]))
  g.add(box(kit, stoneDark, [4, 0.3, 1.2], [0, 0.75, 4.3]))
  // Gate pillars at the front corners.
  for (const x of [-5.4, 5.4]) {
    g.add(box(kit, stoneDark, [0.9, 2.6, 0.9], [x, 1.3, 4.4]))
    g.add(box(kit, stone, [1.1, 0.25, 1.1], [x, 2.7, 4.4]))
  }
  const banner = kit.sign({ text: "QUEEN'S", sub: "COMPUTING · AI", fg: "#f6e7c8", bg: "#2a2f5c", aspect: 2.6 })
  g.add(signPlane(kit, banner, 3.6, 1.4, [0, 5.4, 3.73]))
  return g
}

/** Game studio storefront (Roflow). Footprint 10 x 8. */
function studio(kit: Kit): THREE.Group {
  const g = new THREE.Group()
  const wall = kit.mat(colours.sienna)
  const dark = kit.mat(colours.charcoal)
  g.add(box(kit, wall, [10, 7, 8], [0, 3.5, 0]))
  g.add(box(kit, dark, [10.3, 0.4, 8.3], [0, 7.1, 0]))
  // Shopfront: big lit window, door, awning.
  g.add(box(kit, kit.glow, [6, 2.6, 0.1], [-1.2, 1.7, 4.02]))
  g.add(box(kit, dark, [1.4, 2.6, 0.1], [3.4, 1.4, 4.02]))
  g.add(box(kit, kit.mat("#ffb36b"), [9, 0.18, 1.6], [0, 3.4, 4.7], [0.18, 0, 0]))
  windowGrid(kit, g, -4.2, 4.2, 4.4, 6.2, 4.02, 1.6, 1.4, 0.9, 1)
  // Screens in the window (pixel-ish blocks).
  for (const x of [-3.2, -1.2, 0.8]) g.add(box(kit, kit.neon(colours.neonCyan), [1.4, 0.9, 0.06], [x, 1.9, 4.1]))
  // Rooftop billboard frame with a neon sign.
  for (const x of [-3.2, 3.2]) g.add(box(kit, dark, [0.2, 2, 0.2], [x, 8.2, 0.5]))
  g.add(box(kit, dark, [8, 2.4, 0.3], [0, 9.6, 0.4]))
  const sign = kit.sign({ text: "ROFLOW", sub: "AI-NATIVE IDE FOR ROBLOX", fg: "#fff1e6", bg: "#e2552b", aspect: 3.3 })
  g.add(signPlane(kit, sign, 7.6, 2.2, [0, 9.6, 0.57]))
  g.add(box(kit, kit.neon(colours.neonAmber), [8.2, 0.12, 0.12], [0, 10.9, 0.6]))
  g.add(box(kit, kit.neon(colours.neonAmber), [8.2, 0.12, 0.12], [0, 8.3, 0.6]))
  return g
}

/** Film studio with a rooftop screen (DemoPilot). Footprint 10 x 8. */
function filmlot(kit: Kit): THREE.Group {
  const g = new THREE.Group()
  const wall = kit.mat("#efe2c8")
  const dark = kit.mat(colours.charcoal)
  g.add(box(kit, wall, [10, 6, 8], [0, 3, 0]))
  // Barrel-vault roof (half cylinder along z).
  const vault = cyl(kit, kit.mat("#b9a7d6"), 10, 5, 8, [0, 6, 0], [Math.PI / 2, 0, 0])
  vault.scale.set(5, 8, 1.6)
  g.add(vault)
  // Roll-up stage door and a marquee.
  g.add(box(kit, kit.mat(colours.steel), [4, 4, 0.1], [-1.8, 2, 4.02]))
  for (let y = 0.4; y < 4; y += 0.5) g.add(box(kit, kit.mat(colours.concreteDark), [4, 0.05, 0.12], [-1.8, y, 4.05]))
  g.add(box(kit, dark, [1.2, 2.4, 0.1], [3, 1.2, 4.02]))
  const marquee = kit.sign({ text: "DEMOPILOT", sub: "STAGE 1", fg: "#2a1d40", bg: "#f6efe0", border: "#8a5cd6", aspect: 4 })
  g.add(signPlane(kit, marquee, 6, 1.5, [0, 5, 4.03]))
  for (let x = -2.8; x <= 2.8; x += 0.7) {
    g.add(box(kit, kit.neon(colours.neonAmber), [0.16, 0.16, 0.1], [x, 5.85, 4.06]))
    g.add(box(kit, kit.neon(colours.neonAmber), [0.16, 0.16, 0.1], [x, 4.15, 4.06]))
  }
  // Rooftop screen showing a play button.
  for (const x of [-2.4, 2.4]) g.add(box(kit, dark, [0.25, 3, 0.25], [x, 9.4, 1]))
  g.add(box(kit, dark, [6.4, 3.8, 0.3], [0, 11.8, 1]))
  const screen = kit.sign({ text: "▶  NOW RENDERING", fg: "#ffffff", bg: "#5b2ea6", aspect: 1.75 })
  g.add(signPlane(kit, screen, 6, 3.4, [0, 11.8, 1.17]))
  return g
}

/** Neon arcade (Off the clock). Footprint 9 x 8. */
function arcade(kit: Kit): THREE.Group {
  const g = new THREE.Group()
  const wall = kit.mat("#3a2d5c")
  const dark = kit.mat(colours.charcoal)
  g.add(box(kit, wall, [9, 6.5, 8], [0, 3.25, 0]))
  g.add(box(kit, dark, [9.3, 0.4, 8.3], [0, 6.6, 0]))
  // Glowing doorway and cabinet silhouettes in the windows.
  g.add(box(kit, kit.neon(colours.neonPink), [1.8, 2.8, 0.1], [0, 1.4, 4.02]))
  for (const x of [-3, -1.8, 1.8, 3]) {
    g.add(box(kit, kit.glow, [1, 2, 0.1], [x, 1.6, 4.02]))
    g.add(box(kit, kit.neon(colours.neonCyan), [0.6, 0.45, 0.06], [x, 1.9, 4.08]))
  }
  // Neon trim along the roofline and the corners.
  g.add(box(kit, kit.neon(colours.neonCyan), [9.2, 0.14, 0.14], [0, 6.3, 4.08]))
  for (const x of [-4.5, 4.5]) g.add(box(kit, kit.neon(colours.neonPink), [0.14, 6.2, 0.14], [x, 3.2, 4.08]))
  const sign = kit.sign({ text: "ARCADE", sub: "OPEN LATE", fg: "#ff7cc4", bg: "#1b1030", border: "#39d6ff", aspect: 2.8 })
  g.add(signPlane(kit, sign, 6.4, 2.3, [0, 4.6, 4.05]))
  // Rooftop: a mountain cut-out (training for a summit).
  const peak = cone(kit, kit.mat("#e9eef4"), 4, 2.2, 3.4, [2, 6.8, -1.5], [0, Math.PI / 4, 0])
  g.add(peak)
  g.add(cone(kit, kit.mat("#9aa5b8"), 4, 1.6, 2.2, [-0.6, 6.8, -2], [0, Math.PI / 4, 0]))
  return g
}

/** Payphone kiosk (Contact). Footprint 3 x 2. */
function payphone(kit: Kit): THREE.Group {
  const g = new THREE.Group()
  const steel = kit.mat(colours.steel)
  const dark = kit.mat(colours.charcoal)
  const pink = kit.neon(colours.neonPink)
  g.add(box(kit, kit.mat(colours.concrete), [3, 0.15, 2], [0, 0.075, 0]))
  for (const x of [-0.75, 0.75]) {
    // Booth: back panel, side posts, phone unit, hood.
    g.add(box(kit, steel, [1.3, 2.4, 0.12], [x, 1.35, -0.8]))
    for (const s of [-0.62, 0.62]) g.add(box(kit, dark, [0.08, 2.5, 1.4], [x + s, 1.3, -0.1]))
    g.add(box(kit, dark, [0.55, 0.8, 0.3], [x, 1.5, -0.6]))
    g.add(box(kit, kit.mat("#c9d4e0"), [0.18, 0.45, 0.14], [x - 0.12, 1.55, -0.4]))
    g.add(box(kit, pink, [1.3, 0.25, 1.5], [x, 2.65, -0.1]))
  }
  // Tall pole sign.
  g.add(cyl(kit, dark, 6, 0.08, 4.4, [1.3, 2.2, 0.6]))
  const sign = kit.sign({ text: "CALL ME", sub: "PAYPHONE", fg: "#ffffff", bg: "#d63a86", aspect: 2.2 })
  g.add(signPlane(kit, sign, 2.2, 1, [1.3, 4.6, 0.7]))
  return g
}

const builders: Record<ModelKind, (kit: Kit) => THREE.Group> = {
  tower,
  campus,
  studio,
  filmlot,
  arcade,
  payphone,
}

export function buildModel(kind: ModelKind, kit: Kit): THREE.Group {
  return mergeStatic(builders[kind](kit))
}

/** Street light: pole and an arm reaching along local +z, with a glowing head. */
export function lampPost(kit: Kit): THREE.Group {
  const g = new THREE.Group()
  const dark = kit.mat(colours.charcoal)
  g.add(cyl(kit, dark, 6, 0.1, 5, [0, 2.5, 0]))
  g.add(box(kit, dark, [0.14, 0.14, 1.6], [0, 4.95, 0.75]))
  g.add(box(kit, kit.glow, [0.45, 0.16, 0.7], [0, 4.85, 1.5]))
  return g
}

export interface CarParts {
  group: THREE.Group
  /** Front wheel pivots (steer around y). */
  steer: THREE.Group[]
  /** All four wheels (roll around x). */
  wheels: THREE.Object3D[]
}

/**
 * A low-poly two-door coupe, 4.5 long and 2 wide, front facing +z. The body
 * is merged; the wheels stay separate so they can roll and steer.
 */
export function carModel(kit: Kit, colour: string): CarParts {
  const g = new THREE.Group()
  const body = new THREE.Group()
  const paint = kit.mat(colour)
  const dark = kit.mat(colours.charcoal)
  const glass = kit.mat(colours.glass)
  body.add(box(kit, paint, [2, 0.62, 4.4], [0, 0.66, 0]))
  body.add(box(kit, paint, [1.9, 0.2, 1.4], [0, 1.02, 1.35], [-0.08, 0, 0]))
  body.add(box(kit, glass, [1.7, 0.56, 2.1], [0, 1.24, -0.35]))
  body.add(box(kit, paint, [1.74, 0.1, 1.6], [0, 1.55, -0.45]))
  body.add(box(kit, kit.mat(colours.ivory), [0.3, 0.02, 1.5], [0.35, 1.13, 1.35], [-0.08, 0, 0]))
  body.add(box(kit, kit.mat(colours.ivory), [0.3, 0.02, 1.5], [-0.35, 1.13, 1.35], [-0.08, 0, 0]))
  body.add(box(kit, dark, [2.06, 0.26, 0.3], [0, 0.45, 2.2]))
  body.add(box(kit, dark, [2.06, 0.26, 0.3], [0, 0.45, -2.2]))
  body.add(box(kit, paint, [1.9, 0.08, 0.5], [0, 1.18, -2.05]))
  for (const x of [-0.7, 0.7]) {
    body.add(box(kit, kit.glow, [0.42, 0.16, 0.06], [x, 0.78, 2.21]))
    body.add(box(kit, kit.tail, [0.42, 0.14, 0.06], [x, 0.8, -2.21]))
  }
  mergeStatic(body)
  g.add(body)
  const wheelGeo = kit.geo("wheel", () => new THREE.CylinderGeometry(0.4, 0.4, 0.34, 10).rotateZ(Math.PI / 2))
  const tyre = kit.mat("#232026")
  const hub = kit.mat(colours.steel)
  const steer: THREE.Group[] = []
  const wheels: THREE.Object3D[] = []
  for (const z of [1.4, -1.4]) {
    for (const x of [-0.92, 0.92]) {
      const pivot = new THREE.Group()
      pivot.position.set(x, 0.4, z)
      const wheel = new THREE.Mesh(wheelGeo, tyre)
      wheel.castShadow = true
      const cap = box(kit, hub, [0.36, 0.3, 0.12], [0, 0, 0])
      cap.castShadow = false
      wheel.add(cap)
      pivot.add(wheel)
      g.add(pivot)
      wheels.push(wheel)
      if (z > 0) steer.push(pivot)
    }
  }
  return { group: g, steer, wheels }
}
