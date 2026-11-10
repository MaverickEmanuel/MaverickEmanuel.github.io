/**
 * Input: WASD / arrow keys, Space to jump, E to use a station, click or tap
 * to walk, the on-screen joystick (touch devices only, see CityShell.astro),
 * drag to orbit the follow camera, wheel or pinch to zoom.
 *
 * Keys are read from window but ignored while a dialog is open, while focus
 * is in a text field, or with Ctrl/Cmd/Alt held, so Tab, typing and browser
 * shortcuts are never hijacked. Space is also left alone while focus is on a
 * button or link, so it still presses them.
 */

export interface Orbit {
  /** Around the player, radians. 0 puts the camera on the +z side. */
  azimuth: number
  /** From straight down (0) toward the horizon, radians. */
  polar: number
  distance: number
}

export const ORBIT_LIMITS = {
  polarMin: 0.45,
  polarMax: 1.4,
  distanceMin: 10,
  distanceMax: 50,
}

interface ControlsOptions {
  canvas: HTMLCanvasElement
  /** True while keyboard movement must be ignored (e.g. a dialog is open). */
  isBlocked: () => boolean
  /** A click or tap that was not a drag, in client coordinates. */
  onTap: (clientX: number, clientY: number) => void
  onInteract: () => void
  onJump: () => void
  /** First real input of the session (used to fade the hint). */
  onFirstInput: () => void
}

const KEY_DIRS: Record<string, [number, number]> = {
  KeyW: [0, 1],
  ArrowUp: [0, 1],
  KeyS: [0, -1],
  ArrowDown: [0, -1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || !el.tagName) return false
  return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)
}

/** Elements that Space activates on their own. */
function isPressTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || !el.closest) return false
  return !!el.closest("button, a[href], summary, [role='button'], [role='link'], [role='checkbox']")
}

/** Joystick input below this (fraction of full tilt) counts as none. */
const STICK_DEAD_ZONE = 0.15

export class Controls {
  readonly orbit: Orbit = { azimuth: 0, polar: 0.95, distance: 36 }
  private pressed = new Set<string>()
  private pointers = new Map<number, { x: number; y: number }>()
  private dragStart: { x: number; y: number } | null = null
  private dragged = false
  private pinchDistance = 0
  private started = false
  /** Joystick tilt as [right, forward], length 0..1. */
  private stick: [number, number] = [0, 0]
  private stickPointer: number | null = null
  private cleanups: Array<() => void> = []

  constructor(private opts: ControlsOptions) {
    const { canvas } = opts
    this.listen(window, "keydown", (e) => this.onKeyDown(e as KeyboardEvent))
    this.listen(window, "keyup", (e) => this.pressed.delete((e as KeyboardEvent).code))
    this.listen(window, "blur", () => this.pressed.clear())
    this.listen(canvas, "pointerdown", (e) => this.onPointerDown(e as PointerEvent))
    this.listen(canvas, "pointermove", (e) => this.onPointerMove(e as PointerEvent))
    this.listen(canvas, "pointerup", (e) => this.onPointerUp(e as PointerEvent))
    this.listen(canvas, "pointercancel", (e) => this.endPointer(e as PointerEvent))
    this.listen(canvas, "wheel", (e) => this.onWheel(e as WheelEvent), { passive: false })
    this.listen(canvas, "contextmenu", (e) => e.preventDefault())
  }

  private listen(
    target: EventTarget,
    type: string,
    handler: (e: Event) => void,
    options?: AddEventListenerOptions
  ) {
    target.addEventListener(type, handler, options)
    this.cleanups.push(() => target.removeEventListener(type, handler, options))
  }

  private firstInput() {
    if (this.started) return
    this.started = true
    this.opts.onFirstInput()
  }

