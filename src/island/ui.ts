/**
 * DOM side of the island: station chips, the "Press E / Tap to open" prompt,
 * floating labels, the control hint, the sound toggles, the welcome card and
 * the content dialog (with Prev / Next, visited progress and, on phones, a
 * swipe-down bottom sheet).
 *
 * All of this markup is server-rendered by IslandShell.astro (content comes
 * from src/content/site.ts via <template id="island-panel-{id}">); this module
 * only wires it up. Listeners are bound with an AbortSignal so dispose()
 * leaves the DOM ready for the next start.
 *
 * Storage (localStorage): "island-welcomed" ("1" once the welcome card was
 * dismissed) and "island-visited" (JSON list of opened landmark ids).
 */
import type { IslandAudio } from "./audio"
import { landmarks, type Landmark } from "./landmarks"

interface HudOptions {
  audio: IslandAudio
  reducedMotion: boolean
  /** A station chip was chosen: move the player there (the panel opens too). */
  onStation: (id: string) => void
  /** Prev / Next moved the dialog to this landmark: move the player and camera there. */
  onBrowse: (id: string) => void
  /** The dialog opened on a landmark (camera frames it), or closed (null). */
  onFocus: (id: string | null) => void
}

const WELCOMED_KEY = "island-welcomed"
const VISITED_KEY = "island-visited"
/** Matches the close animations in global.css. */
const CLOSE_MS = 200

function load(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage unavailable (privacy modes): fine, it lasts for this page.
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || !el.tagName) return false
  return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT|VIDEO|AUDIO)$/.test(el.tagName) || el.getAttribute("role") === "slider"
}

export class Hud {
  private abort = new AbortController()
  private dialog: HTMLDialogElement
  private welcome: HTMLDialogElement
  private body: HTMLElement
  private prompt: HTMLButtonElement
  private promptName: HTMLElement[]
  private status: HTMLElement
  private hint: HTMLElement | null
  private labels = new Map<string, HTMLElement>()
  private nearby: Landmark | null = null
  private returnFocus: HTMLElement | null = null
  private hintTimer = 0
  private closeTimer = 0
  private current: Landmark | null = null
  private visited: Set<string>
  private icons = new Map<string, Element>()
  private live: HTMLElement

  constructor(private root: HTMLElement, private opts: HudOptions) {
    const signal = this.abort.signal
    const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!
    this.dialog = q<HTMLDialogElement>("[data-island-dialog]")
    this.welcome = q<HTMLDialogElement>("[data-welcome]")
    this.body = q("[data-dialog-body]")
    this.prompt = q<HTMLButtonElement>("[data-prompt]")
    this.promptName = [...root.querySelectorAll<HTMLElement>("[data-prompt-name]")]
    this.status = q("[data-status]")
    this.hint = root.querySelector("[data-hint]")
    root.querySelectorAll<HTMLElement>("[data-label]").forEach((el) => {
      this.labels.set(el.dataset.label!, el)
    })
    const iconTemplate = document.getElementById("island-icons") as HTMLTemplateElement | null
    iconTemplate?.content.querySelectorAll<HTMLElement>("[data-icon-for]").forEach((el) => {
      if (el.firstElementChild) this.icons.set(el.dataset.iconFor!, el.firstElementChild)
    })
    // A live region inside the dialog: the rest of the page is inert while it is open.
    this.live = document.createElement("p")
    this.live.className = "sr-only"
    this.live.setAttribute("aria-live", "polite")
    this.dialog.append(this.live)

    let visited: string[] = []
    try {
      visited = JSON.parse(load(VISITED_KEY) ?? "[]")
    } catch {
      visited = []
    }
    this.visited = new Set(visited.filter((id) => landmarks.some((l) => l.id === id)))
    this.renderProgress()

    // Station chips, the prompt and the title button.
    root.querySelectorAll<HTMLButtonElement>("[data-station]").forEach((chip) => {
      chip.addEventListener("click", () => opts.onStation(chip.dataset.station!), { signal })
    })
    this.prompt.addEventListener("click", () => this.openNearby(), { signal })
    root.querySelector("[data-open-welcome]")?.addEventListener("click", () => this.showWelcome(), { signal })

    // Dialog: close button, backdrop click, Esc (animated), Prev / Next.
    this.dialog.addEventListener("close", () => this.onClosed(), { signal })
    this.dialog.addEventListener(
      "cancel",
      (e) => {
        e.preventDefault()
        this.close()
      },
      { signal }
    )
    this.dialog.addEventListener(
      "click",
      (e) => {
        // A click on the backdrop lands on the <dialog> itself.
        if (e.target === this.dialog) this.close()
      },
      { signal }
    )
    q("[data-close]").addEventListener("click", () => this.close(), { signal })
    this.dialog.querySelectorAll<HTMLButtonElement>("[data-browse]").forEach((button) => {
      button.addEventListener("click", () => this.browse(Number(button.dataset.browse)), { signal })
    })
    this.dialog.addEventListener(
      "keydown",
      (e) => {
        if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault()
          if (!e.repeat) this.browse(e.key === "ArrowLeft" ? -1 : 1)
        }
      },
      { signal }
    )
    this.bindSwipe(signal)

