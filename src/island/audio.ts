/**
 * Island sound (Web Audio). Part of the lazy-loaded island chunk, so the
 * classic page never loads it. Three small files: an ocean loop, a campfire
 * loop and one sprite with every short sound (src/island/audio-sprite.ts).
 * Sources and licences: THIRD_PARTY_NOTICES.md; how the files were made:
 * scripts/audio/.
 *
 * Browsers only allow audio after a user gesture, so the AudioContext is
 * created in unlock(), which the welcome card's Explore button and the sound
 * toggles call. The files are fetched up front and decoded once the context
 * exists.
 *
 * Sound is on by default for first visits; the choice is stored in
 * localStorage ("island-sound": "on" | "off"). Returning visitors start
 * silent (holdSilent) and turn sound on with the speaker button or M.
 */
import fireUrl from "@/assets/audio/fire.mp3?url"
import oceanUrl from "@/assets/audio/ocean.mp3?url"
import sfxUrl from "@/assets/audio/sfx.mp3?url"
import { SPRITE, type SpriteName } from "./audio-sprite"
import type { Surface } from "./world"

const PREF_KEY = "island-sound"
/** Loop lengths in seconds (the encoded files may carry a few ms of padding). */
const OCEAN_LENGTH = 24
const FIRE_LENGTH = 14
/** Silence before the first clip in the sprite (scripts/audio/sprite.py). */
const SPRITE_LEAD = 0.15

/** Overall loudness (master gain when unmuted). */
const MASTER = 0.75

const LEVELS = {
  ocean: 0.12,
  fire: 0.6,
  gull: 0.26,
  popupOpen: 0.42,
  popupClose: 0.38,
  arrive: 0.3,
  click: 0.32,
  step: 0.26,
  thud: 0.2,
}
/** Base playback rate per surface (the sand steps are sped up to walking pace). */
const STEP_RATE: Record<Surface, number> = { grass: 1, stone: 1, sand: 1.12, wood: 1 }
/** Campfire loudness: full inside NEAR, silent beyond FAR (world units). */
const FIRE_NEAR = 3
const FIRE_FAR = 14

function readMuted(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) === "off"
  } catch {
    return false
  }
}

