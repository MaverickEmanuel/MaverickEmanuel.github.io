/**
 * DOM side of the city: the phone, the objective card ("Press E to enter"),
 * the car prompt, the GPS chip, the speedometer, the floating place markers,
 * the control hint and the content dialog.
 *
 * All of this markup is server-rendered by CityShell.astro (content comes
 * from src/content/site.ts via <template id="city-panel-{id}">); this module
 * only wires it up. Listeners are bound with an AbortSignal so dispose()
 * leaves the DOM ready for the next start.
 */
import { landmarks, type Landmark } from "./landmarks"

interface HudOptions {
  /** A place was chosen (phone): move the player there, then open its panel. */
  onStation: (id: string) => void
  /** Set (or clear, with null) the GPS waypoint. */
  onWaypoint: (id: string | null) => void
  /** The car prompt was pressed. */
  onCar: () => void
}

export type CarPrompt = "enter" | "exit" | null

export class Hud {
  private abort = new AbortController()
  private dialog: HTMLDialogElement
  private phone: HTMLDialogElement
  private body: HTMLElement
  private tag: HTMLElement
  private prompt: HTMLButtonElement
  private promptName: HTMLElement
  private promptSection: HTMLElement
  private carPrompt: HTMLButtonElement
  private carText: HTMLElement
  private gps: HTMLElement
  private gpsName: HTMLElement
  private gpsDist: HTMLElement
  private speed: HTMLElement
  private status: HTMLElement
  private hint: HTMLElement | null
  private clock: HTMLElement | null
  private labels = new Map<string, HTMLElement>()
  private labelWidths = new Map<string, number>()
  private nearby: Landmark | null = null
  private car: CarPrompt = null
  private returnFocus: HTMLElement | null = null
  private phoneReturn: HTMLElement | null = null
  private hintTimer = 0
  private lastSpeed = -1
  private lastDist = -1

