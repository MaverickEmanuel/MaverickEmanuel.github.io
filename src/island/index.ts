/**
 * Island entry point, loaded with a dynamic import() by boot.ts only when the
 * island view is active. Wires the scene, the player, the controls and the
 * HUD together and runs the render loop.
 */
import * as THREE from "three"
import { IslandAudio } from "./audio"
import { Character } from "./character"
import { Controls } from "./controls"
import { landmarks, standPoint, type Landmark } from "./landmarks"
import type { Theme } from "./palette"
import { createScene } from "./scene"
import { Hud } from "./ui"
import { BASE_Y, groundHeight, resolvePosition, surfaceAt } from "./world"

export interface IslandSession {
  dispose(): void
}

interface StartOptions {
  reducedMotion: boolean
  /** Called if the WebGL context is lost while running. */
  onFatal: (error: unknown) => void
}

const WALK_SPEED = 6.5
/** Jump take-off speed and gravity (units/s, units/s²): about 1.3 units high, 0.6s in the air. */
const JUMP_SPEED = 8.5
const GRAVITY = 28
/** How close (beyond the footprint) the player must be to use a station. */
const USE_RANGE = 3.4

export function startIsland(root: HTMLElement, opts: StartOptions): IslandSession {
  const canvas = root.querySelector<HTMLCanvasElement>("[data-island-canvas]")!
  const lowPower = matchMedia("(pointer: coarse)").matches || window.innerWidth < 700
  const world = createScene(canvas, { lowPower })
  const { camera } = world
  const themeOf = (): Theme => (document.documentElement.classList.contains("dark") ? "dark" : "light")
  world.applyTheme(themeOf())

  const audio = new IslandAudio()
  const player = new Character(world.kit)
  world.scene.add(player.group)
  const pos = new THREE.Vector3(0, BASE_Y, 2)
  let heading = 0
  let target: THREE.Vector2 | null = null
  let targetLandmark: Landmark | null = null
  let stuckFor = 0
  let speed = 0
  /** Height above the ground and vertical speed of a jump (0 when grounded). */
  let air = 0
  let airSpeed = 0
  let wasAirborne = false

  // Tap marker: a flat ring where a click/tap sent the player.
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(0.35, 0.5, 20),
    new THREE.MeshBasicMaterial({ color: 0xfff1d6, transparent: true, opacity: 0.85, depthWrite: false })
  )
  marker.rotation.x = -Math.PI / 2
  marker.visible = false
  world.scene.add(marker)

  /** The landmark the open dialog shows (the camera frames it), and the eased blend 0..1. */
  let focus: Landmark | null = null

  const hud = new Hud(root, {
    audio,
    reducedMotion: opts.reducedMotion,
    onStation: (id) => {
      const lm = landmarks.find((l) => l.id === id)
      if (lm) teleportTo(lm)
      hud.open(id)
    },
    onFocus: (id) => {
      const next = id ? (landmarks.find((l) => l.id === id) ?? null) : null
      if (next !== focus) startGlide()
      focus = next
    },
  })

  const raycaster = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -BASE_Y)
  const controls = new Controls({
    canvas,
    isBlocked: () => hud.dialogOpen,
    onInteract: () => hud.openNearby(),
    onJump: () => {
      if (air === 0 && airSpeed === 0) {
        airSpeed = JUMP_SPEED
        audio.unlock()
      }
    },
    onFirstInput: () => hud.fadeHint(),
    onTap: (x, y) => {
      const rect = canvas.getBoundingClientRect()
      ndc.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(ndc, camera)
      const hit = raycaster.intersectObjects(world.pickables, true)[0]
      let landmark: Landmark | null = null
      for (let o: THREE.Object3D | null = hit?.object ?? null; o; o = o.parent) {
        if (o.userData.landmarkId) {
          landmark = landmarks.find((l) => l.id === o.userData.landmarkId) ?? null
          break
        }
      }
      if (landmark) {
        const [sx, sz] = standPoint(landmark, 1.2)
        walkTo(sx, sz, landmark)
        return
      }
      const point = hit?.point ?? raycaster.ray.intersectPlane(groundPlane, new THREE.Vector3())
      if (point) walkTo(point.x, point.z, null)
    },
  })

  const joystick = root.querySelector<HTMLElement>("[data-joystick]")
  const knob = joystick?.querySelector<HTMLElement>("[data-joystick-knob]")
  if (joystick && knob) controls.attachJoystick(joystick, knob)

  function walkTo(x: number, z: number, landmark: Landmark | null) {
    const p = resolvePosition({ x, z })
    target = new THREE.Vector2(p.x, p.z)
    targetLandmark = landmark
    stuckFor = 0
    marker.position.set(p.x, groundHeight(p.x, p.z) + 0.06, p.z)
    marker.visible = true
    ;(marker.material as THREE.MeshBasicMaterial).opacity = 0.85
  }

  function teleportTo(lm: Landmark) {
    const [x, z] = standPoint(lm)
    const p = resolvePosition({ x, z })
    pos.set(p.x, groundHeight(p.x, p.z), p.z)
    heading = lm.facing + Math.PI
    target = null
    marker.visible = false
    controls.orbit.azimuth = lm.facing
    if (opts.reducedMotion) snapCamera()
  }

  // Follow camera: eases toward the player and the orbit settings.
  const camTarget = new THREE.Vector3()
  const offset = new THREE.Vector3()
  /** The follow camera's offset from its target, from the orbit settings. */
  function followOffset(out: THREE.Vector3) {
    const { azimuth, polar } = controls.orbit
    // Portrait screens see less of the island across, so pull back a little.
    const distance = controls.orbit.distance * (camera.aspect < 1 ? Math.pow(camera.aspect, -0.4) : 1)
    return out.set(Math.sin(azimuth) * Math.sin(polar), Math.cos(polar), Math.cos(azimuth) * Math.sin(polar)).multiplyScalar(distance)
  }
  function desiredCamera(out: THREE.Vector3) {
    return out.copy(camTarget).add(followOffset(offset))
  }
  function snapCamera() {
    camTarget.set(pos.x, pos.y + 1.6, pos.z)
    desiredCamera(camera.position)
    camera.lookAt(camTarget)
  }

  // Camera framing for the open dialog: in front of the landmark, a little above.
  const focusTarget = new THREE.Vector3()
  const focusOffset = new THREE.Vector3()
  const goal = new THREE.Vector3()
  const goalOffset = new THREE.Vector3()

  /**
   * Opening, browsing and closing a popup move the camera with a timed glide
   * (eased in and out) from wherever it is, instead of the follow chase, which
   * starts fast and felt like a snap. A new glide mid-way starts from the
   * current pose. The offset is blended in spherical coordinates (shortest way
   * round), so the camera swings around the target rather than through it.
   */
  const GLIDE_SECONDS = 1.1
  const glideFromTarget = new THREE.Vector3()
  const glideFrom = new THREE.Spherical()
  const glideTo = new THREE.Spherical()
  const glideOffset = new THREE.Vector3()
  let glide = -1
  function startGlide() {
    if (opts.reducedMotion) return
    glideFromTarget.copy(camTarget)
    glideFrom.setFromVector3(glideOffset.subVectors(camera.position, camTarget))
    glide = 0
  }
  /** Spherical with theta = azimuth around y, phi = from straight up (matches the orbit). */
  function blendSpherical(a: THREE.Spherical, b: THREE.Spherical, t: number, out: THREE.Vector3) {
    let dTheta = b.theta - a.theta
    dTheta = Math.atan2(Math.sin(dTheta), Math.cos(dTheta))
    return out.setFromSphericalCoords(a.radius + (b.radius - a.radius) * t, a.phi + (b.phi - a.phi) * t, a.theta + dTheta * t)
  }
  function framing(lm: Landmark) {
    focusTarget.set(lm.position[0], BASE_Y + Math.min(3.2, lm.labelHeight * 0.38), lm.position[1])
    const distance = (lm.collider * 2.6 + 12) * (camera.aspect < 1 ? Math.pow(camera.aspect, -0.35) : 1)
    // High enough that the player, standing in front, does not block the view.
    const polar = 0.86
    // A touch off-axis, so the landmark reads as a 3D object.
    const az = lm.facing + 0.35
    focusOffset.set(Math.sin(az) * Math.sin(polar), Math.cos(polar), Math.cos(az) * Math.sin(polar)).multiplyScalar(distance)
  }

  const forward = new THREE.Vector2()
  const right = new THREE.Vector2()
  const move = new THREE.Vector2()
  const desired = new THREE.Vector3()
  const labelPoint = new THREE.Vector3()

  function step(dt: number, time: number) {
    const az = controls.orbit.azimuth
    forward.set(-Math.sin(az), -Math.cos(az))
    right.set(Math.cos(az), -Math.sin(az))
    // Keys (normalised) or the joystick (analog, length up to 1).
    const [mx, my] = controls.moveVector()
    move.set(0, 0)
    if (mx || my) {
      target = null
      marker.visible = false
      move.addScaledVector(forward, my).addScaledVector(right, mx)
    } else if (target) {
      move.set(target.x - pos.x, target.y - pos.z)
      const dist = move.length()
      if (dist < 0.15) {
        if (targetLandmark) heading = targetLandmark.facing + Math.PI
        target = null
        targetLandmark = null
        move.set(0, 0)
      } else {
        move.multiplyScalar(Math.min(1, dist / 0.6) / dist)
      }
    }

    const before = { x: pos.x, z: pos.z }
    if (move.lengthSq() > 0) {
      const p = resolvePosition({ x: pos.x + move.x * WALK_SPEED * dt, z: pos.z + move.y * WALK_SPEED * dt })
      pos.x = p.x
      pos.z = p.z
      const want = Math.atan2(move.x, move.y)
      let diff = want - heading
      diff = Math.atan2(Math.sin(diff), Math.cos(diff))
      heading += diff * Math.min(1, dt * 12)
    }
    const moved = Math.hypot(pos.x - before.x, pos.z - before.z)
    speed = dt > 0 ? moved / dt : 0
    // Give up on a click target the player cannot reach (blocked by a collider).
    if (target && move.lengthSq() > 0.25 && moved < WALK_SPEED * dt * 0.2) {
      stuckFor += dt
      if (stuckFor > 0.35) {
        target = null
        targetLandmark = null
      }
    } else stuckFor = 0

    pos.y += (groundHeight(pos.x, pos.z) - pos.y) * Math.min(1, dt * 20)
    // Jump: a simple ballistic arc on top of the ground height. The camera
    // follows pos (the ground), so it does not bob with the jump.
    if (airSpeed !== 0 || air > 0) {
      airSpeed -= GRAVITY * dt
      air += airSpeed * dt
      if (air <= 0) {
        air = 0
        airSpeed = 0
      }
    }
    player.group.position.copy(pos)
    player.group.position.y += air
    player.group.rotation.y = heading
    const stepsBefore = player.steps
    player.update(dt, air > 0 ? 0 : speed, time, air > 0)
    if (player.steps !== stepsBefore) audio.step(surfaceAt(pos.x, pos.z), Math.min(1, speed / WALK_SPEED))
    if (wasAirborne && air === 0) {
      audio.land()
      audio.step(surfaceAt(pos.x, pos.z), 0.6)
    }
    wasAirborne = air > 0

    if (marker.visible) {
      const m = marker.material as THREE.MeshBasicMaterial
      m.opacity -= dt * 0.6
      if (m.opacity <= 0.05) marker.visible = false
    }

    // Nearest usable station.
    let near: Landmark | null = null
    let best = Infinity
    for (const lm of landmarks) {
      const d = Math.hypot(pos.x - lm.position[0], pos.z - lm.position[1]) - lm.collider
      if (d < USE_RANGE && d < best) {
        best = d
        near = lm
      }
    }
    hud.setNearby(near)
    world.setNear(near?.id ?? null)
    const fire = landmarks.find((l) => l.model === "campfire")!
    audio.update(dt, Math.hypot(pos.x - fire.position[0], pos.z - fire.position[1]))

    // Camera: frame the landmark whose dialog is open, or follow the player;
    // changes between the two (and between landmarks) glide.
    if (focus) {
      framing(focus)
      goal.copy(focusTarget)
      goalOffset.copy(focusOffset)
    } else {
      goal.set(pos.x, pos.y + 1.6, pos.z)
      followOffset(goalOffset)
    }
    if (glide >= 0) {
      glide = Math.min(1, glide + dt / GLIDE_SECONDS)
      const t = glide < 0.5 ? 4 * glide * glide * glide : 1 - Math.pow(-2 * glide + 2, 3) / 2
      camTarget.lerpVectors(glideFromTarget, goal, t)
      glideTo.setFromVector3(goalOffset)
      camera.position.copy(camTarget).add(blendSpherical(glideFrom, glideTo, t, glideOffset))
      if (glide >= 1) glide = -1
    } else if (focus) {
      camTarget.copy(goal)
      camera.position.copy(goal).add(goalOffset)
    } else {
      camTarget.lerp(goal, opts.reducedMotion ? 1 : 1 - Math.exp(-dt * 5))
      desiredCamera(desired)
      camera.position.lerp(desired, opts.reducedMotion ? 1 : 1 - Math.exp(-dt * 8))
    }
    camera.lookAt(camTarget)
    camera.updateMatrixWorld()

    // Floating labels.
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    for (const lm of landmarks) {
      labelPoint.set(lm.position[0], BASE_Y + lm.labelHeight, lm.position[1]).project(camera)
      const visible = labelPoint.z < 1 && Math.abs(labelPoint.x) < 1.2 && Math.abs(labelPoint.y) < 1.2
      hud.placeLabel(lm.id, ((labelPoint.x + 1) / 2) * w, ((1 - labelPoint.y) / 2) * h, visible, lm === near)
    }

    world.update(dt, time)
  }

  // Resize with the container.
  const resize = () => {
    world.resize(canvas.clientWidth || root.clientWidth, canvas.clientHeight || root.clientHeight)
  }
  const resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(root)
  resize()

  // Follow the site theme toggle.
  const themeObserver = new MutationObserver(() => world.applyTheme(themeOf()))
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })

  // Render loop, paused while the tab is hidden.
  let raf = 0
  let last = performance.now()
  let clock = 0
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame)
    const dt = Math.min(0.1, (now - last) / 1000)
    last = now
    clock += dt
    step(dt, clock)
    world.render()
  }
  const onVisibility = () => {
    audio.setHidden(document.hidden)
    cancelAnimationFrame(raf)
    raf = 0
    if (!document.hidden) {
      last = performance.now()
      raf = requestAnimationFrame(frame)
    }
  }
  document.addEventListener("visibilitychange", onVisibility)

  const onContextLost = (e: Event) => {
    e.preventDefault()
    opts.onFatal(new Error("WebGL context lost"))
  }
  canvas.addEventListener("webglcontextlost", onContextLost)

  // First frame now (compiles shaders), then the loop.
  snapCamera()
  step(0, 0)
  world.render()
  if (!document.hidden) raf = requestAnimationFrame(frame)
  hud.welcomeIfNew()

  let disposed = false

  return {
    dispose() {
      if (disposed) return
      disposed = true
      audio.dispose()
      cancelAnimationFrame(raf)
      document.removeEventListener("visibilitychange", onVisibility)
      canvas.removeEventListener("webglcontextlost", onContextLost)
      resizeObserver.disconnect()
      themeObserver.disconnect()
      controls.dispose()
      hud.dispose()
      world.dispose()
      // The old canvas keeps its (now lost) context; give the next start a fresh one.
      canvas.replaceWith(canvas.cloneNode(false))
    },
  }
}
