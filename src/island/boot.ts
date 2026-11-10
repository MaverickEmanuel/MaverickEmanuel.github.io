/**
 * View switching between the island (default) and the classic page. Tiny and
 * three.js-free: the island code (and three.js) is only fetched, with a
 * dynamic import(), when the island view is actually shown.
 *
 * The starting view is decided before first paint by the inline head script
 * in Base.astro (html.view-island / html.view-classic). This module then:
 *   - starts the island if html.view-island is set,
 *   - wires every [data-view-switch="island" | "classic"] button and stores
 *     the choice in localStorage ("view"),
 *   - falls back to classic, with a short note, if WebGL or the import fails
 *     (remembered for the session in sessionStorage "island-failed").
 */
import type { IslandSession } from "./index"

type View = "island" | "classic"

const html = document.documentElement
const island = document.getElementById("island")
const note = document.getElementById("island-note")
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)")

let session: IslandSession | null = null
/** Bumped on every switch, so a slow import never starts a stale island. */
let generation = 0

function setView(view: View) {
  html.classList.toggle("view-island", view === "island")
  html.classList.toggle("view-classic", view === "classic")
}

function store(key: string, value: string | null, storage: "local" | "session" = "local") {
  try {
    const s = storage === "local" ? localStorage : sessionStorage
    if (value === null) s.removeItem(key)
    else s.setItem(key, value)
  } catch {
    // Storage can be unavailable (privacy modes); the switch still works for this page.
  }
}

async function enterIsland(focusSwitch: boolean) {
  if (!island) return
  const gen = ++generation
  if (note) note.hidden = true
  island.classList.remove("is-ready")
  setView("island")
  window.scrollTo(0, 0)
  if (focusSwitch) island.querySelector<HTMLElement>('[data-view-switch="classic"]')?.focus()
  try {
    const { startIsland } = await import("./index")
    if (gen !== generation) return
    session = startIsland(island, { reducedMotion: reducedMotion.matches, onFatal: fail })
    island.classList.add("is-ready")
  } catch (error) {
    if (gen === generation) fail(error)
  }
}

function enterClassic(focusSwitch: boolean) {
  generation++
  session?.dispose()
  session = null
  island?.classList.remove("is-ready")
  setView("classic")
  if (focusSwitch) {
    document.querySelector<HTMLElement>('#classic [data-view-switch="island"]')?.focus()
  }
}

function fail(error: unknown) {
  console.warn("The island view could not start; showing the classic view.", error)
  store("island-failed", "1", "session")
  enterClassic(false)
  if (note) note.hidden = false
}

document.querySelectorAll<HTMLElement>("[data-view-switch]").forEach((button) => {
  button.addEventListener("click", () => {
    const view = button.dataset.viewSwitch as View
    store("view", view)
    if (view === "island") {
      store("island-failed", null, "session")
      void enterIsland(true)
    } else {
      enterClassic(true)
    }
  })
})

if (html.classList.contains("view-island")) void enterIsland(false)