  constructor(private root: HTMLElement, opts: HudOptions) {
    const signal = this.abort.signal
    const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!
    this.dialog = q<HTMLDialogElement>("[data-city-dialog]")
    this.phone = q<HTMLDialogElement>("[data-phone]")
    this.body = q("[data-dialog-body]")
    this.tag = q("[data-dialog-tag]")
    this.prompt = q<HTMLButtonElement>("[data-prompt]")
    this.promptName = q("[data-prompt-name]")
    this.promptSection = q("[data-prompt-section]")
    this.carPrompt = q<HTMLButtonElement>("[data-car-prompt]")
    this.carText = q("[data-car-prompt-text]")
    this.gps = q("[data-gps]")
    this.gpsName = q("[data-gps-name]")
    this.gpsDist = q("[data-gps-dist]")
    this.speed = q("[data-speed]")
    this.status = q("[data-status]")
    this.hint = root.querySelector("[data-hint]")
    this.clock = root.querySelector("[data-phone-clock]")
    root.querySelectorAll<HTMLElement>("[data-label]").forEach((el) => {
      this.labels.set(el.dataset.label!, el)
    })

    root.querySelectorAll<HTMLButtonElement>("[data-station]").forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          this.closePhone()
          opts.onStation(button.dataset.station!)
        },
        { signal }
      )
    })
    root.querySelectorAll<HTMLButtonElement>("[data-waypoint]").forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          this.closePhone()
          opts.onWaypoint(button.dataset.waypoint!)
        },
        { signal }
      )
    })
    root.querySelectorAll<HTMLButtonElement>("[data-open-panel]").forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          this.closePhone()
          this.open(button.dataset.openPanel!)
        },
        { signal }
      )
    })
    root.querySelector("[data-phone-open]")?.addEventListener("click", () => this.openPhone(), { signal })
    root.querySelector("[data-phone-close]")?.addEventListener("click", () => this.closePhone(), { signal })
    this.prompt.addEventListener("click", () => this.openNearby(), { signal })
    this.carPrompt.addEventListener("click", () => opts.onCar(), { signal })

    this.dialog.addEventListener("close", () => this.onClosed(), { signal })
    this.phone.addEventListener("close", () => this.onPhoneClosed(), { signal })
    for (const d of [this.dialog, this.phone]) {
      // A click on the backdrop lands on the <dialog> itself.
      d.addEventListener("click", (e) => e.target === d && d.close(), { signal })
    }
    this.dialog.querySelector("[data-close]")!.addEventListener("click", () => this.dialog.close(), { signal })

    if (this.hint) {
      this.hint.classList.remove("is-faded")
      this.hintTimer = window.setTimeout(() => this.fadeHint(), 12000)
    }
  }

  /** True while the content dialog or the phone is open (movement keys are ignored). */
  get dialogOpen(): boolean {
    return this.dialog.open || this.phone.open
  }

  /** Opens the panel for a place (or "intro") in the dialog. */
  open(id: string) {
    const template = document.getElementById(`city-panel-${id}`) as HTMLTemplateElement | null
    if (!template) return
    if (!this.dialog.open) {
      const active = document.activeElement as HTMLElement | null
      this.returnFocus = active && active !== document.body ? active : null
    }
    const lm = landmarks.find((l) => l.id === id)
    this.tag.textContent = lm ? `${lm.label} · ${lm.section}` : "About me"
    this.dialog.style.setProperty("--c", lm?.colour ?? "var(--primary)")
    this.body.replaceChildren(template.content.cloneNode(true))
    this.dialog.dataset.panel = id
    this.body.scrollTop = 0
    if (!this.dialog.open) this.dialog.showModal()
    // Start on the panel heading, so screen readers hear the title first and
    // the first Tab reaches the close button / first link.
    const heading = this.body.querySelector<HTMLElement>("#city-dialog-title")
    heading?.focus({ preventScroll: true })
  }

  openNearby() {
    if (this.nearby && !this.dialogOpen) this.open(this.nearby.id)
  }

  togglePhone() {
    if (this.phone.open) this.closePhone()
    else if (!this.dialog.open) this.openPhone()
  }

  private openPhone() {
    if (this.phone.open) return
    const active = document.activeElement as HTMLElement | null
    this.phoneReturn =
      active && active !== document.body && active !== this.root
        ? active
        : this.root.querySelector<HTMLElement>("[data-phone-open]")
    if (this.clock) {
      this.clock.textContent = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    }
    this.phone.showModal()
    this.phone.querySelector<HTMLElement>(".city-app-main")?.focus()
  }

  /**
   * Closes the phone and puts focus back right away. (The dialog's own
   * "close" event fires later, which would be too late when a panel opens
   * straight after: it would take the focus back from the panel.)
   */
  private closePhone() {
    if (!this.phone.open) return
    this.phone.close()
    this.onPhoneClosed()
  }

  /** Also runs on the "close" event (Escape, backdrop); a no-op if focus was already restored. */
  private onPhoneClosed() {
    const target = this.phoneReturn
    if (!target) return
    this.phoneReturn = null
    if (target.isConnected && target.offsetParent !== null) target.focus({ preventScroll: true })
    else this.root.focus({ preventScroll: true })
  }

  close() {
    if (this.dialog.open) this.dialog.close()
  }

  private onClosed() {
    // Stop any media and drop the cloned content.
    this.body.replaceChildren()
    delete this.dialog.dataset.panel
    const target = this.returnFocus
    this.returnFocus = null
    if (target && target.isConnected && target.offsetParent !== null) target.focus({ preventScroll: true })
    else this.root.focus({ preventScroll: true })
  }

  /** Shows or hides the objective card for the place the player is at. */
  setNearby(landmark: Landmark | null) {
    if (landmark === this.nearby) return
    this.nearby = landmark
    if (landmark) {
      this.promptName.textContent = landmark.label
      this.promptSection.textContent = landmark.section
      this.prompt.style.setProperty("--c", landmark.colour)
      this.prompt.hidden = false
      this.announce(`At ${landmark.label}. Press E or use the Enter button to read ${landmark.section}.`)
    } else {
      this.prompt.hidden = true
    }
  }

  /** Shows the "get in" / "get out" button, or hides it. */
  setCarPrompt(mode: CarPrompt) {
    if (mode === this.car) return
    this.car = mode
    this.carPrompt.hidden = mode === null
    if (mode === "enter") {
      this.carText.textContent = "Get in the car"
      this.announce("Next to the car. Press F or use the Get in button to drive.")
    } else if (mode === "exit") {
      this.carText.textContent = "Get out"
    }
  }

  setDriving(driving: boolean) {
    this.root.classList.toggle("is-driving", driving)
    this.announce(
      driving
        ? "Driving. W and S or the arrow keys to accelerate and brake, A and D to steer, Space for the handbrake, F to get out."
        : "On foot."
    )
  }

  /** Speedometer readout, in km/h (world units are roughly metres). */
  setSpeed(unitsPerSecond: number) {
    const kmh = Math.round(Math.abs(unitsPerSecond) * 3.6)
    if (kmh === this.lastSpeed) return
    this.lastSpeed = kmh
    this.speed.textContent = String(kmh)
  }

  /** The GPS chip under the minimap. */
  setWaypoint(landmark: Landmark | null, distance = 0) {
    if (!landmark) {
      if (!this.gps.hidden) this.gps.hidden = true
      this.lastDist = -1
      return
    }
    if (this.gps.hidden || this.gpsName.textContent !== landmark.label) {
      this.gps.hidden = false
      this.gpsName.textContent = landmark.label
      this.gps.style.setProperty("--c", landmark.colour)
    }
    const d = Math.round(distance)
    if (d !== this.lastDist) {
      this.lastDist = d
      this.gpsDist.textContent = `${d} m`
    }
  }

  announce(text: string) {
    this.status.textContent = text
  }

  /** Places a floating marker at screen position (x, y) in CSS pixels. */
  placeLabel(id: string, x: number, y: number, visible: boolean, near: boolean, target: boolean, far: boolean) {
    const el = this.labels.get(id)
    if (!el) return
    if (!visible) {
      el.style.visibility = "hidden"
      return
    }
    el.style.visibility = ""
    // Keep the whole label on screen (its width is measured once, on first show).
    let w = this.labelWidths.get(id)
    if (!w) {
      w = el.offsetWidth
      this.labelWidths.set(id, w)
    }
    x = Math.max(w / 2 + 6, Math.min(this.root.clientWidth - w / 2 - 6, x))
    el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%)`
    el.classList.toggle("is-near", near)
    el.classList.toggle("is-target", target)
    el.classList.toggle("is-far", far)
  }

  fadeHint() {
    window.clearTimeout(this.hintTimer)
    this.hintTimer = window.setTimeout(() => this.hint?.classList.add("is-faded"), 4000)
  }

  dispose() {
    window.clearTimeout(this.hintTimer)
    this.abort.abort()
    this.returnFocus = null
    this.phoneReturn = null
    if (this.dialog.open) this.dialog.close()
    if (this.phone.open) this.phone.close()
    this.body.replaceChildren()
    this.prompt.hidden = true
    this.carPrompt.hidden = true
    this.gps.hidden = true
    this.root.classList.remove("is-driving")
    this.status.textContent = ""
  }
}