  private onKeyDown(e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey) return
    if (this.opts.isBlocked() || isTypingTarget(e.target)) {
      this.pressed.clear()
      return
    }
    if (e.code in KEY_DIRS) {
      this.pressed.add(e.code)
      this.firstInput()
      e.preventDefault()
    } else if (e.code === "KeyE" && !e.repeat) {
      this.opts.onInteract()
    } else if (e.code === "Space" && !isPressTarget(e.target)) {
      e.preventDefault()
      if (!e.repeat) {
        this.firstInput()
        this.opts.onJump()
      }
    }
  }

  /**
   * Drives the on-screen joystick: `base` is the round pad, `knob` the thumb
   * that follows the finger (clamped to the pad). Movement is analog.
   */
  attachJoystick(base: HTMLElement, knob: HTMLElement) {
    const update = (e: PointerEvent) => {
      const rect = base.getBoundingClientRect()
      const radius = (rect.width - knob.offsetWidth) / 2 || rect.width / 2
      let dx = e.clientX - (rect.left + rect.width / 2)
      let dy = e.clientY - (rect.top + rect.height / 2)
      const len = Math.hypot(dx, dy)
      if (len > radius) {
        dx *= radius / len
        dy *= radius / len
      }
      knob.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`
      const tilt = Math.min(1, len / radius)
      if (tilt < STICK_DEAD_ZONE) {
        this.stick = [0, 0]
      } else {
        // Same direction, rescaled so the dead-zone edge is 0 and full tilt is 1.
        const k = (tilt - STICK_DEAD_ZONE) / (1 - STICK_DEAD_ZONE) / tilt
        this.stick = [(dx / radius) * k, (-dy / radius) * k]
      }
    }
    const release = (e: PointerEvent) => {
      if (e.pointerId !== this.stickPointer) return
      this.stickPointer = null
      this.stick = [0, 0]
      knob.style.transform = ""
      base.classList.remove("is-active")
    }
    this.listen(base, "pointerdown", (event) => {
      const e = event as PointerEvent
      if (this.stickPointer !== null || this.opts.isBlocked()) return
      e.preventDefault()
      base.setPointerCapture(e.pointerId)
      this.stickPointer = e.pointerId
      base.classList.add("is-active")
      this.firstInput()
      update(e)
    })
    this.listen(base, "pointermove", (event) => {
      const e = event as PointerEvent
      if (e.pointerId === this.stickPointer) update(e)
    })
    this.listen(base, "pointerup", (e) => release(e as PointerEvent))
    this.listen(base, "pointercancel", (e) => release(e as PointerEvent))
    this.listen(base, "lostpointercapture", (e) => release(e as PointerEvent))
    this.listen(base, "contextmenu", (e) => e.preventDefault())
    this.cleanups.push(() => {
      this.stick = [0, 0]
      this.stickPointer = null
      knob.style.transform = ""
      base.classList.remove("is-active")
    })
  }

  /**
   * Movement as [right, forward]: the keys (normalised, they win when held)
   * or else the joystick (analog, length 0..1).
   */
  moveVector(): [number, number] {
    const [kx, ky] = this.keyVector()
    if (kx || ky) {
      const len = Math.hypot(kx, ky)
      return [kx / len, ky / len]
    }
    if (this.opts.isBlocked()) return [0, 0]
    return this.stick
  }

  /** Keyboard movement as [right, forward], each -1..1 (not normalised). */
  keyVector(): [number, number] {
    if (this.opts.isBlocked()) {
      this.pressed.clear()
      return [0, 0]
    }
    let x = 0
    let y = 0
    for (const code of this.pressed) {
      x += KEY_DIRS[code][0]
      y += KEY_DIRS[code][1]
    }
    return [Math.sign(x), Math.sign(y)]
  }

  private onPointerDown(e: PointerEvent) {
    if (e.button !== 0 && e.pointerType === "mouse") return
    this.opts.canvas.setPointerCapture(e.pointerId)
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (this.pointers.size === 1) {
      this.dragStart = { x: e.clientX, y: e.clientY }
      this.dragged = false
    } else if (this.pointers.size === 2) {
      this.dragged = true
      this.pinchDistance = this.currentPinch()
    }
  }

  private currentPinch(): number {
    const [a, b] = [...this.pointers.values()]
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  private onPointerMove(e: PointerEvent) {
    const prev = this.pointers.get(e.pointerId)
    if (!prev) return
    const dx = e.clientX - prev.x
    const dy = e.clientY - prev.y
    prev.x = e.clientX
    prev.y = e.clientY
    if (this.pointers.size >= 2) {
      const d = this.currentPinch()
      if (this.pinchDistance > 0 && d > 0) this.zoomBy(this.pinchDistance / d)
      this.pinchDistance = d
      return
    }
    if (!this.dragStart) return
    if (!this.dragged && Math.hypot(e.clientX - this.dragStart.x, e.clientY - this.dragStart.y) > 6) {
      this.dragged = true
      this.firstInput()
    }
    if (this.dragged) {
      this.orbit.azimuth -= dx * 0.006
      this.orbit.polar = clamp(this.orbit.polar - dy * 0.005, ORBIT_LIMITS.polarMin, ORBIT_LIMITS.polarMax)
    }
  }

  private onPointerUp(e: PointerEvent) {
    const wasSingle = this.pointers.size === 1
    this.endPointer(e)
    if (wasSingle && !this.dragged) {
      this.firstInput()
      this.opts.onTap(e.clientX, e.clientY)
    }
  }

  private endPointer(e: PointerEvent) {
    this.pointers.delete(e.pointerId)
    if (this.pointers.size === 0) this.dragStart = null
    if (this.pointers.size < 2) this.pinchDistance = 0
  }

  private onWheel(e: WheelEvent) {
    e.preventDefault()
    this.zoomBy(1 + Math.max(-0.25, Math.min(0.25, e.deltaY * 0.0012)))
  }

  private zoomBy(factor: number) {
    this.orbit.distance = clamp(this.orbit.distance * factor, ORBIT_LIMITS.distanceMin, ORBIT_LIMITS.distanceMax)
  }

  dispose() {
    this.cleanups.forEach((fn) => fn())
    this.cleanups = []
    this.pressed.clear()
    this.pointers.clear()
  }
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}
