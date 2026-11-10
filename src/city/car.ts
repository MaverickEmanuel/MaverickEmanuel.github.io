/**
 * The drivable car: arcade handling with no physics engine. The body keeps a
 * 2D velocity split into a forward part (throttle, brakes, drag) and a
 * sideways part (bled off by tyre grip, much less with the handbrake, which
 * is what makes it slide). Steering turns the heading in proportion to the
 * forward speed, like a bicycle model. Collisions push three circles along
 * the body out of the layout's colliders and bounce the velocity off the
 * contact normal.
 */
import * as THREE from "three"
import { carModel, type CarParts, type Kit } from "./models"
import { groundHeight, resolveCircle } from "./layout"

export interface DriveInput {
  /** -1 (brake / reverse) to 1 (accelerate). */
  throttle: number
  /** -1 (left) to 1 (right). */
  steer: number
  handbrake: boolean
}

const MAX_SPEED = 24
const MAX_REVERSE = 8
const ACCEL = 15
const BRAKE = 32
const REVERSE_ACCEL = 9
const ROLL_DRAG = 3
const AIR_DRAG = 0.012
const WHEELBASE = 2.8
const MAX_STEER = 0.62
const GRIP = 9
const SLIDE_GRIP = 1.4
const HANDBRAKE_DECEL = 9
/** Circles along the body (offsets from the centre) used for collisions. */
const HULL = [-1.35, 0, 1.35]
const HULL_RADIUS = 1.02
const WHEEL_RADIUS = 0.4

export class Car {
  readonly parts: CarParts
  readonly group: THREE.Group
  readonly position = new THREE.Vector2()
  readonly velocity = new THREE.Vector2()
  heading: number
  private steerAngle = 0
  private y = 0
  /** Last frame's impact strength (0 when nothing was hit), for camera shake. */
  impact = 0

  constructor(kit: Kit, x: number, z: number, heading: number, colour: string) {
    this.parts = carModel(kit, colour)
    this.group = this.parts.group
    this.position.set(x, z)
    this.heading = heading
    this.y = groundHeight(x, z)
    this.sync(0)
  }

  /** Signed speed along the heading (units per second). */
  get forwardSpeed(): number {
    return this.velocity.x * Math.sin(this.heading) + this.velocity.y * Math.cos(this.heading)
  }

  update(dt: number, input: DriveInput) {
    const sin = Math.sin(this.heading)
    const cos = Math.cos(this.heading)
    // Forward is (sin, cos); the car's right is (-cos, sin).
    let vf = this.velocity.x * sin + this.velocity.y * cos
    let vl = this.velocity.x * -cos + this.velocity.y * sin

    const t = input.throttle
    if (t > 0.05) {
      if (vf < -0.5) vf = Math.min(0, vf + BRAKE * t * dt)
      else vf += ACCEL * t * (1 - Math.max(0, vf) / MAX_SPEED) * dt
    } else if (t < -0.05) {
      if (vf > 0.5) vf = Math.max(0, vf + BRAKE * t * dt)
      else vf = Math.max(-MAX_REVERSE, vf + REVERSE_ACCEL * t * dt)
    } else {
      vf -= Math.sign(vf) * Math.min(Math.abs(vf), ROLL_DRAG * dt)
    }
    vf -= vf * Math.abs(vf) * AIR_DRAG * dt
    if (input.handbrake) vf -= Math.sign(vf) * Math.min(Math.abs(vf), HANDBRAKE_DECEL * dt)

    // Steering eases in, and less lock is available at speed.
    const lock = MAX_STEER / (1 + Math.abs(vf) / 16)
    const want = input.steer * lock
    this.steerAngle += (want - this.steerAngle) * Math.min(1, dt * 8)
    let yaw = (vf * Math.tan(this.steerAngle)) / WHEELBASE
    if (input.handbrake && Math.abs(vf) > 4) yaw *= 1.45
    // Steering right (positive) turns toward the car's right, which is a negative turn around y.
    this.heading -= yaw * dt

    vl *= Math.exp(-dt * (input.handbrake ? SLIDE_GRIP : GRIP))
    const s2 = Math.sin(this.heading)
    const c2 = Math.cos(this.heading)
    this.velocity.set(s2 * vf + -c2 * vl, c2 * vf + s2 * vl)

    this.position.addScaledVector(this.velocity, dt)
    this.collide()
    this.sync(dt)
  }

  /** Lets the car coast to a stop (used while the driver is out or a dialog is open). */
  idle(dt: number) {
    this.update(dt, { throttle: 0, steer: 0, handbrake: true })
  }

  private collide() {
    this.impact = 0
    const sin = Math.sin(this.heading)
    const cos = Math.cos(this.heading)
    let px = 0
    let pz = 0
    for (const off of HULL) {
      const p = { x: this.position.x + sin * off, z: this.position.y + cos * off }
      const [dx, dz] = resolveCircle(p, HULL_RADIUS)
      if (dx || dz) {
        this.position.x += dx
        this.position.y += dz
        px += dx
        pz += dz
      }
    }
    const len = Math.hypot(px, pz)
    if (len < 1e-5) return
    const nx = px / len
    const nz = pz / len
    const vn = this.velocity.x * nx + this.velocity.y * nz
    if (vn < 0) {
      // Bounce a little off the wall and scrub some speed.
      this.velocity.x -= 1.3 * vn * nx
      this.velocity.y -= 1.3 * vn * nz
      this.velocity.multiplyScalar(0.82)
      this.impact = Math.min(1, -vn / 14)
    }
  }

  private sync(dt: number) {
    const ground = groundHeight(this.position.x, this.position.y)
    this.y += (ground - this.y) * Math.min(1, dt * 12 || 1)
    this.group.position.set(this.position.x, this.y, this.position.y)
    this.group.rotation.y = this.heading
    const vf = this.forwardSpeed
    for (const w of this.parts.wheels) w.rotation.x += (vf * dt) / WHEEL_RADIUS
    for (const p of this.parts.steer) p.rotation.y = -this.steerAngle
    // A touch of body roll into turns.
    const body = this.group.children[0]
    body.rotation.z += ((this.steerAngle * Math.min(1, Math.abs(vf) / 18)) * 0.12 - body.rotation.z) * Math.min(1, dt * 6)
  }

  /** The driver's door side (left of the car), for getting out. */
  doorPoint(): [number, number] {
    const sin = Math.sin(this.heading)
    const cos = Math.cos(this.heading)
    // Left is the negative of the right vector (-cos, sin).
    return [this.position.x + cos * 1.9, this.position.y - sin * 1.9]
  }

  /** Distance from (x, z) to the car's body outline (roughly). */
  distanceTo(x: number, z: number): number {
    const sin = Math.sin(this.heading)
    const cos = Math.cos(this.heading)
    const dx = x - this.position.x
    const dz = z - this.position.y
    const along = dx * sin + dz * cos
    const side = dx * -cos + dz * sin
    const ax = Math.max(0, Math.abs(along) - 2.25)
    const sx = Math.max(0, Math.abs(side) - 1)
    return Math.hypot(ax, sx)
  }
}
