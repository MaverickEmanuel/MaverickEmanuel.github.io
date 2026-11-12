/**
 * TEMPORARY dev-only sound test panel (loaded by index.ts only under
 * `pnpm dev`, via import.meta.env.DEV, so production builds never include it).
 * One switch per sound group, plus "play" buttons for the one-shots, so each
 * sound can be judged on its own. Delete this file once the sound choices
 * are final.
 */
import { SOUND_GROUPS, type IslandAudio, type SoundGroup } from "./audio"

const LABELS: Record<SoundGroup, string> = {
  ocean: "Ocean bed",
  gulls: "Seagulls (every 20–40 s)",
  campfire: "Campfire (near the fire)",
  popup: "Popup open / close",
  arrive: "Arrival chime",
  click: "UI clicks",
  "step-grass": "Footsteps: grass",
  "step-stone": "Footsteps: stone",
  "step-sand": "Footsteps: sand",
  "step-wood": "Footsteps: wood dock",
  thud: "Jump landing thud",
}

export function mountSoundPanel(root: HTMLElement, audio: IslandAudio): () => void {
  const panel = document.createElement("section")
  panel.setAttribute("aria-label", "Sound test (dev only)")
  panel.style.cssText = [
    "position:absolute",
    "left:max(0.875rem, env(safe-area-inset-left))",
    "top:4.5rem",
    "z-index:5",
    "padding:0.75rem 0.9rem",
    "border-radius:14px",
    "font:500 0.8125rem/1.3 var(--font-sans)",
    "background:color-mix(in srgb, var(--background) 88%, transparent)",
    "border:1px dashed var(--primary)",
    "backdrop-filter:blur(10px)",
    "max-width:16rem",
  ].join(";")
  const title = document.createElement("p")
  title.textContent = "Sound test · dev only"
  title.style.cssText = "margin:0 0 0.5rem;font-weight:700;font-size:0.75rem;letter-spacing:0.06em;text-transform:uppercase"
  panel.append(title)

  const play: Partial<Record<SoundGroup, () => void>> = {
    popup: () => {
      audio.popupOpen()
      setTimeout(() => audio.popupClose(), 700)
    },
    arrive: () => audio.arrive(),
    click: () => audio.click(),
    "step-grass": () => audio.step("grass", 1),
    "step-stone": () => audio.step("stone", 1),
    "step-sand": () => audio.step("sand", 1),
    "step-wood": () => audio.step("wood", 1),
    thud: () => audio.land(),
  }

  for (const group of SOUND_GROUPS) {
    const row = document.createElement("div")
    row.style.cssText = "display:flex;align-items:center;gap:0.5rem;padding:0.15rem 0"
    const label = document.createElement("label")
    label.style.cssText = "display:flex;align-items:center;gap:0.45rem;flex:1;cursor:pointer;pointer-events:auto"
    const box = document.createElement("input")
    box.type = "checkbox"
    box.checked = audio.groupOn(group)
    box.addEventListener("change", () => audio.setGroup(group, box.checked))
    label.append(box, document.createTextNode(LABELS[group]))
    row.append(label)
    const fn = play[group]
    if (fn) {
      const button = document.createElement("button")
      button.type = "button"
      button.textContent = "▶"
      button.setAttribute("aria-label", `Play ${LABELS[group]}`)
      button.style.cssText = "pointer-events:auto;padding:0 0.4rem;border:1px solid var(--border);border-radius:6px"
      button.addEventListener("click", () => {
        audio.unlock()
        fn()
      })
      row.append(button)
    }
    panel.append(row)
  }
  root.append(panel)
  return () => panel.remove()
}
