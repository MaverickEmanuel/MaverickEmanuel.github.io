/**
 * DOM side of the city: station chips, the "Press E / Tap to open" prompt,
 * floating labels, the control hint and the content dialog.
 *
 * All of this markup is server-rendered by CityShell.astro (content comes
 * from src/content/site.ts via <template id="city-panel-{id}">); this module
 * only wires it up. Listeners are bound with an AbortSignal so dispose()
 * leaves the DOM ready for the next start.
 */
import type { Landmark } from "./landmarks"

interface HudOptions {
  /** A station chip was chosen: move the player there, then open its panel. */
  onStation: (id: string) => void
}

export class Hud {
  private abort = new AbortController()
  private dialog: HTMLDialogElement
  private body: HTMLElement
  private prompt: HTMLButtonElement
  private promptName: HTMLElement[]
  private status: HTMLElement
  private hint: HTMLElement | null
  private labels = new Map<string, HTMLElement>()
  private nearby: Landmark | null = null
  private returnFocus: HTMLElement | null = null
  private hintTimer = 0

  constructor(private root: HTMLElement, opts: HudOptions) {
    const signal = this.abort.signal
    const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!
    this.dialog = q<HTMLDialogElement>("[data-city-dialog]")
    this.body = q("[data-dialog-body]")
    this.prompt = q<HTMLButtonElement>("[data-prompt]")
    this.promptName = [...root.querySelectorAll<HTMLElement>("[data-prompt-name]")]
    this.status = q("[data-status]")
    this.hint = root.querySelector("[data-hint]")
    root.querySelectorAll<HTMLElement>("[data-label]").forEach((el) => {
      this.labels.set(el.dataset.label!, el)
    })

    root.querySelectorAll<HTMLButtonElement>("[data-station]").forEach((chip) => {
      chip.addEventListener("click", () => opts.onStation(chip.dataset.station!), { signal })
    })
    root.querySelectorAll<HTMLButtonElement>("[data-open-panel]").forEach((button) => {
      button.addEventListener("click", () => this.open(button.dataset.openPanel!), { signal })
    })
    this.prompt.addEventListener("click", () => this.openNearby(), { signal })

    this.dialog.addEventListener("close", () => this.onClosed(), { signal })
    this.dialog.addEventListener(
      "click",
      (e) => {
        // A click on the backdrop lands on the <dialog> itself.
        if (e.target === this.dialog) this.dialog.close()
      },
      { signal }
    )
    this.dialog
      .querySelector("[data-close]")!
      .addEventListener("click", () => this.dialog.close(), { signal })

    if (this.hint) {
      this.hint.classList.remove("is-faded")
      this.hintTimer = window.setTimeout(() => this.fadeHint(), 9000)
    }
  }

  get dialogOpen(): boolean {
    return this.dialog.open
  }

  /** Opens the panel for a station (or "intro") in the dialog. */
  open(id: string) {
    const template = document.getElementById(`city-panel-${id}`) as HTMLTemplateElement | null
    if (!template) return
    if (!this.dialog.open) {
      const active = document.activeElement as HTMLElement | null
      this.returnFocus = active && active !== document.body ? active : null
    }
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
    if (this.nearby && !this.dialog.open) this.open(this.nearby.id)
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

  /** Shows or hides the "open" prompt for the station the player is standing at. */
  setNearby(landmark: Landmark | null) {
    if (landmark === this.nearby) return
    this.nearby = landmark
    if (landmark) {
      this.promptName.forEach((el) => (el.textContent = landmark.label))
      this.prompt.hidden = false
      this.status.textContent = `At ${landmark.label}. Press E or use the Open button to read ${landmark.section}.`
    } else {
      this.prompt.hidden = true
      this.status.textContent = ""
    }
  }

  /** Places a floating label at screen position (x, y) in CSS pixels. */
  placeLabel(id: string, x: number, y: number, visible: boolean, near: boolean) {
    const el = this.labels.get(id)
    if (!el) return
    if (!visible) {
      el.style.visibility = "hidden"
      return
    }
    el.style.visibility = ""
    el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%)`
    el.classList.toggle("is-near", near)
  }

  fadeHint() {
    window.clearTimeout(this.hintTimer)
    this.hint?.classList.add("is-faded")
  }

  dispose() {
    window.clearTimeout(this.hintTimer)
    this.abort.abort()
    if (this.dialog.open) {
      this.returnFocus = null
      this.dialog.close()
    }
    this.body.replaceChildren()
    this.prompt.hidden = true
    this.status.textContent = ""
  }
}
