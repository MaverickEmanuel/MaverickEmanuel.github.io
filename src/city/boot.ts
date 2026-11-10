/**
 * View switching between the city (default) and the classic page. Tiny and
 * three.js-free: the city code (and three.js) is only fetched, with a
 * dynamic import(), when the city view is actually shown.
 *
 * The starting view is decided before first paint by the inline head script
 * in Base.astro (html.view-city / html.view-classic). This module then:
 *   - starts the city if html.view-city is set,
 *   - wires every [data-view-switch="city" | "classic"] button and stores
 *     the choice in localStorage ("view"),
 *   - falls back to classic, with a short note, if WebGL or the import fails
 *     (remembered for the session in sessionStorage "city-failed").
 */
import type { CitySession } from "./index"

type View = "city" | "classic"

const html = document.documentElement
const city = document.getElementById("city")
const note = document.getElementById("city-note")
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)")

let session: CitySession | null = null
/** Bumped on every switch, so a slow import never starts a stale city. */
let generation = 0

function setView(view: View) {
  html.classList.toggle("view-city", view === "city")
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

const TIPS = {
  fine: [
    "Hold Shift to sprint.",
    "Press F next to the car to drive it. Space is the handbrake.",
    "Press P for the phone: every section is one tap away.",
    "Click a blip on the minimap to set a waypoint.",
  ],
  coarse: [
    "Push the joystick to the edge to sprint.",
    "Walk up to the car and tap Get in to drive it.",
    "Open the phone for every section in one list.",
    "Tap a blip on the minimap to set a waypoint.",
  ],
}
let tipTimer = 0

/** Rotates the loading-screen tips until the city is ready. */
function startTips() {
  const el = city?.querySelector<HTMLElement>("[data-loader-tip]")
  if (!el) return
  const tips = matchMedia("(pointer: coarse)").matches ? TIPS.coarse : TIPS.fine
  let i = Math.floor(Math.random() * tips.length)
  const show = () => (el.textContent = `Tip: ${tips[i++ % tips.length]}`)
  show()
  window.clearInterval(tipTimer)
  tipTimer = window.setInterval(show, 2600)
}

async function enterCity(focusSwitch: boolean) {
  if (!city) return
  startTips()
  const gen = ++generation
  if (note) note.hidden = true
  city.classList.remove("is-ready")
  setView("city")
  window.scrollTo(0, 0)
  if (focusSwitch) city.querySelector<HTMLElement>('[data-view-switch="classic"]')?.focus()
  try {
    const { startCity } = await import("./index")
    if (gen !== generation) return
    session = startCity(city, { reducedMotion: reducedMotion.matches, onFatal: fail })
    city.classList.add("is-ready")
    window.clearInterval(tipTimer)
  } catch (error) {
    if (gen === generation) fail(error)
  }
}

function enterClassic(focusSwitch: boolean) {
  generation++
  window.clearInterval(tipTimer)
  session?.dispose()
  session = null
  city?.classList.remove("is-ready")
  setView("classic")
  if (focusSwitch) {
    document.querySelector<HTMLElement>('#classic [data-view-switch="city"]')?.focus()
  }
}

function fail(error: unknown) {
  console.warn("The city view could not start; showing the classic view.", error)
  store("city-failed", "1", "session")
  enterClassic(false)
  if (note) note.hidden = false
}

document.querySelectorAll<HTMLElement>("[data-view-switch]").forEach((button) => {
  button.addEventListener("click", () => {
    const view = button.dataset.viewSwitch as View
    store("view", view)
    if (view === "city") {
      store("city-failed", null, "session")
      void enterCity(true)
    } else {
      enterClassic(true)
    }
  })
})

if (html.classList.contains("view-city")) void enterCity(false)
