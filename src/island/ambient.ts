/**
 * Ambient life, all cheap: shoreline foam (one shader ring), campfire smoke
 * and sparks, a few gulls, butterflies by day and fireflies at dusk around
 * the flower patches, soft light pools under the lamps at dusk, a rowboat at
 * the dock and a sailboat on the horizon. Everything is instanced; the whole
 * module adds about a dozen draw calls. lowPower trims the particle counts.
 */
import * as THREE from "three"
import { dockPoint, DOCK, flowers, groundHeight, random, SAND_Y } from "./world"
import { bakeStatic, rowboat, sailboat, type Kit } from "./models"
import type { Theme } from "./palette"
import { colours } from "./palette"

export interface AmbientOptions {
  lowPower: boolean
  /** Campfire position on the ground [x, y, z]. */
  fire: [number, number, number]
  /** Ground spots that get a light pool at dusk: [x, z, radius, colour]. */
  pools: Array<[number, number, number, string]>
}

const FOAM_VERTEX = /* glsl */ `
  #include <fog_pars_vertex>
  varying vec2 vPos;
  void main() {
    vPos = position.xz;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`
const FOAM_FRAGMENT = /* glsl */ `
  #include <fog_pars_fragment>
  uniform float time;
  uniform float strength;
  uniform vec3 color;
  varying vec2 vPos;
  void main() {
    float r = length(vPos);
    float a = atan(vPos.y, vPos.x);
    // A steady lace line at the waterline, plus a surge that rolls out and fades.
    float r1 = 28.15 + 0.18 * sin(a * 9.0 + time * 0.7) + 0.08 * sin(a * 23.0 - time);
    float lace = 1.0 - smoothstep(0.0, 0.28, abs(r - r1));
    float p = fract(time * 0.11);
    float r2 = 28.3 + p * 1.6 + 0.15 * sin(a * 13.0 + time * 0.4);
    float surge = (1.0 - p) * (1.0 - smoothstep(0.0, 0.2, abs(r - r2)));
    float breakup = 0.55 + 0.45 * sin(a * 31.0 + time * 0.5) * sin(a * 7.0 - time * 0.3);
    float alpha = (lace * 0.85 + surge * 0.6) * breakup * strength;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(color, alpha);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`

function poolTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas")
  c.width = c.height = 64
  const g = c.getContext("2d")!
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, "rgba(255,255,255,1)")
  grad.addColorStop(0.45, "rgba(255,255,255,0.45)")
  grad.addColorStop(1, "rgba(255,255,255,0)")
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

const m4 = new THREE.Matrix4()
const q = new THREE.Quaternion()
const e = new THREE.Euler()
const v = new THREE.Vector3()
const s = new THREE.Vector3()
const gullBody = new THREE.Matrix4().makeTranslation(0, -0.02, -0.05)

export class Ambient {
  readonly group = new THREE.Group()
  private foamUniforms: { time: { value: number }; strength: { value: number }; color: { value: THREE.Color } }
  private smoke: THREE.InstancedMesh
  private sparks: THREE.InstancedMesh
  private wings: THREE.InstancedMesh
  private gullBodies: THREE.InstancedMesh
  private butterflies: THREE.InstancedMesh
  private fireflies: THREE.InstancedMesh
  private flutterSpots: Array<{ x: number; y: number; z: number; seed: number }> = []
  private pools: THREE.InstancedMesh
  private poolMat: THREE.MeshBasicMaterial
  private rowboat: THREE.Group
  private sailboat: THREE.Group
  private theme: Theme = "dark"
  private fireBoost = 0
  private textures: THREE.Texture[] = []

