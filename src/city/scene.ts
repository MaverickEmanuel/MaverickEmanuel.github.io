/**
 * Renderer, camera, lights, sky, water and the city itself: roads, blocks,
 * buildings, the skyline, street furniture and the six places. Everything is
 * built procedurally from primitives, and static geometry is merged into a
 * few large meshes (by material) so the whole district stays at a modest
 * number of draw calls on phones. The theme only swaps colours and
 * intensities on objects that already exist (applyTheme).
 */
import * as THREE from "three"
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js"
import { site } from "@/content/site"
import {
  CURB,
  SHORE_Z,
  blocks,
  buildings,
  court,
  groundHeight,
  hoops,
  lamps,
  palms,
  parkedCars,
  parkingLot,
  random,
  roads,
  type Rect,
} from "./layout"
import { landmarks } from "./landmarks"
import { Kit, box, buildModel, carModel, cyl, lampPost, mergeStatic } from "./models"
import { colours, palettes, type Theme } from "./palette"

export interface CityScene {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  kit: Kit
  /** Objects a click/tap can land on. Landmark groups carry userData.landmarkId. */
  pickables: THREE.Object3D[]
  applyTheme(theme: Theme): void
  /** Centres the shadow-casting light's coverage on (x, z). */
  focus(x: number, z: number): void
  update(dt: number, time: number): void
  resize(width: number, height: number): void
  render(): void
  dispose(): void
}

const SKY_VERTEX = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const SKY_FRAGMENT = /* glsl */ `
  uniform vec3 top;
  uniform vec3 horizon;
  uniform vec3 sunGlow;
  uniform vec3 sunDir;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float h = max(d.y, 0.0);
    vec3 col = mix(horizon, top, pow(smoothstep(0.0, 0.8, h), 0.6));
    float s = max(dot(d, normalize(sunDir)), 0.0);
    col += sunGlow * (smoothstep(0.9975, 0.9985, s) * 0.9 + pow(s, 12.0) * 0.5 + pow(s, 3.0) * 0.1);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`

/** Collects coloured boxes into one merged, vertex-coloured geometry. */
class BoxBatch {
  private geos: THREE.BufferGeometry[] = []
  private m = new THREE.Matrix4()
  private q = new THREE.Quaternion()
  private e = new THREE.Euler()
  private c = new THREE.Color()

  add(size: [number, number, number], pos: [number, number, number], colour: string | number, rotY = 0) {
    const g = new THREE.BoxGeometry(1, 1, 1).toNonIndexed()
    g.deleteAttribute("uv")
    this.m.compose(new THREE.Vector3(...pos), this.q.setFromEuler(this.e.set(0, rotY, 0)), new THREE.Vector3(...size))
    g.applyMatrix4(this.m)
    this.c.set(colour)
    const n = g.attributes.position.count
    const col = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) col.set([this.c.r, this.c.g, this.c.b], i * 3)
    g.setAttribute("color", new THREE.BufferAttribute(col, 3))
    this.geos.push(g)
  }

  /** A box spanning a ground rect from y0 to y1. */
  rect([x0, z0, x1, z1]: Rect, y0: number, y1: number, colour: string | number) {
    this.add([x1 - x0, y1 - y0, z1 - z0], [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], colour)
  }

  build(material: THREE.Material, shadows: { cast: boolean; receive: boolean }): THREE.Mesh | null {
    if (!this.geos.length) return null
    const merged = mergeGeometries(this.geos)
    this.geos.forEach((g) => g.dispose())
    this.geos = []
    const mesh = new THREE.Mesh(merged, material)
    mesh.castShadow = shadows.cast
    mesh.receiveShadow = shadows.receive
    return mesh
  }
}

