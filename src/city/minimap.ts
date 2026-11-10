/**
 * Round minimap in the HUD: a 2D canvas. The district (water, blocks, roads,
 * buildings) is drawn once per theme into an offscreen canvas; each frame
 * draws that image rotated so the camera's forward is up and centred on the
 * player, then the place blips (pinned to the rim when off the map), the car,
 * a GPS line to the waypoint, the north marker and the player arrow.
 *
 * Purely visual (aria-hidden): the phone lists every place for keyboard and
 * screen-reader users. A click or tap on a blip sets the waypoint.
 */
import { BOUNDS, SHORE_Z, blocks, buildings, court, parkingLot, roads, type Rect } from "./layout"
import { footprint, landmarks, type Landmark } from "./landmarks"
import type { Theme } from "./palette"

/** World extent drawn into the static map: [minX, minZ, maxX, maxZ]. */
const MAP: Rect = [-70, -75, 70, 70]
/** Static map resolution, pixels per world unit. */
const RES = 4

const themes: Record<Theme, Record<string, string>> = {
  dark: {
    bg: "#211c2e",
    water: "#2c3f63",
    block: "#3b3448",
    square: "#4a4152",
    road: "#16131d",
    building: "#5a4f6c",
    court: "#6a3f3a",
    rim: "rgba(255,255,255,0.75)",
    player: "#ffffff",
    shadow: "rgba(0,0,0,0.55)",
  },
  light: {
    bg: "#d8cdb8",
    water: "#7fbcc4",
    block: "#efe6d6",
    square: "#f6efe2",
    road: "#8e8794",
    building: "#cdbca6",
    court: "#d79a7c",
    rim: "rgba(40,30,20,0.6)",
    player: "#1d1820",
    shadow: "rgba(0,0,0,0.3)",
  },
}

export interface MinimapState {
  x: number
  z: number
  /** Player (or car) heading, radians (0 faces +z). */
  heading: number
  /** Camera azimuth, radians: the map rotates so the view direction is up. */
  azimuth: number
  car: { x: number; z: number; heading: number } | null
  waypoint: Landmark | null
  /** Map zoom: world units from the centre to the rim. */
  radius: number
}

export class Minimap {
  private ctx: CanvasRenderingContext2D
  private staticMap = document.createElement("canvas")
  private theme: Theme = "dark"
  private size = 0
  private last: MinimapState | null = null
  private abort = new AbortController()

  constructor(private canvas: HTMLCanvasElement, onPick: (lm: Landmark) => void) {
    this.ctx = canvas.getContext("2d")!
    this.staticMap.width = (MAP[2] - MAP[0]) * RES
    this.staticMap.height = (MAP[3] - MAP[1]) * RES
    canvas.addEventListener(
      "click",
      (e) => {
        const hit = this.pick(e.clientX, e.clientY)
        if (hit) onPick(hit)
      },
      { signal: this.abort.signal }
    )
  }

  setTheme(theme: Theme) {
    this.theme = theme
    const c = themes[theme]
    const g = this.staticMap.getContext("2d")!
    const rect = ([x0, z0, x1, z1]: Rect, colour: string) => {
      g.fillStyle = colour
      g.fillRect((x0 - MAP[0]) * RES, (z0 - MAP[1]) * RES, (x1 - x0) * RES, (z1 - z0) * RES)
    }
    g.fillStyle = c.bg
    g.fillRect(0, 0, this.staticMap.width, this.staticMap.height)
    rect([MAP[0], SHORE_Z, MAP[2], MAP[3]], c.water)
    rect([BOUNDS[0] - 1, BOUNDS[1] - 1, BOUNDS[2] + 1, BOUNDS[3] + 1], c.road)
    for (const b of blocks) {
      if (b.kind === "edge") continue
      rect(b.rect, b.kind === "square" ? c.square : c.block)
    }
    rect([-49, 45, 49, 50], c.block)
    rect(court, c.court)
    rect(parkingLot, c.road)
    for (const b of buildings) rect(b.rect, c.building)
    for (const lm of landmarks) rect(footprint(lm), lm.colour + "88")
    // Thin centre lines on the roads.
    g.fillStyle = theme === "dark" ? "#3a3346" : "#a8a0ad"
    for (const r of roads) {
      const [x0, z0, x1, z1] = r.rect
      if (r.axis === "x") rect([x0, (z0 + z1) / 2 - 0.15, x1, (z0 + z1) / 2 + 0.15], g.fillStyle as string)
      else rect([(x0 + x1) / 2 - 0.15, z0, (x0 + x1) / 2 + 0.15, z1], g.fillStyle as string)
    }
    if (this.last) this.draw(this.last)
  }

  private resize() {
    const css = this.canvas.clientWidth
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const px = Math.round(css * dpr)
    if (px > 0 && px !== this.canvas.width) {
      this.canvas.width = px
      this.canvas.height = px
    }
    this.size = px
  }

  /** World to minimap pixel offset from the centre, rotated with the camera. */
  private project(state: MinimapState, x: number, z: number): [number, number] {
    const scale = this.size / 2 / state.radius
    const dx = (x - state.x) * scale
    const dz = (z - state.z) * scale
    const c = Math.cos(state.azimuth)
    const s = Math.sin(state.azimuth)
    return [dx * c - dz * s, dx * s + dz * c]
  }

