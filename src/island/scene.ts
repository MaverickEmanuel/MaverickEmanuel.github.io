/**
 * Renderer, camera, lights, sky, water, terrain, scenery and landmark models.
 * Everything is built procedurally from primitives. The theme only swaps
 * colours and intensities on objects that already exist (applyTheme).
 */
import * as THREE from "three"
import { Ambient } from "./ambient"
import { landmarks, standPoint } from "./landmarks"
import { bakeStatic, buildModel, dock, Kit, lampPost, signpost } from "./models"
import { colours, palettes, type Theme } from "./palette"
import {
  BASE_Y,
  DOCK,
  GRASS_RADIUS,
  SAND_RADIUS,
  SAND_Y,
  SIGNPOST,
  dockPoint,
  groundHeight,
  paths,
  random,
  rocks,
  trees,
} from "./world"

export interface IslandScene {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  kit: Kit
  /** Objects a click/tap can land on. Landmark groups carry userData.landmarkId. */
  pickables: THREE.Object3D[]
  applyTheme(theme: Theme): void
  /** The landmark the player is standing at (arrival ring, doors, lights), or null. */
  setNear(id: string | null): void
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
    vec3 col = mix(horizon, top, pow(smoothstep(0.0, 0.85, h), 0.55));
    float s = max(dot(d, normalize(sunDir)), 0.0);
    col += sunGlow * (smoothstep(0.9985, 0.9992, s) * 0.9 + pow(s, 14.0) * 0.45 + pow(s, 3.0) * 0.08);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`

export function createScene(canvas: HTMLCanvasElement, opts: { lowPower: boolean }): IslandScene {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: dpr < 2,
    powerPreference: "high-performance",
  })
  const gl = renderer.getContext()
  if (!gl || gl.isContextLost()) throw new Error("WebGL context unavailable")
  renderer.setPixelRatio(dpr)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap

  const scene = new THREE.Scene()
  scene.fog = new THREE.Fog(0x000000, 40, 140)
  const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 1200)
  const kit = new Kit()
  const pickables: THREE.Object3D[] = []

  // Sky dome: vertical gradient plus a low sun glow. Follows the camera.
  const skyUniforms = {
    top: { value: new THREE.Color() },
    horizon: { value: new THREE.Color() },
    sunGlow: { value: new THREE.Color() },
    sunDir: { value: new THREE.Vector3() },
  }
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(900, 32, 16),
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

  // Lights: hemisphere fill, one warm shadow-casting sun, the campfire.
  const hemi = new THREE.HemisphereLight()
  scene.add(hemi)
  const sun = new THREE.DirectionalLight()
  sun.position.set(-0.68, 0.6, 0.42).multiplyScalar(60)
  sun.castShadow = true
  const shadowSize = opts.lowPower ? 1024 : 2048
  sun.shadow.mapSize.set(shadowSize, shadowSize)
  Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 10, far: 140 })
  sun.shadow.bias = -0.0006
  sun.shadow.normalBias = 0.03
  scene.add(sun, sun.target)

  // Water: a faceted plane with cheap CPU waves (flat shading does the glints).
  const waterGeo = new THREE.PlaneGeometry(300, 300, 50, 50)
  waterGeo.rotateX(-Math.PI / 2)
  const waterMat = new THREE.MeshPhongMaterial({ flatShading: true, shininess: 70, specular: 0x6a5a48 })
  const water = new THREE.Mesh(waterGeo, waterMat)
  water.receiveShadow = true
  water.frustumCulled = false
  scene.add(water)
  const waterPos = waterGeo.attributes.position as THREE.BufferAttribute
  const waterBase = Float32Array.from(waterPos.array as Float32Array)
  // Calmer water near the shore, so the foam line sits on it.
  const waterCalm = new Float32Array(waterPos.count)
  for (let i = 0; i < waterPos.count; i++) {
    const r = Math.hypot(waterBase[i * 3], waterBase[i * 3 + 2])
    const t = Math.min(1, Math.max(0, (r - 30) / 14))
    waterCalm[i] = 0.15 + 0.85 * t * t * (3 - 2 * t)
  }

  // Sand beach under the grass.
  const sand = new THREE.Mesh(
    new THREE.CylinderGeometry(SAND_RADIUS, SAND_RADIUS + 4, 2.4, 44),
    kit.mat(colours.sand)
  )
  sand.position.y = 0.3 - 1.2
  sand.receiveShadow = true
  scene.add(sand)
  pickables.push(sand)

  // Grass bank (open cylinder) between beach and grass top.
  const bankHeight = BASE_Y - SAND_Y + 0.02
  const bank = new THREE.Mesh(
    new THREE.CylinderGeometry(GRASS_RADIUS - 0.02, GRASS_RADIUS + 0.9, bankHeight, 44, 1, true),
    kit.mat(colours.grassDark)
  )
  bank.position.y = BASE_Y - bankHeight / 2
  bank.receiveShadow = true
  scene.add(bank)

  const terrain = new THREE.Mesh(buildTerrain(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }))
  terrain.receiveShadow = true
  scene.add(terrain)
  pickables.push(terrain)

  // Spawn plaza and stepping-stone paths.
  const plaza = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.4, 0.2, 12), kit.mat(colours.stone))
  plaza.position.y = BASE_Y
  plaza.receiveShadow = true
  scene.add(plaza)
  pickables.push(plaza)
  scene.add(buildPaths(kit))

  scene.add(...buildTrees(kit), buildRocks(kit))

  // Light pools at dusk: under lamps, at each landmark's door, the fire and the dock lantern.
  const pools: Array<[number, number, number, string]> = []

  // Lamp posts beside each path (merged into one set of meshes).
  const lamps = new THREE.Group()
  for (const p of paths) {
    const [x1, z1] = p.to
    const len = Math.hypot(x1, z1)
    const t = 0.55
    const x = x1 * t + (z1 / len) * 1.4
    const z = z1 * t - (x1 / len) * 1.4
    const lamp = lampPost(kit)
    lamp.position.set(x, groundHeight(x, z), z)
    lamps.add(lamp)
    pools.push([x, z, 2.2, "#ffb066"])
  }

  bakeStatic(lamps)
  scene.add(lamps)

  // Signpost on the plaza: an arrow per landmark, in its accent colour.
  const post = signpost(
    kit,
    landmarks.map((lm) => [Math.atan2(lm.position[0] - SIGNPOST[0], lm.position[1] - SIGNPOST[1]), lm.accent] as [number, string])
  )
  post.position.set(SIGNPOST[0], BASE_Y + 0.1, SIGNPOST[1])
  bakeStatic(post)
  scene.add(post)

  // The dock, off the south-east beach.
  const jetty = dock(kit, DOCK.end - DOCK.start, DOCK.halfWidth, DOCK.deckY, DOCK.ramp)
  const [jx, jz] = dockPoint(DOCK.start, 0)
  jetty.position.set(jx, 0, jz)
  jetty.rotation.y = DOCK.angle
  bakeStatic(jetty)
  scene.add(jetty)
  pickables.push(jetty)
  const [lx, lz] = dockPoint(DOCK.end - 0.15, DOCK.halfWidth - 0.1)
  pools.push([lx, lz, 2.4, "#ffb066"])

  // Landmarks.
  const arrivals = new Map<string, { fn: (t: number) => void; t: number }>()
  const spinners: THREE.Object3D[] = []
  const flames: THREE.Object3D[] = []
  let fireLight: THREE.PointLight | null = null
  for (const lm of landmarks) {
    const model = buildModel(lm.model, kit)
    model.position.set(lm.position[0], BASE_Y, lm.position[1])
    model.rotation.y = lm.facing
    model.userData.landmarkId = lm.id
    model.traverse((o) => {
      if (o.userData.spin || o.userData.spinX) spinners.push(o)
      if (o.userData.flame) flames.push(o)
    })
    if (lm.model === "campfire") {
      fireLight = new THREE.PointLight(colours.fire, 20, 16, 1.6)
      fireLight.position.set(lm.position[0], BASE_Y + 1.3, lm.position[1])
      scene.add(fireLight)
      pools.push([lm.position[0], lm.position[1], 4.5, "#ff9a4a"])
    } else {
      const [px, pz] = standPoint(lm, 0.4)
      pools.push([px, pz, 2, "#ffc27a"])
    }
    if (model.userData.arrive) arrivals.set(lm.id, { fn: model.userData.arrive, t: 0 })
    bakeStatic(model)
    scene.add(model)
    pickables.push(model)
  }

  // Arrival ring: one ring, moved to whichever landmark the player is at.
  const ringMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 48), ringMat)
  ring.rotation.x = -Math.PI / 2
  ring.renderOrder = 3
  ring.visible = false
  scene.add(ring)
  const ringGlow = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }))
  ringGlow.rotation.x = -Math.PI / 2
  ringGlow.renderOrder = 3
  ringGlow.visible = false
  scene.add(ringGlow)
  let nearId: string | null = null
  let ringFade = 0

  const fire = landmarks.find((l) => l.model === "campfire")!
  const ambient = new Ambient(kit, {
    lowPower: opts.lowPower,
    fire: [fire.position[0], BASE_Y, fire.position[1]],
    pools,
  })
  scene.add(ambient.group)

  let fireBase = 20

  function setNear(id: string | null) {
    if (id === nearId) return
    nearId = id
    const lm = landmarks.find((l) => l.id === id)
    if (!lm) return
    ringMat.color.set(lm.accent)
    ;(ringGlow.material as THREE.MeshBasicMaterial).color.set(lm.accent)
    const r = lm.collider + 0.9
    for (const m of [ring, ringGlow]) {
      m.position.set(lm.position[0], BASE_Y + 0.05, lm.position[1])
      m.scale.setScalar(r)
    }
  }

  function applyTheme(theme: Theme) {
    const p = palettes[theme]
    const fog = scene.fog as THREE.Fog
    fog.color.set(p.horizon)
    fog.near = p.fogNear
    fog.far = p.fogFar
    skyUniforms.top.value.set(p.skyTop)
    skyUniforms.horizon.value.set(p.horizon)
    skyUniforms.sunGlow.value.set(p.sunGlow)
    skyUniforms.sunDir.value.set(...p.sunDir).normalize()
    hemi.color.set(p.hemiSky)
    hemi.groundColor.set(p.hemiGround)
    hemi.intensity = p.hemiIntensity
    sun.color.set(p.sunColor)
    sun.intensity = p.sunIntensity
    waterMat.color.set(p.water)
    renderer.setClearColor(p.horizon)
    kit.setGlow(p.glow)
    fireBase = p.fireLight
    ambient.applyTheme(theme)
  }

  function update(dt: number, time: number) {
    const arr = waterPos.array as Float32Array
    for (let i = 0; i < arr.length; i += 3) {
      const x = waterBase[i]
      const z = waterBase[i + 2]
      arr[i + 1] =
        (Math.sin(x * 0.16 + time * 0.9) * 0.11 +
          Math.cos(z * 0.19 + time * 0.7) * 0.09 +
          Math.sin((x + z) * 0.33 + time * 1.4) * 0.04) *
        waterCalm[i / 3]
    }
    waterPos.needsUpdate = true

    // Arrival: ease each landmark's animation toward "here" or "away".
    for (const [id, a] of arrivals) {
      const goal = id === nearId ? 1 : 0
      if (a.t === goal) continue
      a.t += (goal - a.t) * Math.min(1, dt * 5)
      if (Math.abs(goal - a.t) < 0.002) a.t = goal
      a.fn(a.t)
    }
    ringFade += ((nearId ? 1 : 0) - ringFade) * Math.min(1, dt * 6)
    const pulse = 0.5 + 0.5 * Math.sin(time * 3.2)
    ringMat.opacity = ringFade * (0.55 + 0.3 * pulse)
    ;(ringGlow.material as THREE.MeshBasicMaterial).opacity = ringFade * 0.14
    ring.visible = ringGlow.visible = ringFade > 0.01
    if (nearId) {
      const base = (landmarks.find((l) => l.id === nearId)!.collider + 0.9)
      ring.scale.setScalar(base * (1 + pulse * 0.04))
    }
    ambient.setFireBoost(arrivals.get("campfire")?.t ?? 0)
    ambient.update(time)

    for (const o of spinners) {
      if (o.userData.spin) o.rotation.y += o.userData.spin * dt
      if (o.userData.spinX) o.rotation.x += o.userData.spinX * dt
    }
    const flicker = 1 + Math.sin(time * 13) * 0.06 + Math.sin(time * 7.3 + 1) * 0.05
    for (const f of flames) {
      const b = f.userData.boost ?? 0
      f.scale.set(1 + 0.35 * b, (flicker + 0.05) * (1 + 0.45 * b), 1 + 0.35 * b)
    }
    const fireBoost = arrivals.get("campfire")?.t ?? 0
    if (fireLight) fireLight.intensity = fireBase * (0.9 + (flicker - 1) * 1.5) * (1 + fireBoost * 0.6)
  }

  function resize(width: number, height: number) {
    renderer.setSize(width, height, false)
    camera.aspect = width / Math.max(1, height)
    // Widen the vertical field of view on portrait screens (phones).
    camera.fov = camera.aspect < 1 ? Math.min(58, 40 / Math.sqrt(camera.aspect)) : 40
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
    ambient.dispose()
    sun.shadow.map?.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
  }

  applyTheme("dark")
  return { renderer, scene, camera, kit, pickables, applyTheme, setNear, update, resize, render, dispose }
}

/** Grass top: a jittered grid sampled from groundHeight, clipped to a circle, one colour per face. */
function buildTerrain(): THREE.BufferGeometry {
  const size = GRASS_RADIUS * 2 + 2
  const plane = new THREE.PlaneGeometry(size, size, 36, 36)
  plane.rotateX(-Math.PI / 2)
  const pos = plane.attributes.position as THREE.BufferAttribute
  const rand = random(3)
  const outside: boolean[] = []
  const step = size / 36
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i)
    let z = pos.getZ(i)
    const r0 = Math.hypot(x, z)
    outside.push(r0 > GRASS_RADIUS)
    if (r0 < GRASS_RADIUS - step) {
      x += (rand() - 0.5) * step * 0.6
      z += (rand() - 0.5) * step * 0.6
    }
    const r = Math.hypot(x, z)
    if (r > GRASS_RADIUS - 0.08) {
      x *= (GRASS_RADIUS - 0.08) / r
      z *= (GRASS_RADIUS - 0.08) / r
    }
    pos.setXYZ(i, x, groundHeight(x, z), z)
  }
  const index = plane.index!
  const kept: number[] = []
  const colourList: number[] = []
  const tint = new THREE.Color()
  const shades = [colours.grass, colours.grassDark, colours.grassLight]
  const crand = random(11)
  for (let t = 0; t < index.count; t += 3) {
    const a = index.getX(t)
    const b = index.getX(t + 1)
    const c = index.getX(t + 2)
    const out = [a, b, c].filter((v) => outside[v]).length
    if (out === 3) continue
    for (const v of [a, b, c]) kept.push(pos.getX(v), pos.getY(v), pos.getZ(v))
    const roll = crand()
    tint.set(out > 0 ? colours.grass : shades[roll < 0.55 ? 0 : roll < 0.8 ? 1 : 2])
    for (let k = 0; k < 3; k++) colourList.push(tint.r, tint.g, tint.b)
  }
  plane.dispose()
  const geo = new THREE.BufferGeometry()
  geo.setAttribute("position", new THREE.Float32BufferAttribute(kept, 3))
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colourList, 3))
  geo.computeVertexNormals()
  return geo
}

function buildPaths(kit: Kit): THREE.InstancedMesh {
  const spots: Array<[number, number, number]> = []
  const rand = random(23)
  for (const p of paths) {
    const [x1, z1] = p.to
    const len = Math.hypot(x1, z1)
    for (let d = 3.9; d < len; d += 1.25) {
      const t = d / len
      const x = x1 * t + (rand() - 0.5) * 0.35
      const z = z1 * t + (rand() - 0.5) * 0.35
      spots.push([x, z, rand() * Math.PI])
    }
  }
  const mesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.5, 0.55, 0.14, 6),
    kit.mat(colours.path),
    spots.length
  )
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 1, 0)
  spots.forEach(([x, z, rot], i) => {
    m.compose(new THREE.Vector3(x, groundHeight(x, z) + 0.01, z), q.setFromAxisAngle(up, rot), new THREE.Vector3(1, 1, 1))
    mesh.setMatrixAt(i, m)
  })
  mesh.receiveShadow = true
  return mesh
}

function buildTrees(kit: Kit): THREE.Object3D[] {
  const pines = trees.filter((t) => t.kind === 0)
  const rounds = trees.filter((t) => t.kind === 1)
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.24, 1, 5), kit.mat(colours.trunk), trees.length)
  const pineLow = new THREE.InstancedMesh(new THREE.ConeGeometry(1.25, 2.2, 6), new THREE.MeshLambertMaterial({ flatShading: true }), pines.length)
  const pineHigh = new THREE.InstancedMesh(new THREE.ConeGeometry(0.9, 1.7, 6), new THREE.MeshLambertMaterial({ flatShading: true }), pines.length)
  const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.25, 0), new THREE.MeshLambertMaterial({ flatShading: true }), rounds.length)
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  const v = new THREE.Vector3()
  const s = new THREE.Vector3()
  const leaf = new THREE.Color(colours.leaf)
  const leafLight = new THREE.Color(colours.leafLight)
  const c = new THREE.Color()
  trees.forEach((t, i) => {
    const y = groundHeight(t.x, t.z)
    const trunkH = t.kind === 0 ? 1.2 : 1.6
    m.compose(v.set(t.x, y + (trunkH * t.scale) / 2, t.z), q.identity(), s.set(t.scale, trunkH * t.scale, t.scale))
    trunk.setMatrixAt(i, m)
  })
  pines.forEach((t, i) => {
    const y = groundHeight(t.x, t.z)
    q.setFromEuler(e.set(0, t.rotation, 0))
    m.compose(v.set(t.x, y + 2 * t.scale, t.z), q, s.set(t.scale, t.scale, t.scale))
    pineLow.setMatrixAt(i, m)
    m.compose(v.set(t.x, y + 3.3 * t.scale, t.z), q, s)
    pineHigh.setMatrixAt(i, m)
    c.copy(leaf).lerp(leafLight, (t.rotation / (Math.PI * 2)) * 0.6)
    pineLow.setColorAt(i, c)
    pineHigh.setColorAt(i, c)
  })
  rounds.forEach((t, i) => {
    const y = groundHeight(t.x, t.z)
    q.setFromEuler(e.set(t.rotation, t.rotation * 2, 0))
    m.compose(v.set(t.x, y + 2.4 * t.scale, t.z), q, s.set(t.scale, t.scale * 0.95, t.scale))
    crown.setMatrixAt(i, m)
    c.copy(leafLight).lerp(new THREE.Color(colours.grassLight), (t.rotation / (Math.PI * 2)) * 0.5)
    crown.setColorAt(i, c)
  })
  const all = [trunk, pineLow, pineHigh, crown]
  for (const mesh of all) {
    mesh.castShadow = true
    mesh.receiveShadow = true
  }
  return all
}

function buildRocks(kit: Kit): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.8, 0), kit.mat(colours.rock), rocks.length)
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  rocks.forEach((r, i) => {
    const y = Math.hypot(r.x, r.z) > GRASS_RADIUS ? 0.25 : groundHeight(r.x, r.z)
    q.setFromEuler(e.set(r.rotation, r.rotation * 1.7, 0))
    const sx = r.scale * (r.kind === 2 ? 1.5 : 1)
    m.compose(new THREE.Vector3(r.x, y + 0.1, r.z), q, new THREE.Vector3(sx, r.scale * 0.7, r.scale))
    mesh.setMatrixAt(i, m)
  })
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}