    // Welcome card.
    q("[data-welcome-explore]").addEventListener("click", () => this.dismissWelcome(), { signal })
    this.welcome.addEventListener(
      "cancel",
      (e) => {
        e.preventDefault()
        this.dismissWelcome()
      },
      { signal }
    )
    this.welcome.addEventListener(
      "keydown",
      (e) => {
        // Enter dismisses from anywhere on the card except another button.
        if (e.key === "Enter" && !(e.target as HTMLElement).closest("button, a")) {
          e.preventDefault()
          this.dismissWelcome()
        }
      },
      { signal }
    )

    // Sound: top-bar toggle, the welcome card switch, and M.
    const toggles = [...root.querySelectorAll<HTMLButtonElement>("[data-sound-toggle], [data-sound-switch]")]
    toggles.forEach((button) =>
      button.addEventListener(
        "click",
        () => {
          opts.audio.toggle()
          opts.audio.click()
        },
        { signal }
      )
    )
    const syncSound = (muted: boolean) => {
      root.classList.toggle("is-muted", muted)
      for (const button of toggles) {
        if (button.hasAttribute("data-sound-switch")) button.setAttribute("aria-checked", String(!muted))
        else button.setAttribute("aria-pressed", String(!muted))
      }
    }
    syncSound(opts.audio.muted)
    const unsubscribe = opts.audio.onChange((muted) => {
      syncSound(muted)
      this.live.textContent = ""
      this.status.textContent = muted ? "Sound off" : "Sound on"
    })
    signal.addEventListener("abort", unsubscribe)
    window.addEventListener(
      "keydown",
      (e) => {
        if (e.code !== "KeyM" || e.repeat || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return
        opts.audio.toggle()
        opts.audio.click()
      },
      { signal }
    )
    // Returning visitors skip the welcome card: their first click or key starts the sound.
    const unlock = () => opts.audio.unlock()
    window.addEventListener("pointerdown", unlock, { signal, capture: true })
    window.addEventListener("keydown", unlock, { signal, capture: true })

    // UI clicks (the dialog's own open/close sounds cover its open and close).
    root.addEventListener(
      "click",
      (e) => {
        const button = (e.target as HTMLElement).closest(
          "[data-station], [data-browse], [data-theme-toggle], [data-open-welcome], [data-view-switch]"
        )
        if (button) opts.audio.click()
      },
      { signal }
    )

    if (this.hint) {
      this.hint.classList.remove("is-faded")
      this.hintTimer = window.setTimeout(() => this.fadeHint(), 9000)
    }
  }

  get dialogOpen(): boolean {
    return this.dialog.open || this.welcome.open
  }

  /** Shows the welcome card on a first visit. Returns true if it opened. */
  welcomeIfNew(): boolean {
    if (load(WELCOMED_KEY) === "1") return false
    this.showWelcome()
    return true
  }

  showWelcome() {
    if (this.welcome.open) return
    if (this.dialog.open) this.close()
    const active = document.activeElement as HTMLElement | null
    this.returnFocus = active && active !== document.body ? active : null
    this.welcome.classList.remove("is-closing")
    this.welcome.showModal()
    this.welcome.querySelector<HTMLElement>("[data-welcome-explore]")?.focus()
  }