  constructor(kit: Kit, private opts: AmbientOptions) {
    const low = opts.lowPower

    // Shoreline foam.
    this.foamUniforms = {
      time: { value: 0 },
      strength: { value: 1 },
      color: { value: new THREE.Color("#fffaf0") },
    }
    const foamGeo = new THREE.RingGeometry(27.6, 30.4, low ? 72 : 120, 1)
    foamGeo.rotateX(-Math.PI / 2)
    const foam = new THREE.Mesh(
      foamGeo,
      new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, this.foamUniforms]),
        vertexShader: FOAM_VERTEX,
        fragmentShader: FOAM_FRAGMENT,
        transparent: true,
        depthWrite: false,
        fog: true,
      })
    )
    // UniformsUtils.merge clones the values: point at the material's copies.
    this.foamUniforms = (foam.material as THREE.ShaderMaterial).uniforms as typeof this.foamUniforms
    foam.position.y = 0.05
    foam.renderOrder = 1
    this.group.add(foam)

    // Campfire smoke (soft grey puffs) and sparks (tiny embers).
    const smokeCount = low ? 5 : 8
    this.smoke = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.32, 0),
      new THREE.MeshLambertMaterial({ color: "#b9b0a6", transparent: true, opacity: 0.32, depthWrite: false, flatShading: true }),
      smokeCount
    )
    this.smoke.frustumCulled = false
    this.sparks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), kit.fireCore, low ? 6 : 12)
    this.sparks.frustumCulled = false
    this.group.add(this.smoke, this.sparks)

    // Gulls: two wings per bird (one wing geometry, mirrored), one draw call.
    const wingGeo = new THREE.BufferGeometry()
    wingGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([0, 0, 0.18, 0, 0, -0.22, 1.1, 0.05, -0.32, 0, 0, 0.18, 1.1, 0.05, -0.32, 0.55, 0.02, 0.05], 3)
    )
    wingGeo.computeVertexNormals()
    this.wings = new THREE.InstancedMesh(
      wingGeo,
      new THREE.MeshLambertMaterial({ color: "#f4efe6", side: THREE.DoubleSide, flatShading: true }),
      3 * 2
    )
    this.wings.frustumCulled = false
    this.gullBodies = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.22, 0.2, 0.75),
      new THREE.MeshLambertMaterial({ color: "#f4efe6", flatShading: true }),
      3
    )
    this.gullBodies.frustumCulled = false
    this.group.add(this.wings, this.gullBodies)

    // Flowers in small patches, then the fluttering things above them.
    const petals = ["#e9c46a", "#f2e8d8", "#d9825b"]
    const flowerGeo = new THREE.OctahedronGeometry(0.13, 0)
    const flowerMesh = new THREE.InstancedMesh(flowerGeo, kit.mat("#ffffff"), flowers.length * 3)
    const stemMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.03, 1, 0.03), kit.mat(colours.leaf), flowers.length * 3)
    const rand = random(41)
    const c = new THREE.Color()
    flowers.forEach((f, i) => {
      for (let k = 0; k < 3; k++) {
        const x = f.x + (rand() - 0.5) * 0.9
        const z = f.z + (rand() - 0.5) * 0.9
        const h = 0.22 + rand() * 0.16
        const y = groundHeight(x, z)
        m4.compose(v.set(x, y + h, z), q.setFromEuler(e.set(0, rand() * 3, 0)), s.set(1, 0.7, 1))
        flowerMesh.setMatrixAt(i * 3 + k, m4)
        flowerMesh.setColorAt(i * 3 + k, c.set(petals[(f.kind + k) % 3]))
        m4.compose(v.set(x, y + h / 2, z), q.identity(), s.set(1, h, 1))
        stemMesh.setMatrixAt(i * 3 + k, m4)
      }
      if (i % 2 === 0) this.flutterSpots.push({ x: f.x, y: groundHeight(f.x, f.z), z: f.z, seed: rand() * 10 })
    })
    this.group.add(flowerMesh, stemMesh)
    if (low) this.flutterSpots.length = Math.min(this.flutterSpots.length, 5)

    const butterflyGeo = new THREE.BufferGeometry()
    butterflyGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([0, 0, 0.1, 0.22, 0.02, 0.16, 0.2, 0, -0.12, 0, 0, 0.1, -0.22, 0.02, 0.16, -0.2, 0, -0.12], 3)
    )
    butterflyGeo.computeVertexNormals()
    this.butterflies = new THREE.InstancedMesh(
      butterflyGeo,
      new THREE.MeshBasicMaterial({ color: "#ffffff", side: THREE.DoubleSide }),
      this.flutterSpots.length
    )
    const wingColours = ["#f0b35a", "#f6efe2", "#e3874f"]
    this.flutterSpots.forEach((_, i) => this.butterflies.setColorAt(i, c.set(wingColours[i % 3])))
    this.butterflies.frustumCulled = false
    this.fireflies = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(0.06, 0),
      new THREE.MeshBasicMaterial({ color: "#ffe08a", fog: false }),
      this.flutterSpots.length * 2
    )
    this.fireflies.frustumCulled = false
    this.group.add(this.butterflies, this.fireflies)

    // Light pools under lamps, doors and the fire, shown at dusk.
    const tex = poolTexture()
    this.textures.push(tex)
    this.poolMat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.5,
    })
    const poolGeo = new THREE.PlaneGeometry(1, 1)
    poolGeo.rotateX(-Math.PI / 2)
    this.pools = new THREE.InstancedMesh(poolGeo, this.poolMat, opts.pools.length)
    opts.pools.forEach(([x, z, r, colour], i) => {
      m4.compose(v.set(x, groundHeight(x, z) + 0.04, z), q.identity(), s.set(r * 2, 1, r * 2))
      this.pools.setMatrixAt(i, m4)
      this.pools.setColorAt(i, c.set(colour))
    })
    this.pools.renderOrder = 2
    this.group.add(this.pools)

    // Boats.
    this.rowboat = rowboat(kit)
    const [bx, bz] = dockPoint(DOCK.end - 3, DOCK.halfWidth + 1.3)
    this.rowboat.position.set(bx, 0, bz)
    this.rowboat.rotation.y = DOCK.angle + 0.08
    bakeStatic(this.rowboat)
    this.sailboat = sailboat(kit)
    bakeStatic(this.sailboat)
    this.group.add(this.rowboat, this.sailboat)
  }

  applyTheme(theme: Theme) {
    this.theme = theme
    const dusk = theme === "dark"
    this.poolMat.opacity = dusk ? 0.42 : 0
    this.pools.visible = dusk
    this.butterflies.visible = !dusk
    this.fireflies.visible = dusk
    this.foamUniforms.strength.value = dusk ? 0.7 : 0.95
    this.foamUniforms.color.value.set(dusk ? "#f3dcc8" : "#fffaf0")
  }

  /** 0..1: the player is at the campfire (more sparks). */
  setFireBoost(t: number) {
    this.fireBoost = t
  }

  update(time: number) {
    this.foamUniforms.time.value = time
    const [fx, fy, fz] = this.opts.fire

    // Smoke: each puff rises over 4 s, growing, then shrinks away.
    for (let i = 0; i < this.smoke.count; i++) {
      const life = (time / 4 + i / this.smoke.count) % 1
      const size = Math.sin(life * Math.PI) * (0.7 + life * 1.3)
      m4.compose(
        v.set(fx + Math.sin(time * 0.6 + i) * 0.25 + life * 0.9, fy + 1.2 + life * 4.2, fz + Math.cos(time * 0.5 + i * 2) * 0.25 - life * 0.4),
        q.setFromEuler(e.set(i, time * 0.3 + i, 0)),
        s.setScalar(Math.max(0.001, size))
      )
      this.smoke.setMatrixAt(i, m4)
    }
    this.smoke.instanceMatrix.needsUpdate = true

    // Sparks: quick embers, more of them while the player is at the fire.
    const active = Math.round(this.sparks.count * (0.5 + 0.5 * this.fireBoost))
    for (let i = 0; i < this.sparks.count; i++) {
      const period = 1.3 + (i % 4) * 0.25
      const life = (time / period + i * 0.37) % 1
      const on = i < active ? Math.max(0, 1 - life) : 0
      const a = i * 2.4 + Math.floor(time / period + i * 0.37) * 1.7
      m4.compose(
        v.set(fx + Math.sin(a) * 0.35 * (0.3 + life), fy + 0.6 + life * 2.6, fz + Math.cos(a) * 0.35 * (0.3 + life)),
        q.setFromEuler(e.set(time * 3 + i, i, 0)),
        s.setScalar(Math.max(0.001, on * (0.8 + Math.sin(time * 20 + i) * 0.3)))
      )
      this.sparks.setMatrixAt(i, m4)
    }
    this.sparks.instanceMatrix.needsUpdate = true

    // Gulls: wide slow circles over the water around the island (well below
    // the camera), flapping then gliding.
    const bird = new THREE.Matrix4()
    const wing = new THREE.Matrix4()
    for (let b = 0; b < 3; b++) {
      const speed = 0.07 + b * 0.015
      const angle = time * speed * (b === 1 ? -1 : 1) + b * 2.1
      const radius = 33 + b * 5
      const x = Math.sin(angle) * radius
      const z = Math.cos(angle) * radius
      const y = 7 + b * 1.4 + Math.sin(time * 0.4 + b) * 0.6
      const heading = angle + (b === 1 ? -Math.PI / 2 : Math.PI / 2)
      const bank = (b === 1 ? 1 : -1) * 0.25
      bird.compose(v.set(x, y, z), q.setFromEuler(e.set(0, heading, bank, "YXZ")), s.setScalar(0.9))
      this.gullBodies.setMatrixAt(b, m4.multiplyMatrices(bird, gullBody))
      const cycle = (time * 0.35 + b * 0.3) % 1
      const flap = cycle < 0.55 ? Math.sin(time * 7 + b) * 0.55 : 0.12
      for (const side of [0, 1]) {
        wing.compose(v.set(0, 0, 0), q.setFromEuler(e.set(0, 0, side ? -flap : flap)), s.set(side ? -1 : 1, 1, 1))
        this.wings.setMatrixAt(b * 2 + side, m4.multiplyMatrices(bird, wing))
      }
    }
    this.wings.instanceMatrix.needsUpdate = true
    this.gullBodies.instanceMatrix.needsUpdate = true

    // Butterflies (day) or fireflies (dusk) around the flower patches.
    const dusk = this.theme === "dark"
    this.flutterSpots.forEach((spot, i) => {
      const t = time + spot.seed
      if (!dusk) {
        const x = spot.x + Math.sin(t * 0.7) * 1.1 + Math.sin(t * 1.9) * 0.3
        const z = spot.z + Math.cos(t * 0.55) * 1.1
        const y = spot.y + 0.7 + Math.sin(t * 2.3) * 0.25
        const flap = 0.25 + Math.abs(Math.sin(t * 14)) * 0.95
        m4.compose(v.set(x, y, z), q.setFromEuler(e.set(0, t * 0.7 + Math.PI / 2, 0)), s.set(flap, 1, 1))
        this.butterflies.setMatrixAt(i, m4)
      } else {
        for (let k = 0; k < 2; k++) {
          const tk = t * (0.4 + k * 0.17) + k * 3
          const x = spot.x + Math.sin(tk) * 1.6
          const z = spot.z + Math.cos(tk * 1.3) * 1.6
          const y = spot.y + 0.6 + k * 0.5 + Math.sin(tk * 2) * 0.3
          const blink = Math.max(0, Math.sin(t * (1.6 + k * 0.7) + k * 2)) ** 2
          m4.compose(v.set(x, y, z), q.identity(), s.setScalar(Math.max(0.001, blink * 1.2)))
          this.fireflies.setMatrixAt(i * 2 + k, m4)
        }
      }
    })
    if (dusk) this.fireflies.instanceMatrix.needsUpdate = true
    else this.butterflies.instanceMatrix.needsUpdate = true

    // Boats bob; the sailboat crosses the northern horizon and turns back.
    this.rowboat.position.y = SAND_Y - 0.32 + Math.sin(time * 1.3) * 0.06
    this.rowboat.rotation.z = Math.sin(time * 1.1) * 0.04
    this.rowboat.rotation.x = Math.sin(time * 0.9 + 1) * 0.03
    const leg = (time / 140) % 2
    const k = leg < 1 ? leg : 2 - leg
    const ease = k * k * (3 - 2 * k)
    this.sailboat.position.set(-70 + ease * 140, Math.sin(time * 0.8) * 0.15, -78 + Math.sin(ease * Math.PI) * 10)
    this.sailboat.rotation.y = leg < 1 ? Math.PI / 2 : -Math.PI / 2
    this.sailboat.rotation.z = Math.sin(time * 0.7) * 0.05
  }

  dispose() {
    this.textures.forEach((t) => t.dispose())
  }
}