function smoothstep(a: number, b: number, v: number): number {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Time of the first sample above `threshold` (to skip any decoder padding). */
function firstSound(buffer: AudioBuffer, threshold: number, limit: number): number {
  const data = buffer.getChannelData(0)
  const end = Math.min(data.length, Math.floor(limit * buffer.sampleRate))
  for (let i = 0; i < end; i++) if (Math.abs(data[i]) > threshold) return i / buffer.sampleRate
  return 0
}

export class IslandAudio {
  muted = readMuted()
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private fireGain: GainNode | null = null
  private sfx: AudioBuffer | null = null
  /** Decoder padding at the start of the sprite, if any. */
  private spriteShift = 0
  private files: Promise<Array<ArrayBuffer | null>>
  private loading = false
  private disposed = false
  private nextGull = 8 + Math.random() * 6
  private fireLevel = 0
  private lastStep: Record<string, number> = {}
  private listeners = new Set<(muted: boolean) => void>()

  constructor() {
    const get = (url: string) =>
      fetch(url)
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .catch(() => null)
    this.files = Promise.all([get(oceanUrl), get(fireUrl), get(sfxUrl)])
  }

  /** Subscribe to mute changes (the HUD keeps its buttons in sync). */
  onChange(fn: (muted: boolean) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  /**
   * Starts (or resumes) audio. Must run inside a user gesture handler the
   * first time. Does nothing while muted: unmuting is itself a gesture.
   */
  unlock() {
    if (this.disposed || this.muted) return
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return
      this.ctx = new Ctor()
      this.master = this.ctx.createGain()
      this.master.gain.value = MASTER
      this.master.connect(this.ctx.destination)
      void this.load()
    }
    if (this.ctx.state === "suspended" && !document.hidden) void this.ctx.resume()
  }

  private async load() {
    if (this.loading || !this.ctx) return
    this.loading = true
    const ctx = this.ctx
    const [ocean, fire, sfx] = await this.files
    const decode = (data: ArrayBuffer | null) =>
      data ? ctx.decodeAudioData(data.slice(0)).catch(() => null) : Promise.resolve(null)
    const [oceanBuf, fireBuf, sfxBuf] = await Promise.all([decode(ocean), decode(fire), decode(sfx)])
    if (this.disposed) return
    this.sfx = sfxBuf
    if (sfxBuf) {
      const lead = firstSound(sfxBuf, 0.002, 0.5) - SPRITE_LEAD
      this.spriteShift = lead > 0.004 && lead < 0.08 ? lead : 0
    }
    this.startLoop(oceanBuf, OCEAN_LENGTH, LEVELS.ocean)
    this.fireGain = this.startLoop(fireBuf, FIRE_LENGTH, 0)
  }

  private startLoop(buffer: AudioBuffer | null, length: number, level: number): GainNode | null {
    if (!buffer || !this.ctx || !this.master) return null
    const gain = this.ctx.createGain()
    gain.gain.value = level
    gain.connect(this.master)
    const source = this.ctx.createBufferSource()
    source.buffer = buffer
    source.loop = true
    const start = firstSound(buffer, 0.0005, 0.1)
    source.loopStart = start
    source.loopEnd = Math.min(buffer.duration, start + length)
    source.connect(gain)
    source.start(0, start)
    return gain
  }

  setMuted(muted: boolean) {
    this.muted = muted
    try {
      localStorage.setItem(PREF_KEY, muted ? "off" : "on")
    } catch {
      // Storage unavailable: the choice lasts for this page only.
    }
    if (!muted) this.unlock()
    if (this.ctx && this.master) {
      const now = this.ctx.currentTime
      this.master.gain.cancelScheduledValues(now)
      this.master.gain.setTargetAtTime(muted ? 0 : MASTER, now, 0.06)
      if (muted) window.setTimeout(() => this.muted && this.ctx?.state === "running" && void this.ctx.suspend(), 400)
    }
    this.listeners.forEach((fn) => fn(muted))
  }

  /** Silent for this page view only (not saved): the visitor turns sound on themselves. */
  holdSilent() {
    this.muted = true
  }

  toggle() {
    this.setMuted(!this.muted)
  }

  private get live(): boolean {
    return !!(this.ctx && this.master && this.sfx && !this.muted && this.ctx.state === "running")
  }

  private play(name: SpriteName, gain: number, rate = 1, pan = 0) {
    if (!this.live) return
    const ctx = this.ctx!
    const [start, duration] = SPRITE[name]
    const source = ctx.createBufferSource()
    source.buffer = this.sfx
    source.playbackRate.value = rate
    const g = ctx.createGain()
    g.gain.value = gain
    let tail: AudioNode = g
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner()
      p.pan.value = pan
      g.connect(p)
      tail = p
    }
    tail.connect(this.master!)
    source.connect(g)
    source.start(0, start + this.spriteShift, duration)
    source.onended = () => {
      source.disconnect()
      tail.disconnect()
      if (tail !== g) g.disconnect()
    }
  }

  /** Random clip among `prefix-0`, `prefix-1`... avoiding the last one played. */
  private pick(prefix: string): SpriteName | null {
    const names = (Object.keys(SPRITE) as SpriteName[]).filter((n) => n.startsWith(prefix + "-"))
    if (!names.length) return null
    let i = Math.floor(Math.random() * names.length)
    if (names.length > 1 && i === this.lastStep[prefix]) i = (i + 1) % names.length
    this.lastStep[prefix] = i
    return names[i]
  }

  popupOpen() {
    this.play("popup-open", LEVELS.popupOpen)
  }

  popupClose() {
    this.play("popup-close", LEVELS.popupClose)
  }

  arrive() {
    this.play("arrive", LEVELS.arrive)
  }

  click() {
    this.play("click", LEVELS.click)
  }

  /** One footstep on `surface`; `pace` is 0..1 of full walking speed. */
  step(surface: Surface, pace: number) {
    const name = this.pick(`step-${surface}`)
    if (!name) return
    const rate = STEP_RATE[surface] * (0.94 + Math.random() * 0.12) * (0.92 + 0.12 * pace)
    this.play(name, LEVELS.step * (0.75 + 0.25 * pace) * (0.9 + Math.random() * 0.2), rate)
  }

  /** Jump landing. */
  land() {
    this.play("thud", LEVELS.thud, 0.95 + Math.random() * 0.1)
  }

  /**
   * Per frame: campfire loudness from the player's distance to the fire, and
   * the occasional gull.
   */
  update(dt: number, fireDistance: number) {
    if (!this.ctx || !this.fireGain) return
    const near = 1 - smoothstep(FIRE_NEAR, FIRE_FAR, fireDistance)
    const level = LEVELS.fire * near * near
    if (Math.abs(level - this.fireLevel) > 0.002) {
      this.fireLevel = level
      this.fireGain.gain.setTargetAtTime(level, this.ctx.currentTime, 0.12)
    }
    this.nextGull -= dt
    if (this.nextGull <= 0) {
      this.nextGull = 20 + Math.random() * 20
      this.play(Math.random() < 0.5 ? "gull-1" : "gull-3", LEVELS.gull * (0.7 + Math.random() * 0.3), 0.92 + Math.random() * 0.16, Math.random() * 1.2 - 0.6)
    }
  }

  /** Pause with the tab; resume when it comes back (if not muted). */
  setHidden(hidden: boolean) {
    if (!this.ctx) return
    if (hidden) void this.ctx.suspend()
    else if (!this.muted) void this.ctx.resume()
  }

  dispose() {
    this.disposed = true
    this.listeners.clear()
    void this.ctx?.close()
    this.ctx = null
  }
}