  dismissWelcome() {
    save(WELCOMED_KEY, "1")
    // Explore is the gesture that may start the sound.
    this.opts.audio.unlock()
    this.animateClose(this.welcome, () => {
      const target = this.returnFocus
      this.returnFocus = null
      if (target && target.isConnected && target.offsetParent !== null) target.focus({ preventScroll: true })
      else this.root.focus({ preventScroll: true })
    })
  }

  /** Closes `dialog` after its closing animation (at once with reduced motion). */
  private animateClose(dialog: HTMLDialogElement, after?: () => void) {
    if (!dialog.open || dialog.classList.contains("is-closing")) return
    const done = () => {
      dialog.classList.remove("is-closing")
      dialog.style.removeProperty("--drag")
      if (dialog.open) dialog.close()
      after?.()
    }
    if (this.opts.reducedMotion) return done()
    dialog.classList.add("is-closing")
    window.clearTimeout(this.closeTimer)
    this.closeTimer = window.setTimeout(done, CLOSE_MS)
  }

  /** Opens the panel for a station in the dialog. */
  open(id: string) {
    const template = document.getElementById(`island-panel-${id}`) as HTMLTemplateElement | null
    const lm = landmarks.find((l) => l.id === id)
    if (!template || !lm) return
    if (this.welcome.open) {
      save(WELCOMED_KEY, "1")
      this.welcome.close()
    }
    // Re-opening during the close animation: cancel it.
    if (this.dialog.classList.contains("is-closing")) {
      window.clearTimeout(this.closeTimer)
      this.dialog.classList.remove("is-closing")
    }
    const wasOpen = this.dialog.open
    if (!wasOpen) {
      const active = document.activeElement as HTMLElement | null
      this.returnFocus = active && active !== document.body ? active : null
    }
    this.show(lm, template)
    if (!wasOpen) {
      this.dialog.showModal()
      this.opts.audio.popupOpen()
    }
    this.opts.onFocus(id)
    // Start on the panel heading, so screen readers hear the title first and
    // the first Tab reaches the first link (the close button is before it).
    const heading = this.body.querySelector<HTMLElement>("#island-dialog-title")
    heading?.focus({ preventScroll: true })
  }

  private show(lm: Landmark, template: HTMLTemplateElement) {
    this.current = lm
    this.body.replaceChildren(template.content.cloneNode(true))
    this.body.scrollTop = 0
    this.dialog.dataset.panel = lm.id
    this.dialog.style.setProperty("--lm", lm.accent)
    this.dialog.querySelector("[data-dialog-place]")!.textContent = lm.label
    this.dialog.querySelector("[data-dialog-section]")!.textContent = lm.section
    const badge = this.dialog.querySelector("[data-dialog-badge]")!
    const icon = this.icons.get(lm.id)
    badge.replaceChildren(...(icon ? [icon.cloneNode(true)] : []))
    const index = landmarks.indexOf(lm)
    for (const dir of [-1, 1]) {
      const other = landmarks[(index + dir + landmarks.length) % landmarks.length]
      const button = this.dialog.querySelector<HTMLButtonElement>(`[data-browse="${dir}"]`)!
      button.setAttribute("aria-label", `${dir < 0 ? "Previous" : "Next"}: ${other.label}`)
      button.style.setProperty("--lm", other.accent)
      this.dialog.querySelector(`[data-browse-label="${dir}"]`)!.textContent = other.label
    }
    this.visited.add(lm.id)
    save(VISITED_KEY, JSON.stringify([...this.visited]))
    this.renderProgress()
  }

  /** Moves the open dialog to the previous (-1) or next (1) landmark. */
  browse(dir: number) {
    if (!this.dialog.open || !this.current || this.dialog.classList.contains("is-closing")) return
    const index = landmarks.indexOf(this.current)
    const lm = landmarks[(index + dir + landmarks.length) % landmarks.length]
    const template = document.getElementById(`island-panel-${lm.id}`) as HTMLTemplateElement | null
    if (!template) return
    this.show(lm, template)
    // Restart the swap animation.
    this.dialog.classList.remove("is-swapping", "from-left", "from-right")
    void this.dialog.offsetWidth
    this.dialog.classList.add("is-swapping", dir < 0 ? "from-left" : "from-right")
    this.live.textContent = `${lm.label}, ${lm.section}`
    this.opts.onBrowse(lm.id)
    this.opts.onFocus(lm.id)
  }

