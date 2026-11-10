/**
 * City entry point, loaded with a dynamic import() by boot.ts only when the
 * city view is active. Wires the scene, the player, the car, the controls,
 * the minimap and the HUD together and runs the render loop.
 *
 * The player is either on foot or driving. On foot: camera-relative walking
 * (Shift or a full joystick to sprint), Space to jump, click/tap to walk.
 * Driving: arcade car handling (car.ts) with a chase camera. In both, the
 * follow camera swings back behind the player a moment after the last drag.
 */
import * as THREE from "three"
import { Car } from "./car"
import { Character } from "./character"
import { Controls, ORBIT_LIMITS, clamp } from "./controls"
import { CAR_SPAWN, SPAWN, groundHeight, resolvePosition } from "./layout"
import { distanceTo, entrance, landmarks, standPoint, type Landmark } from "./landmarks"
import { Minimap } from "./minimap"
import type { Theme } from "./palette"
import { createScene } from "./scene"
import { Hud } from "./ui"

export interface CitySession {
  dispose(): void
}

interface StartOptions {
  reducedMotion: boolean
  /** Called if the WebGL context is lost while running. */
  onFatal: (error: unknown) => void
}

const WALK_SPEED = 6.5
const SPRINT_SPEED = 11
/** Jump take-off speed and gravity (units/s, units/s²): about 1.3 units high, 0.6s in the air. */
const JUMP_SPEED = 8.5
const GRAVITY = 28
/** How close (to the footprint) the player must be to use a place, on foot and in the car. */
const USE_RANGE = 3
const USE_RANGE_CAR = 5
/** How close to the car's body the player must be to get in. */
const CAR_RANGE = 2.2
/** The camera holds still this long (ms) after a drag before swinging back behind the player. */
const LOOK_HOLD = 1600
const INTRO_SECONDS = 3
/** Default camera pitch on foot (radians from straight down). */
const FOOT_POLAR = 1.24