  draw(state: MinimapState) {
    this.last = state
    this.resize()
    const { ctx, size } = this
    if (!size) return
    const c = themes[this.theme]
    const r = size / 2
    const scale = r / state.radius
    ctx.clearRect(0, 0, size, size)
    ctx.save()
    ctx.beginPath()
    ctx.arc(r, r, r - 1, 0, Math.PI * 2)
    ctx.clip()
    ctx.fillStyle = c.bg
    ctx.fillRect(0, 0, size, size)

    // The district, rotated so the camera's forward points up.
    ctx.save()
    ctx.translate(r, r)
    ctx.rotate(state.azimuth)
    ctx.scale(scale / RES, scale / RES)
    ctx.translate((MAP[0] - state.x) * RES, (MAP[1] - state.z) * RES)
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(this.staticMap, 0, 0)
    ctx.restore()

    // GPS line to the waypoint.
    if (state.waypoint) {
      const [wx, wz] = this.project(state, state.waypoint.position[0], state.waypoint.position[1])
      ctx.strokeStyle = state.waypoint.colour
      ctx.lineWidth = Math.max(2, size * 0.022)
      ctx.setLineDash([size * 0.03, size * 0.02])
      ctx.beginPath()
      ctx.moveTo(r, r)
      ctx.lineTo(r + wx, r + wz)
      ctx.stroke()
      ctx.setLineDash([])
    }

    // The car, when the player is on foot.
    if (state.car) {
      const [cx, cz] = this.project(state, state.car.x, state.car.z)
      ctx.save()
      ctx.translate(r + cx, r + cz)
      ctx.rotate(state.azimuth - state.car.heading)
      ctx.fillStyle = "#e2552b"
      ctx.strokeStyle = c.shadow
      ctx.lineWidth = 1.5
      const w = Math.max(5, scale * 2.1)
      const l = Math.max(9, scale * 4.5)
      ctx.beginPath()
      ctx.roundRect(-w / 2, -l / 2, w, l, w * 0.3)
      ctx.fill()
      ctx.stroke()
      ctx.restore()
    }

    // Place blips, pinned to the rim when off the map.
    const blip = Math.max(8, size * 0.07)
    ctx.font = `700 ${blip * 1.05}px "Oswald Variable", "Arial Narrow", sans-serif`
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    for (const lm of landmarks) {
      let [bx, bz] = this.project(state, lm.position[0], lm.position[1])
      const d = Math.hypot(bx, bz)
      const max = r - blip - 2
      if (d > max) {
        bx *= max / d
        bz *= max / d
      }
      const active = state.waypoint === lm
      ctx.beginPath()
      ctx.arc(r + bx, r + bz, blip * (active ? 1.15 : 1), 0, Math.PI * 2)
      ctx.fillStyle = lm.colour
      ctx.fill()
      ctx.lineWidth = active ? 3 : 1.5
      ctx.strokeStyle = active ? "#ffffff" : c.shadow
      ctx.stroke()
      ctx.fillStyle = "#14101c"
      ctx.fillText(lm.glyph, r + bx, r + bz + blip * 0.05)
    }

    // North marker on the rim.
    {
      const ang = state.azimuth
      const nx = r + Math.sin(-ang) * 0 + (0 * Math.cos(ang) - -1 * Math.sin(ang)) * (r - blip * 0.9)
      const nz = r + (0 * Math.sin(ang) + -1 * Math.cos(ang)) * (r - blip * 0.9)
      ctx.beginPath()
      ctx.arc(nx, nz, blip * 0.8, 0, Math.PI * 2)
      ctx.fillStyle = c.shadow
      ctx.fill()
      ctx.fillStyle = "#ffffff"
      ctx.font = `700 ${blip * 0.95}px "Oswald Variable", "Arial Narrow", sans-serif`
      ctx.fillText("N", nx, nz + blip * 0.05)
    }

    // Player arrow (always at the centre).
    ctx.save()
    ctx.translate(r, r)
    ctx.rotate(state.azimuth - state.heading + Math.PI)
    const a = Math.max(7, size * 0.06)
    ctx.beginPath()
    ctx.moveTo(0, -a * 1.2)
    ctx.lineTo(a * 0.85, a * 0.9)
    ctx.lineTo(0, a * 0.45)
    ctx.lineTo(-a * 0.85, a * 0.9)
    ctx.closePath()
    ctx.fillStyle = c.player
    ctx.strokeStyle = c.shadow
    ctx.lineWidth = 2
    ctx.fill()
    ctx.stroke()
    ctx.restore()

    ctx.restore()
    // Rim.
    ctx.beginPath()
    ctx.arc(r, r, r - 1.5, 0, Math.PI * 2)
    ctx.lineWidth = 3
    ctx.strokeStyle = c.rim
    ctx.stroke()
  }

  /** The place blip under a click, if any (within a generous radius). */
  private pick(clientX: number, clientY: number): Landmark | null {
    const state = this.last
    if (!state) return null
    const rect = this.canvas.getBoundingClientRect()
    const k = this.size / rect.width
    const px = (clientX - rect.left) * k - this.size / 2
    const pz = (clientY - rect.top) * k - this.size / 2
    const r = this.size / 2
    const blip = Math.max(8, this.size * 0.07)
    let best: Landmark | null = null
    let bestD = blip * 2.2
    for (const lm of landmarks) {
      let [bx, bz] = this.project(state, lm.position[0], lm.position[1])
      const d = Math.hypot(bx, bz)
      const max = r - blip - 2
      if (d > max) {
        bx *= max / d
        bz *= max / d
      }
      const hit = Math.hypot(px - bx, pz - bz)
      if (hit < bestD) {
        bestD = hit
        best = lm
      }
    }
    return best
  }

  dispose() {
    this.abort.abort()
  }
}
