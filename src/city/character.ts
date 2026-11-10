/**
 * The player: an original blocky figure built from boxes (legs, torso, arms,
 * head, cap). Limbs hang from pivot groups at the hips and shoulders so a
 * walk cycle is just a rotation. Its front faces local +z.
 */
import * as THREE from "three"
import type { Kit } from "./models"

const SKIN = "#e2b48c"
const SHIRT = "#2f6b70"
const PANTS = "#2e2a36"
const CAP = "#e2552b"
const SHOES = "#f1ece2"

export class Character {
  readonly group = new THREE.Group()
  private body = new THREE.Group()
  private legs: THREE.Group[] = []
  private arms: THREE.Group[] = []
  private head: THREE.Group
  private phase = 0
  private swing = 0
  /** 0 on the ground, 1 fully in the jump pose. */
  private airBlend = 0

  constructor(kit: Kit) {
    const unit = kit.geo("box", () => new THREE.BoxGeometry(1, 1, 1))
    const part = (colour: string, size: [number, number, number], pos: [number, number, number]) => {
      const m = new THREE.Mesh(unit, kit.mat(colour))
      m.scale.set(...size)
      m.position.set(...pos)
      m.castShadow = true
      return m
    }

    for (const side of [-1, 1]) {
      const hip = new THREE.Group()
      hip.position.set(side * 0.19, 0.82, 0)
      hip.add(part(PANTS, [0.3, 0.68, 0.32], [0, -0.34, 0]))
      hip.add(part(SHOES, [0.32, 0.16, 0.4], [0, -0.74, 0.04]))
      this.legs.push(hip)
      this.body.add(hip)

      const shoulder = new THREE.Group()
      shoulder.position.set(side * 0.52, 1.52, 0)
      shoulder.add(part(SHIRT, [0.24, 0.42, 0.28], [0, -0.18, 0]))
      shoulder.add(part(SKIN, [0.22, 0.34, 0.24], [0, -0.55, 0]))
      this.arms.push(shoulder)
      this.body.add(shoulder)
    }

    this.body.add(part(SHIRT, [0.8, 0.78, 0.44], [0, 1.2, 0]))
    this.body.add(part(PANTS, [0.82, 0.12, 0.46], [0, 0.85, 0]))

    this.head = new THREE.Group()
    this.head.position.set(0, 1.62, 0)
    this.head.add(part(SKIN, [0.58, 0.56, 0.54], [0, 0.31, 0]))
    this.head.add(part(CAP, [0.64, 0.16, 0.6], [0, 0.62, -0.01]))
    this.head.add(part(CAP, [0.56, 0.05, 0.28], [0, 0.56, 0.38]))
    for (const side of [-1, 1]) {
      this.head.add(part(SHOES, [0.08, 0.1, 0.02], [side * 0.13, 0.33, 0.275]))
    }
    this.body.add(this.head)
    this.group.add(this.body)
  }

  /**
   * Advances the walk cycle. `speed` is the current ground speed in units per
   * second (0 when idle); `time` is the running clock in seconds; `airborne`
   * blends in the jump pose (arms out, one knee up).
   */
  update(dt: number, speed: number, time: number, airborne = false) {
    const moving = Math.min(1, speed / 5)
    this.swing += (moving - this.swing) * Math.min(1, dt * 10)
    this.phase += dt * (4 + speed * 1.3)
    const s = Math.sin(this.phase) * Math.min(0.95, 0.55 + speed * 0.035) * this.swing
    this.legs[0].rotation.x = s
    this.legs[1].rotation.x = -s
    this.arms[0].rotation.x = -s * 0.9
    this.arms[1].rotation.x = s * 0.9
    // Lean into a sprint.
    this.body.rotation.x += (Math.min(1, Math.max(0, speed - 7) / 4) * 0.22 - this.body.rotation.x) * Math.min(1, dt * 8)
    const idle = (1 - this.swing) * Math.sin(time * 2) * 0.02
    this.body.position.y = Math.abs(Math.sin(this.phase)) * 0.09 * this.swing + idle
    this.head.rotation.z = Math.sin(this.phase * 0.5) * 0.04 * this.swing

    this.airBlend += ((airborne ? 1 : 0) - this.airBlend) * Math.min(1, dt * 14)
    const a = this.airBlend
    if (a > 0.001) {
      this.legs[0].rotation.x += (-0.6 - this.legs[0].rotation.x) * a
      this.legs[1].rotation.x += (0.3 - this.legs[1].rotation.x) * a
      this.arms[0].rotation.x *= 1 - a
      this.arms[1].rotation.x *= 1 - a
    }
    // Arms swing out sideways (left arm is index 0, on -x).
    this.arms[0].rotation.z = -0.9 * a
    this.arms[1].rotation.z = 0.9 * a
  }
}