export function startCity(root: HTMLElement, opts: StartOptions): CitySession {
  const canvas = root.querySelector<HTMLCanvasElement>("[data-city-canvas]")!
  const lowPower = matchMedia("(pointer: coarse)").matches || window.innerWidth < 700
  const world = createScene(canvas, { lowPower })
  const { camera } = world
  const themeOf = (): Theme => (document.documentElement.classList.contains("dark") ? "dark" : "light")

  const player = new Character(world.kit)
  world.scene.add(player.group)
  const car = new Car(world.kit, CAR_SPAWN.x, CAR_SPAWN.z, CAR_SPAWN.heading, "#e2552b")
  world.scene.add(car.group)
  world.pickables.push(car.group)

  const pos = new THREE.Vector3(SPAWN.x, groundHeight(SPAWN.x, SPAWN.z), SPAWN.z)
  let heading = SPAWN.heading
  let driving = false
  let target: THREE.Vector2 | null = null
  let targetLandmark: Landmark | null = null
  let stuckFor = 0
  let speed = 0
  /** Height above the ground and vertical speed of a jump (0 when grounded). */
  let air = 0
  let airSpeed = 0
  let waypoint: Landmark | null = null
  /** Zoom is remembered separately on foot and in the car. */
  const zoom = { foot: 12.5, car: 14.5 }
  /** 0..1 progress of the opening camera sweep (1 = done or skipped). */
  let intro = opts.reducedMotion ? 1 : 0

  // Tap marker: a flat ring where a click/tap sent the player.
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(0.35, 0.5, 20),
    new THREE.MeshBasicMaterial({ color: 0xfff1d6, transparent: true, opacity: 0.85, depthWrite: false })
  )
  marker.rotation.x = -Math.PI / 2
  marker.visible = false
  world.scene.add(marker)

  // Waypoint beacon: a tall translucent column of light over the target place.
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 1.2, 60, 16, 1, true),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide, fog: false })
  )
  beacon.visible = false
  world.scene.add(beacon)

  // Entrance markers: a glowing ring on the sidewalk and a bobbing chevron above it, per place.
  const ringGeo = new THREE.RingGeometry(1.05, 1.35, 32).rotateX(-Math.PI / 2)
  const chevronGeo = new THREE.ConeGeometry(0.45, 0.8, 4).rotateX(Math.PI)
  const chevrons: THREE.Mesh[] = []
  for (const lm of landmarks) {
    const [ex, ez] = entrance(lm)
    const material = new THREE.MeshBasicMaterial({ color: lm.colour, transparent: true, opacity: 0.85, depthWrite: false })
    const ring = new THREE.Mesh(ringGeo, material)
    ring.position.set(ex, groundHeight(ex, ez) + 0.04, ez)
    const chevron = new THREE.Mesh(chevronGeo, material)
    chevron.position.set(ex, 2.6, ez)
    chevrons.push(chevron)
    world.scene.add(ring, chevron)
  }

  const hud = new Hud(root, {
    onStation: (id) => {
      const lm = landmarks.find((l) => l.id === id)
      if (lm) teleportTo(lm)
      hud.open(id)
    },
    onWaypoint: (id) => setWaypoint(landmarks.find((l) => l.id === id) ?? null),
    onCar: () => toggleCar(),
  })

  const minimapCanvas = root.querySelector<HTMLCanvasElement>("[data-minimap]")!
  const minimap = new Minimap(minimapCanvas, (lm) => setWaypoint(waypoint === lm ? null : lm))

  const applyTheme = () => {
    const theme = themeOf()
    world.applyTheme(theme)
    minimap.setTheme(theme)
  }
  applyTheme()

  const raycaster = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  const controls = new Controls({
    canvas,
    isBlocked: () => hud.dialogOpen,
    isDriving: () => driving,
    onInteract: () => hud.openNearby(),
    onJump: () => {
      if (!driving && air === 0 && airSpeed === 0) airSpeed = JUMP_SPEED
    },
    onVehicle: () => toggleCar(),
    onPhone: () => hud.togglePhone(),
    onFirstInput: () => {
      intro = 1
      hud.fadeHint()
    },
    onTap: (x, y) => {
      if (driving) return
      const rect = canvas.getBoundingClientRect()
      ndc.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(ndc, camera)
      const hit = raycaster.intersectObjects(world.pickables, true)[0]
      for (let o: THREE.Object3D | null = hit?.object ?? null; o; o = o.parent) {
        if (o === car.group) {
          const [dx, dz] = car.doorPoint()
          walkTo(dx, dz, null)
          return
        }
        if (o.userData.landmarkId) {
          const landmark = landmarks.find((l) => l.id === o!.userData.landmarkId) ?? null
          if (landmark) {
            const [sx, sz] = standPoint(landmark, 1.2)
            walkTo(sx, sz, landmark)
            return
          }
        }
      }
      const point = hit?.point ?? raycaster.ray.intersectPlane(groundPlane, new THREE.Vector3())
      if (point) walkTo(point.x, point.z, null)
    },
  })

  const joystick = root.querySelector<HTMLElement>("[data-joystick]")
  const knob = joystick?.querySelector<HTMLElement>("[data-joystick-knob]")
  if (joystick && knob) controls.attachJoystick(joystick, knob)
  const gas = root.querySelector<HTMLElement>('[data-pedal="gas"]')
  const brake = root.querySelector<HTMLElement>('[data-pedal="brake"]')
  if (gas && brake) controls.attachPedals(gas, brake)

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
    if (driving) exitCar()
    const [x, z] = standPoint(lm)
    const p = resolvePosition({ x, z })
    pos.set(p.x, groundHeight(p.x, p.z), p.z)
    heading = lm.facing + Math.PI
    target = null
    marker.visible = false
    intro = 1
    controls.orbit.azimuth = lm.facing
    if (opts.reducedMotion) snapCamera()
  }

  function setWaypoint(lm: Landmark | null) {
    waypoint = lm
    beacon.visible = !!lm
    if (lm) {
      ;(beacon.material as THREE.MeshBasicMaterial).color.set(lm.colour)
      const [ex, ez] = entrance(lm)
      beacon.position.set(ex, 30, ez)
      hud.announce(`Waypoint set to ${lm.label}. Follow the line on the minimap.`)
    } else {
      hud.setWaypoint(null)
    }
  }

  function toggleCar() {
    if (hud.dialogOpen) return
    if (driving) exitCar()
    else if (car.distanceTo(pos.x, pos.z) < CAR_RANGE) enterCar()
  }

  function enterCar() {
    driving = true
    target = null
    marker.visible = false
    air = airSpeed = 0
    player.group.visible = false
    zoom.foot = controls.orbit.distance
    controls.orbit.distance = zoom.car
    controls.lastLook = -Infinity
    hud.setDriving(true)
  }

  function exitCar() {
    driving = false
    zoom.car = controls.orbit.distance
    controls.orbit.distance = zoom.foot
    // Step out of the driver's door; if that side is blocked, use the other one.
    const [lx, lz] = car.doorPoint()
    let p = resolvePosition({ x: lx, z: lz })
    if (Math.hypot(p.x - lx, p.z - lz) > 0.6) {
      p = resolvePosition({ x: 2 * car.position.x - lx, z: 2 * car.position.y - lz })
    }
    pos.set(p.x, groundHeight(p.x, p.z), p.z)
    heading = car.heading
    player.group.visible = true
    hud.setDriving(false)
  }

  /** Keeps the player out of the car's body (three circles along it). */
  function pushOutOfCar(p: { x: number; z: number }) {
    const sin = Math.sin(car.heading)
    const cos = Math.cos(car.heading)
    for (const off of [-1.35, 0, 1.35]) {
      const cx = car.position.x + sin * off
      const cz = car.position.y + cos * off
      const dx = p.x - cx
      const dz = p.z - cz
      const d = Math.hypot(dx, dz)
      const min = 1.02 + 0.45
      if (d < min && d > 1e-4) {
        p.x = cx + (dx / d) * min
        p.z = cz + (dz / d) * min
      }
    }
  }

  // Follow camera: eases toward the player (or car) and the orbit settings.
  const camTarget = new THREE.Vector3()
  const offset = new THREE.Vector3()
  const shake = new THREE.Vector3()
  let shakeAmount = 0
  function desiredCamera(out: THREE.Vector3) {
    const { azimuth, polar } = controls.orbit
    // Portrait screens see less across, so pull back a little.
    const distance = controls.orbit.distance * (camera.aspect < 1 ? Math.pow(camera.aspect, -0.15) : 1)
    offset.set(Math.sin(azimuth) * Math.sin(polar), Math.cos(polar), Math.cos(azimuth) * Math.sin(polar))
    return out.copy(camTarget).addScaledVector(offset, distance)
  }
  function focusPoint(out: THREE.Vector3) {
    if (driving) {
      const lead = clamp(car.forwardSpeed * 0.18, -2, 4)
      return out.set(
        car.position.x + Math.sin(car.heading) * lead,
        car.group.position.y + 1.4,
        car.position.y + Math.cos(car.heading) * lead
      )
    }
    return out.set(pos.x, pos.y + 2.1, pos.z)
  }
  function snapCamera() {
    focusPoint(camTarget)
    desiredCamera(camera.position)
    camera.lookAt(camTarget)
  }
  /** Turns the orbit's azimuth toward `want` at `rate` (per second). */
  function swingTo(want: number, rate: number, dt: number) {
    let diff = want - controls.orbit.azimuth
    diff = Math.atan2(Math.sin(diff), Math.cos(diff))
    controls.orbit.azimuth += diff * Math.min(1, dt * rate)
  }

  const forward = new THREE.Vector2()
  const right = new THREE.Vector2()
  const move = new THREE.Vector2()
  const desired = new THREE.Vector3()
  const labelPoint = new THREE.Vector3()
  let baseFov = camera.fov
  let fovKick = 0
  let frame = 0

  function stepFoot(dt: number) {
    const az = controls.orbit.azimuth
    forward.set(-Math.sin(az), -Math.cos(az))
    right.set(Math.cos(az), -Math.sin(az))
    // Keys (normalised) or the joystick (analog, length up to 1).
    const [mx, my] = controls.moveVector()
    move.set(0, 0)
    let pushingForward = 0
    if (mx || my) {
      target = null
      marker.visible = false
      move.addScaledVector(forward, my).addScaledVector(right, mx)
      pushingForward = Math.max(0, my) * (1 - Math.abs(mx) * 0.6)
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
        pushingForward = 0.7
      }
    }

    const runSpeed = controls.sprinting() ? SPRINT_SPEED : WALK_SPEED
    const before = { x: pos.x, z: pos.z }
    if (move.lengthSq() > 0) {
      const p = { x: pos.x + move.x * runSpeed * dt, z: pos.z + move.y * runSpeed * dt }
      pushOutOfCar(p)
      resolvePosition(p)
      pos.x = p.x
      pos.z = p.z
      const want = Math.atan2(move.x, move.y)
      let diff = want - heading
      diff = Math.atan2(Math.sin(diff), Math.cos(diff))
      heading += diff * Math.min(1, dt * 16)
    }
    const moved = Math.hypot(pos.x - before.x, pos.z - before.z)
    speed = dt > 0 ? moved / dt : 0
    // Give up on a click target the player cannot reach (blocked by a collider).
    if (target && move.lengthSq() > 0.25 && moved < runSpeed * dt * 0.2) {
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
    player.update(dt, air > 0 ? 0 : speed, clock, air > 0)

    // Swing the camera in behind while walking forward.
    if (pushingForward > 0 && performance.now() - controls.lastLook > LOOK_HOLD && speed > 1) {
      swingTo(heading + Math.PI, 1.4 * pushingForward, dt)
    }
  }

  function stepCar(dt: number) {
    car.update(dt, controls.driveKeys())
    pos.set(car.position.x, car.group.position.y, car.position.y)
    heading = car.heading
    const vf = car.forwardSpeed
    if (performance.now() - controls.lastLook > LOOK_HOLD && Math.abs(vf) > 1.5) {
      swingTo(car.heading + Math.PI, 2.6 * Math.min(1, Math.abs(vf) / 8), dt)
    }
    if (car.impact > 0.15 && !opts.reducedMotion) shakeAmount = Math.max(shakeAmount, car.impact * 0.5)
  }

  let clock = 0
  function step(dt: number) {
    // Opening shot: a high sweep over the district that settles in behind the player.
    if (intro < 1) {
      intro = Math.min(1, intro + dt / INTRO_SECONDS)
      const t = intro * intro * (3 - 2 * intro)
      controls.orbit.azimuth = -1.6 * (1 - t)
      controls.orbit.polar = 0.72 + (FOOT_POLAR - 0.72) * t
      controls.orbit.distance = 52 + (zoom.foot - 52) * t
    }

    if (driving) {
      if (hud.dialogOpen) car.idle(dt)
      else stepCar(dt)
      hud.setSpeed(car.forwardSpeed)
    } else {
      stepFoot(dt)
      if (car.velocity.lengthSq() > 0.01) car.idle(dt)
    }

    if (marker.visible) {
      const m = marker.material as THREE.MeshBasicMaterial
      m.opacity -= dt * 0.6
      if (m.opacity <= 0.05) marker.visible = false
    }

    // Nearest usable place, and whether the car is in reach.
    let near: Landmark | null = null
    let best = Infinity
    const range = driving ? USE_RANGE_CAR : USE_RANGE
    for (const lm of landmarks) {
      const d = distanceTo(lm, pos.x, pos.z)
      if (d < range && d < best) {
        best = d
        near = lm
      }
    }
    hud.setNearby(near)
    hud.setCarPrompt(driving ? "exit" : car.distanceTo(pos.x, pos.z) < CAR_RANGE ? "enter" : null)

    if (waypoint) {
      const d = distanceTo(waypoint, pos.x, pos.z)
      if (d < range) {
        hud.announce(`Arrived at ${waypoint.label}.`)
        setWaypoint(null)
      } else hud.setWaypoint(waypoint, d)
    }

    // Camera.
    const follow = opts.reducedMotion ? 1 : 1 - Math.exp(-dt * (driving ? 7 : 9))
    focusPoint(desired)
    camTarget.lerp(desired, follow)
    desiredCamera(desired)
    camera.position.lerp(desired, opts.reducedMotion ? 1 : 1 - Math.exp(-dt * (driving ? 9 : 11)))
    // Keep the camera above the ground near walls and the curb.
    camera.position.y = Math.max(camera.position.y, 1.2)
    if (shakeAmount > 0.001) {
      shake.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(shakeAmount)
      camera.position.add(shake)
      shakeAmount *= Math.exp(-dt * 10)
    }
    camera.lookAt(camTarget)
    // A little extra field of view at speed.
    const kick = driving && !opts.reducedMotion ? clamp((Math.abs(car.forwardSpeed) - 8) * 0.45, 0, 8) : 0
    fovKick += (kick - fovKick) * Math.min(1, dt * 3)
    if (Math.abs(camera.fov - (baseFov + fovKick)) > 0.01) {
      camera.fov = baseFov + fovKick
      camera.updateProjectionMatrix()
    }
    camera.updateMatrixWorld()
    world.focus(pos.x, pos.z)

    // Floating markers over the places.
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    for (const lm of landmarks) {
      const [ex, ez] = entrance(lm)
      labelPoint.set(ex, lm.labelHeight, ez)
      const far = labelPoint.distanceTo(camera.position) > 70
      labelPoint.project(camera)
      const visible = labelPoint.z < 1 && Math.abs(labelPoint.x) < 1.1 && Math.abs(labelPoint.y) < 1.1
      hud.placeLabel(lm.id, ((labelPoint.x + 1) / 2) * w, ((1 - labelPoint.y) / 2) * h, visible, lm === near, lm === waypoint, far)
    }

    chevrons.forEach((c, i) => {
      c.position.y = 2.7 + Math.sin(clock * 2.4 + i) * 0.18
      c.rotation.y = clock * 1.5
    })
    if (beacon.visible) {
      ;(beacon.material as THREE.MeshBasicMaterial).opacity = 0.14 + Math.sin(clock * 3) * 0.05
    }

    // Minimap (every other frame on phones).
    if (!lowPower || frame % 2 === 0) {
      minimap.draw({
        x: pos.x,
        z: pos.z,
        heading,
        azimuth: controls.orbit.azimuth,
        car: driving ? null : { x: car.position.x, z: car.position.y, heading: car.heading },
        waypoint,
        radius: driving ? 52 : 36,
      })
    }

    world.update(dt, clock)
  }

  // Resize with the container.
  const resize = () => {
    world.resize(canvas.clientWidth || root.clientWidth, canvas.clientHeight || root.clientHeight)
    baseFov = camera.fov
    fovKick = 0
  }
  const resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(root)
  resize()

  // Follow the site theme toggle.
  const themeObserver = new MutationObserver(applyTheme)
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })

  // Render loop, paused while the tab is hidden.
  let raf = 0
  let last = performance.now()
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop)
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    clock += dt
    frame++
    step(dt)
    world.render()
  }
  const onVisibility = () => {
    cancelAnimationFrame(raf)
    raf = 0
    if (!document.hidden) {
      last = performance.now()
      raf = requestAnimationFrame(loop)
    }
  }
  document.addEventListener("visibilitychange", onVisibility)

  const onContextLost = (e: Event) => {
    e.preventDefault()
    opts.onFatal(new Error("WebGL context lost"))
  }
  canvas.addEventListener("webglcontextlost", onContextLost)

  // First frame now (compiles shaders), then the loop.
  if (intro < 1) {
    controls.orbit.azimuth = -1.6
    controls.orbit.polar = 0.72
    controls.orbit.distance = 52
  }
  controls.orbit.distance = clamp(controls.orbit.distance, ORBIT_LIMITS.distanceMin, 60)
  snapCamera()
  step(0)
  world.render()
  if (!document.hidden) raf = requestAnimationFrame(loop)

  // Test hook for automated checks (read-only snapshot, no behaviour).
  ;(root as HTMLElement & { __city?: () => object }).__city = () => ({
    driving,
    pos: [pos.x, pos.z],
    car: [car.position.x, car.position.y, car.forwardSpeed],
    carScreen: (() => {
      const v = new THREE.Vector3(car.position.x, 1, car.position.y).project(camera)
      return [((v.x + 1) / 2) * canvas.clientWidth, ((1 - v.y) / 2) * canvas.clientHeight]
    })(),
    calls: world.renderer.info.render.calls,
    triangles: world.renderer.info.render.triangles,
  })

  let disposed = false
  return {
    dispose() {
      if (disposed) return
      disposed = true
      cancelAnimationFrame(raf)
      document.removeEventListener("visibilitychange", onVisibility)
      canvas.removeEventListener("webglcontextlost", onContextLost)
      resizeObserver.disconnect()
      themeObserver.disconnect()
      controls.dispose()
      hud.dispose()
      minimap.dispose()
      world.dispose()
      delete (root as HTMLElement & { __city?: () => object }).__city
      // The old canvas keeps its (now lost) context; give the next start a fresh one.
      canvas.replaceWith(canvas.cloneNode(false))
    },
  }
}