  private renderProgress() {
    const count = this.visited.size
    const total = landmarks.length
    const text = this.root.querySelector("[data-progress]")
    if (text) text.textContent = count >= total ? `All ${total} explored. Thanks for looking around!` : `${count} / ${total} explored`
    this.root.querySelectorAll<HTMLElement>("[data-dot]").forEach((dot) => {
      dot.classList.toggle("is-visited", this.visited.has(dot.dataset.dot!))
      dot.classList.toggle("is-current", dot.dataset.dot === this.current?.id)
    })
    this.root.querySelectorAll<HTMLElement>("[data-visited-tick]").forEach((tick) => {
      tick.hidden = !this.visited.has(tick.dataset.visitedTick!)
    })
  }

  openNearby() {
    if (this.nearby && !this.dialogOpen) this.open(this.nearby.id)
  }

  close() {
    if (!this.dialog.open || this.dialog.classList.contains("is-closing")) return
    this.opts.audio.popupClose()
    this.opts.onFocus(null)
    this.animateClose(this.dialog)
  }

  private onClosed() {
    window.clearTimeout(this.closeTimer)
    this.dialog.classList.remove("is-closing", "is-swapping", "from-left", "from-right")
    // Stop any media and drop the cloned content.
    this.body.replaceChildren()
    delete this.dialog.dataset.panel
    this.current = null
    this.renderProgress()
    this.opts.onFocus(null)
    const target = this.returnFocus
    this.returnFocus = null
    if (target && target.isConnected && target.offsetParent !== null) target.focus({ preventScroll: true })
    else this.root.focus({ preventScroll: true })
  }

  /** Phones: drag the sheet's handle or header down to close it. */
  private bindSwipe(signal: AbortSignal) {
    const narrow = matchMedia("(max-width: 640px)")
    let startY = 0
    let startT = 0
    let pointer: number | null = null
    let dy = 0
    const areas = this.dialog.querySelectorAll<HTMLElement>("[data-drag-handle], [data-drag-area]")
    const end = (e: PointerEvent) => {
      if (e.pointerId !== pointer) return
      pointer = null
      this.dialog.classList.remove("is-dragging")
      const speed = dy / Math.max(1, performance.now() - startT)
      if (dy > 90 || (dy > 24 && speed > 0.6)) {
        this.close()
      } else {
        this.dialog.style.removeProperty("--drag")
      }
    }
    areas.forEach((area) => {
      area.addEventListener(
        "pointerdown",
        (e) => {
          if (!narrow.matches || pointer !== null || (e.target as HTMLElement).closest("button")) return
          pointer = e.pointerId
          startY = e.clientY
          startT = performance.now()
          dy = 0
          area.setPointerCapture(e.pointerId)
          this.dialog.classList.add("is-dragging")
        },
        { signal }
      )
      area.addEventListener(
        "pointermove",
        (e) => {
          if (e.pointerId !== pointer) return
          dy = Math.max(0, e.clientY - startY)
          this.dialog.style.setProperty("--drag", `${dy}px`)
        },
        { signal }
      )
      area.addEventListener("pointerup", end, { signal })
      area.addEventListener("pointercancel", end, { signal })
    })
  }

  /** Shows or hides the "open" prompt for the station the player is standing at. */
  setNearby(landmark: Landmark | null) {
    if (landmark === this.nearby) return
    this.nearby = landmark
    if (landmark) {
      this.promptName.forEach((el) => (el.textContent = landmark.label))
      this.prompt.style.setProperty("--lm", landmark.accent)
      const badge = this.prompt.querySelector("[data-prompt-badge]")!
      const icon = this.icons.get(landmark.id)
      badge.replaceChildren(...(icon ? [icon.cloneNode(true)] : []))
      this.prompt.hidden = false
      this.status.textContent = `At ${landmark.label}. Press E or use the Open button to read ${landmark.section}.`
      if (!this.dialogOpen) this.opts.audio.arrive()
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
    window.clearTimeout(this.closeTimer)
    this.abort.abort()
    this.returnFocus = null
    for (const d of [this.dialog, this.welcome]) {
      d.classList.remove("is-closing", "is-dragging", "is-swapping", "from-left", "from-right")
      d.style.removeProperty("--drag")
      if (d.open) d.close()
    }
    this.live.remove()
    this.body.replaceChildren()
    this.prompt.hidden = true
    this.status.textContent = ""
    this.root.classList.remove("is-muted")
  }
}