export function createScene(canvas: HTMLCanvasElement, opts: { lowPower: boolean }): CityScene {
  const { lowPower } = opts
  const dpr = Math.min(window.devicePixelRatio || 1, lowPower ? 1.5 : 2)
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: dpr < 2, powerPreference: "high-performance" })
  const gl = renderer.getContext()
  if (!gl || gl.isContextLost()) throw new Error("WebGL context unavailable")
  renderer.setPixelRatio(dpr)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap

  const scene = new THREE.Scene()
  scene.fog = new THREE.Fog(0x000000, 60, 200)
  const camera = new THREE.PerspectiveCamera(50, 1, 0.3, 1400)
  const kit = new Kit()
  const pickables: THREE.Object3D[] = []
  const vertexLambert = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })

  // Sky dome: vertical gradient plus a low sun glow. Follows the camera.
  const skyUniforms = {
    top: { value: new THREE.Color() },
    horizon: { value: new THREE.Color() },
    sunGlow: { value: new THREE.Color() },
    sunDir: { value: new THREE.Vector3() },
  }
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1000, 32, 16),
    new THREE.ShaderMaterial({
      uniforms: skyUniforms,
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    })
  )
  sky.renderOrder = -1
  scene.add(sky)

  // Lights: hemisphere fill and one warm sun whose shadow box follows the player.
  const hemi = new THREE.HemisphereLight()
  scene.add(hemi)
  const sun = new THREE.DirectionalLight()
  const sunOffset = new THREE.Vector3()
  sun.castShadow = true
  const shadowSize = lowPower ? 1024 : 2048
  const shadowExtent = lowPower ? 30 : 40
  sun.shadow.mapSize.set(shadowSize, shadowSize)
  Object.assign(sun.shadow.camera, {
    left: -shadowExtent,
    right: shadowExtent,
    top: shadowExtent,
    bottom: -shadowExtent,
    near: 5,
    far: 220,
  })
  sun.shadow.bias = -0.0008
  sun.shadow.normalBias = 0.04
  scene.add(sun, sun.target)

  // --- Ground: asphalt under the district, raised blocks on top. ---
  const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(98, 94).rotateX(-Math.PI / 2), kit.mat(colours.asphalt))
  asphalt.position.set(0, 0, -2)
  asphalt.receiveShadow = true
  scene.add(asphalt)
  pickables.push(asphalt)

  const ground = new BoxBatch()
  for (const b of blocks) {
    ground.rect(b.rect, -0.4, CURB, b.kind === "square" ? colours.plaza : colours.sidewalk)
  }
  // Square: grass beds at the corners and a medallion where the player starts.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) ground.rect([sx > 0 ? 6 : -11, sz > 0 ? 4.5 : -9, sx > 0 ? 11 : -6, sz > 0 ? 9 : -4.5], 0, CURB + 0.06, colours.grass)
  }
  ground.add([5, 0.04, 5], [0, CURB + 0.01, 4], "#cbb699", Math.PI / 4)
  // Basketball court and the parking lot paint.
  ground.rect(court, 0, CURB + 0.03, "#b8613f")
  ground.rect([court[0] + 0.6, court[1] + 0.6, court[2] - 0.6, court[3] - 0.6], 0, CURB + 0.04, "#c97250")
  ground.add([0.12, 0.02, court[3] - court[1] - 1.2], [(court[0] + court[2]) / 2, CURB + 0.05, (court[1] + court[3]) / 2], colours.laneWhite)
  ground.rect(parkingLot, 0, CURB + 0.01, "#6a6570")
  for (let x = parkingLot[0] + 2.75; x < parkingLot[2]; x += 5.5) {
    ground.add([0.15, 0.02, 5], [x, CURB + 0.02, parkingLot[1] + 3], colours.laneWhite)
  }
  // Boardwalk planks.
  ground.rect([-49, 45.6, 49, 50], 0, CURB + 0.02, "#a98463")
  for (let x = -48; x < 49; x += 1.2) ground.add([0.06, 0.02, 4.4], [x, CURB + 0.03, 47.8], "#8e6c50")
  // Seawall.
  ground.rect([-260, SHORE_Z - 0.2, 260, SHORE_Z + 0.6], -2, CURB, colours.concreteDark)
  const groundMesh = ground.build(vertexLambert, { cast: false, receive: true })!
  scene.add(groundMesh)
  pickables.push(groundMesh)

  // --- Road paint: dashed centre lines and crossings. ---
  const paint = new BoxBatch()
  const inRoads = (x: number, z: number) => roads.filter(({ rect: [a, b, c, d] }) => x > a && x < c && z > b && z < d).length
  for (const { rect, axis } of roads) {
    const [x0, z0, x1, z1] = rect
    const cx = (x0 + x1) / 2
    const cz = (z0 + z1) / 2
    const [from, to] = axis === "x" ? [x0, x1] : [z0, z1]
    for (let t = from + 1.5; t < to - 1; t += 4) {
      const [x, z] = axis === "x" ? [t, cz] : [cx, t]
      if (inRoads(x, z) > 1) continue
      paint.add(axis === "x" ? [2, 0.02, 0.22] : [0.22, 0.02, 2], [x, 0.012, z], colours.laneYellow)
    }
  }
  // Zebra crossings where the four streets meet the ring.
  const crossing = (cx: number, cz: number, alongX: boolean) => {
    for (let i = -3.6; i <= 3.6; i += 1.2) {
      paint.add(alongX ? [1.6, 0.02, 0.6] : [0.6, 0.02, 1.6], alongX ? [cx, 0.014, cz + i] : [cx + i, 0.014, cz], colours.laneWhite)
    }
  }
  crossing(0, -20.2, false)
  crossing(0, 20.2, false)
  crossing(22.2, 0, true)
  crossing(-22.2, 0, true)
  scene.add(paint.build(vertexLambert, { cast: false, receive: true })!)

  // --- Buildings: stucco bodies, parapets, awnings, rooftop units and windows. ---
  const bodies = new BoxBatch()
  const windows: THREE.BufferGeometry[] = []
  const pane = new THREE.BoxGeometry(1, 1, 1)
  const paneAt = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    windows.push(pane.clone().scale(w, h, d).translate(x, y, z))
  }
  const rand = random(41)
  for (const b of buildings) {
    const [x0, z0, x1, z1] = b.rect
    const w = x1 - x0
    const d = z1 - z0
    const cx = (x0 + x1) / 2
    const cz = (z0 + z1) / 2
    const base = CURB
    const stucco = colours.stucco[b.colour % colours.stucco.length]
    bodies.rect(b.rect, base, base + b.height, stucco)
    bodies.rect([x0 - 0.2, z0 - 0.2, x1 + 0.2, z1 + 0.2], base + b.height, base + b.height + 0.6, "#5a5260")
    bodies.add([w * 0.3, 1.2, d * 0.25], [cx + w * 0.15, base + b.height + 1.2, cz - d * 0.1], "#9a96a0")
    if (b.height > 9) bodies.add([1.6, 2, 1.6], [cx - w * 0.25, base + b.height + 1.6, cz + d * 0.15], "#7d6a5a")
    // Awning over the shopfront.
    const awningColour = ["#e2552b", "#2f6b70", "#d6a23a", "#8a5cd6"][Math.floor(rand() * 4)]
    if (b.front === "s" || b.front === "n") {
      const z = b.front === "s" ? z1 + 0.7 : z0 - 0.7
      bodies.add([w - 1, 0.2, 1.4], [cx, base + 3.1, z], awningColour)
      paneAt(w - 2.2, 2, 0.1, cx, base + 1.5, b.front === "s" ? z1 + 0.03 : z0 - 0.03)
    } else {
      const x = b.front === "e" ? x1 + 0.7 : x0 - 0.7
      bodies.add([1.4, 0.2, d - 1], [x, base + 3.1, cz], awningColour)
      paneAt(0.1, 2, d - 2.2, b.front === "e" ? x1 + 0.03 : x0 - 0.03, base + 1.5, cz)
    }
    // Upper-floor windows on all four sides (some dark).
    for (let y = base + 5; y < base + b.height - 1; y += 3) {
      for (let x = x0 + 1.5; x < x1 - 1; x += 2.4) {
        if (rand() > 0.3) paneAt(1.2, 1.5, 0.1, x, y, z1 + 0.03)
        if (rand() > 0.3) paneAt(1.2, 1.5, 0.1, x, y, z0 - 0.03)
      }
      for (let z = z0 + 1.5; z < z1 - 1; z += 2.4) {
        if (rand() > 0.3) paneAt(0.1, 1.5, 1.2, x1 + 0.03, y, z)
        if (rand() > 0.3) paneAt(0.1, 1.5, 1.2, x0 - 0.03, y, z)
      }
    }
  }
  // Jersey barriers closing the east and west edges, and the north edge under the overpass.
  for (let z = -51; z < 48; z += 3.1) {
    for (const x of [-52, 52]) bodies.add([0.8, 1.1, 3], [x, CURB + 0.55, z], (Math.round(z) & 1) === 0 ? "#cfc8bc" : "#c45a3a")
  }
  for (let x = -51; x < 52; x += 3.1) bodies.add([3, 1.1, 0.8], [x, CURB + 0.55, -52], (Math.round(x) & 1) === 0 ? "#cfc8bc" : "#c45a3a")
  // Boardwalk railing.
  for (let x = -48.5; x <= 48.5; x += 2.5) bodies.add([0.14, 1.1, 0.14], [x, CURB + 0.55, 49.4], "#e9e1d2")
  bodies.add([98, 0.12, 0.12], [0, CURB + 1.05, 49.4], "#e9e1d2")
  // Highway overpass to the north.
  const deckY = 8.5
  bodies.add([520, 1.4, 12], [0, deckY, -62], "#a49c92")
  bodies.add([520, 0.9, 0.4], [0, deckY + 1.1, -56.2], "#8f877d")
  for (let x = -96; x <= 96; x += 16) bodies.add([1.6, deckY, 2.4], [x, deckY / 2, -62], "#9a9288")
  // Distant skyline: towers beyond the edges, faded by the fog.
  const skyRand = random(77)
  const skyline: Array<[number, number]> = []
  for (let i = 0; i < 26; i++) skyline.push([-190 + i * 15 + skyRand() * 6, -85 - skyRand() * 60])
  for (let i = 0; i < 9; i++) {
    skyline.push([70 + skyRand() * 50, -60 + i * 13])
    skyline.push([-70 - skyRand() * 50, -60 + i * 13])
  }
  for (const [x, z] of skyline) {
    const w = 8 + skyRand() * 10
    const h = 18 + skyRand() * 46
    const tint = ["#8a7f96", "#9a8c86", "#7f8aa0", "#a08a90"][Math.floor(skyRand() * 4)]
    bodies.add([w, h, w * (0.8 + skyRand() * 0.4)], [x, h / 2, z], tint)
    for (let y = 6; y < h - 3; y += 4.5) {
      if (skyRand() > 0.45) paneAt(w * 0.6, 1.1, 0.2, x, y, z + w * 0.42)
    }
  }
  scene.add(bodies.build(vertexLambert, { cast: true, receive: true })!)
  const windowMesh = new THREE.Mesh(mergeGeometries(windows), kit.glow)
  windows.forEach((g) => g.dispose())
  pane.dispose()
  scene.add(windowMesh)

  // Overpass billboard.
  const board = new THREE.Group()
  board.add(box(kit, kit.mat(colours.charcoal), [0.4, 4, 0.4], [-6, deckY + 3, -56.8]))
  board.add(box(kit, kit.mat(colours.charcoal), [0.4, 4, 0.4], [6, deckY + 3, -56.8]))
  board.add(box(kit, kit.mat(colours.charcoal), [15, 5.4, 0.3], [0, deckY + 6.4, -56.9]))
  mergeStatic(board)
  const boardSign = new THREE.Mesh(
    new THREE.PlaneGeometry(14.4, 4.8),
    kit.sign({ text: site.name.toUpperCase(), sub: "BUILDS AI SYSTEMS · NOW EXPLORING", fg: "#fff4e2", bg: "#c2452f", aspect: 3 })
  )
  boardSign.position.set(0, deckY + 6.4, -56.73)
  board.add(boardSign)
  scene.add(board)

  // --- Water south of the boardwalk: a faceted plane with cheap CPU waves. ---
  const waterGeo = new THREE.PlaneGeometry(520, 160, lowPower ? 36 : 64, lowPower ? 10 : 18).rotateX(-Math.PI / 2)
  waterGeo.translate(0, -0.7, SHORE_Z + 80)
  const waterMat = new THREE.MeshPhongMaterial({ flatShading: true, shininess: 80, specular: 0x8a7060 })
  const water = new THREE.Mesh(waterGeo, waterMat)
  water.receiveShadow = true
  water.frustumCulled = false
  scene.add(water)
  const waterPos = waterGeo.attributes.position as THREE.BufferAttribute
  const waterBase = Float32Array.from(waterPos.array as Float32Array)

  // --- Palms: tapered leaning trunks and drooping fronds (instanced). ---
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.28, 1, 6).translate(0, 0.5, 0)
  const frondGeo = new THREE.BoxGeometry(0.7, 0.08, 2.6).translate(0, 0, 1.25)
  const trunks = new THREE.InstancedMesh(trunkGeo, kit.mat(colours.trunk), palms.length)
  const fronds = new THREE.InstancedMesh(frondGeo, new THREE.MeshLambertMaterial({ flatShading: true }), palms.length * 7)
  {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const e = new THREE.Euler()
    const v = new THREE.Vector3()
    const s = new THREE.Vector3()
    const c = new THREE.Color()
    const frondA = new THREE.Color(colours.frond)
    const frondB = new THREE.Color(colours.frondLight)
    palms.forEach((p, i) => {
      const h = 6.5 * p.scale
      const lean = 0.12
      const y = p.x > -12 && p.x < 12 && p.z > -10 && p.z < 10 ? CURB + 0.06 : CURB
      q.setFromEuler(e.set(Math.cos(p.rotation) * lean, 0, Math.sin(p.rotation) * lean))
      m.compose(v.set(p.x, y, p.z), q, s.set(p.scale, h, p.scale))
      trunks.setMatrixAt(i, m)
      const top = new THREE.Vector3(0, h, 0).applyQuaternion(q).add(v)
      for (let k = 0; k < 7; k++) {
        const yaw = p.rotation + (k / 7) * Math.PI * 2
        q.setFromEuler(e.set(0.35 + (k % 2) * 0.15, yaw, 0, "YXZ"))
        m.compose(top, q, s.set(p.scale, p.scale, p.scale))
        fronds.setMatrixAt(i * 7 + k, m)
        fronds.setColorAt(i * 7 + k, c.copy(frondA).lerp(frondB, (k % 3) / 2))
      }
    })
  }
  trunks.castShadow = fronds.castShadow = true
  trunks.receiveShadow = fronds.receiveShadow = true
  scene.add(trunks, fronds)

  // --- Street lights and basketball hoops, merged. ---
  const furniture = new THREE.Group()
  for (const l of lamps) {
    const lamp = lampPost(kit)
    lamp.position.set(l.x, CURB, l.z)
    lamp.rotation.y = l.rotation
    furniture.add(lamp)
  }
  for (const h of hoops) {
    const hoop = new THREE.Group()
    hoop.add(cyl(kit, kit.mat(colours.charcoal), 6, 0.1, 3.2, [0, 1.6, 0]))
    hoop.add(box(kit, kit.mat("#f4f1ea"), [1.8, 1.1, 0.1], [0, 3.3, 0.5]))
    hoop.add(cyl(kit, kit.neon(colours.sienna), 10, 0.3, 0.05, [0, 2.95, 0.85]))
    hoop.position.set(h.x, CURB, h.z)
    hoop.rotation.y = h.rotation
    furniture.add(hoop)
  }
  scene.add(mergeStatic(furniture))

  // --- Parked cars (fully merged: they never move). ---
  for (const c of parkedCars) {
    const parked = carModel(kit, c.colour).group
    parked.position.set(c.x, groundHeight(c.x, c.z), c.z)
    parked.rotation.y = c.heading
    scene.add(mergeStatic(parked))
  }

  // --- The six places. ---
  const animated: THREE.Object3D[] = []
  for (const lm of landmarks) {
    const model = buildModel(lm.model, kit)
    model.position.set(lm.position[0], CURB, lm.position[1])
    model.rotation.y = lm.facing
    model.userData.landmarkId = lm.id
    model.traverse((o) => {
      if (o.userData.spin || o.userData.blink || o.userData.clock) animated.push(o)
    })
    scene.add(model)
    pickables.push(model)
  }

  const sunDir = new THREE.Vector3()
  function applyTheme(theme: Theme) {
    const p = palettes[theme]
    const fog = scene.fog as THREE.Fog
    fog.color.set(p.horizon)
    fog.near = p.fogNear
    fog.far = p.fogFar
    skyUniforms.top.value.set(p.skyTop)
    skyUniforms.horizon.value.set(p.horizon)
    skyUniforms.sunGlow.value.set(p.sunGlow)
    sunDir.set(...p.sunDir).normalize()
    skyUniforms.sunDir.value.copy(sunDir)
    // The shadow light sits higher than the visible sun, so shadows stay readable.
    sunOffset.set(sunDir.x, 0.85, sunDir.z).normalize().multiplyScalar(90)
    hemi.color.set(p.hemiSky)
    hemi.groundColor.set(p.hemiGround)
    hemi.intensity = p.hemiIntensity
    sun.color.set(p.sunColor)
    sun.intensity = p.sunIntensity
    waterMat.color.set(p.water)
    renderer.setClearColor(p.horizon)
    kit.setTheme(p.glow, p.neon, p.signs)
    focus(focusPoint.x, focusPoint.z)
  }

  const focusPoint = new THREE.Vector3()
  function focus(x: number, z: number) {
    // Snap to whole texels so the shadows don't shimmer as the player moves.
    const texel = (shadowExtent * 2) / shadowSize
    focusPoint.set(Math.round(x / texel) * texel, 0, Math.round(z / texel) * texel)
    sun.target.position.copy(focusPoint)
    sun.position.copy(focusPoint).add(sunOffset)
    sun.target.updateMatrixWorld()
  }

  function update(_dt: number, time: number) {
    const arr = waterPos.array as Float32Array
    for (let i = 0; i < arr.length; i += 3) {
      const x = waterBase[i]
      const z = waterBase[i + 2]
      arr[i + 1] =
        -0.7 +
        Math.sin(x * 0.12 + time * 0.9) * 0.16 +
        Math.cos(z * 0.17 + time * 0.7) * 0.12 +
        Math.sin((x + z) * 0.3 + time * 1.3) * 0.05
    }
    waterPos.needsUpdate = true

    const now = new Date()
    for (const o of animated) {
      if (o.userData.spin) o.rotation.y += o.userData.spin * _dt
      if (o.userData.blink) o.visible = time % o.userData.blink < o.userData.blink * 0.35
      if (o.userData.clock) {
        // Real local time on the clock tower: [minute hand, hour hand].
        const [minute, hour] = o.children
        minute.rotation.z = -((now.getMinutes() + now.getSeconds() / 60) / 60) * Math.PI * 2
        hour.rotation.z = -(((now.getHours() % 12) + now.getMinutes() / 60) / 12) * Math.PI * 2
      }
    }
  }

  function resize(width: number, height: number) {
    renderer.setSize(width, height, false)
    camera.aspect = width / Math.max(1, height)
    // Widen the vertical field of view on portrait screens (phones).
    camera.fov = camera.aspect < 1 ? Math.min(68, 50 / Math.sqrt(camera.aspect)) : 50
    camera.updateProjectionMatrix()
  }

  function render() {
    sky.position.copy(camera.position)
    renderer.render(scene, camera)
  }

  function dispose() {
    const geometries = new Set<THREE.BufferGeometry>()
    const materials = new Set<THREE.Material>()
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.geometry) geometries.add(mesh.geometry)
      if (mesh.material) {
        for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(m)
      }
    })
    geometries.forEach((g) => g.dispose())
    materials.forEach((m) => m.dispose())
    kit.dispose()
    sun.shadow.map?.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
  }

  applyTheme("dark")
  return { renderer, scene, camera, kit, pickables, applyTheme, focus, update, resize, render, dispose }
}
