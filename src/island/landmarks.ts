/**
 * The island's stations: one entry per landmark. Pure data (no three.js), so
 * both the server-rendered HUD (labels, chips, panels) and the 3D scene read
 * the same list.
 *
 * Coordinates are in world units on the ground plane: x to the right, z toward
 * the default camera (south). The island's walkable radius is ~23 units and
 * the player spawns at the origin. `facing` is the model's rotation around the
 * vertical axis; the model's front (door, lens, mailbox slot) faces local +z,
 * so `facing: 0` faces south. Use `faceCentre(x, z)` to face the spawn point.
 *
 * To add a station: add an entry here, a panel for its id in
 * src/components/island/IslandPanels.astro, and (optionally) a model builder
 * in src/island/models.ts keyed by `model`.
 */

export type ModelKind =
  | "studio"
  | "camera"
  | "office"
  | "campus"
  | "campfire"
  | "mailbox"

import type { IconName } from "./icons"

export interface Landmark {
  /** Also the panel id: <template id="island-panel-{id}">. */
  id: string
  /** Floating label and station chip text. */
  label: string
  /** Which part of the site the station opens (shown under the label). */
  section: string
  model: ModelKind
  /** Accent colour (popup strip, icon badge, chip, label, arrival ring). */
  accent: string
  /** Section icon (src/island/icons.ts). */
  icon: IconName
  /** Ground position [x, z]. */
  position: [number, number]
  /** Rotation around the vertical axis, radians. */
  facing: number
  /** Footprint radius: the player is pushed out of this circle. */
  collider: number
  /** Height of the floating label above the ground. */
  labelHeight: number
}

/** Rotation that makes a model at (x, z) face the island centre. */
export function faceCentre(x: number, z: number): number {
  return Math.atan2(-x, -z)
}

export const landmarks: Landmark[] = [
  {
    id: "roflow",
    label: "Roflow",
    section: "Selected work",
    model: "studio",
    accent: "#c4622d",
    icon: "code",
    position: [-11, -8],
    facing: faceCentre(-11, -8),
    collider: 3.6,
    labelHeight: 7.2,
  },
  {
    id: "demopilot",
    label: "DemoPilot",
    section: "Selected work",
    model: "camera",
    accent: "#2f7f86",
    icon: "videoCamera",
    position: [-15.5, 5],
    facing: faceCentre(-15.5, 5),
    collider: 2.4,
    labelHeight: 5.6,
  },
  {
    id: "mpac",
    label: "MPAC",
    section: "Experience",
    model: "office",
    accent: "#5b6f9a",
    icon: "buildings",
    position: [11.5, -9],
    facing: faceCentre(11.5, -9),
    collider: 3.4,
    labelHeight: 9.4,
  },
  {
    id: "queens",
    label: "Queen's",
    section: "Education",
    model: "campus",
    accent: "#8a4f6e",
    icon: "graduationCap",
    position: [0, -16],
    facing: faceCentre(0, -16),
    collider: 4.2,
    labelHeight: 9.6,
  },
  {
    id: "campfire",
    label: "Campfire",
    section: "Off the clock",
    model: "campfire",
    accent: "#e0873a",
    icon: "campfire",
    position: [14, 6],
    facing: faceCentre(14, 6),
    collider: 2.6,
    labelHeight: 3.8,
  },
  {
    id: "contact",
    label: "Mailbox",
    section: "Contact",
    model: "mailbox",
    accent: "#6f8f4e",
    icon: "envelopeSimple",
    position: [4.5, 19.5],
    facing: faceCentre(4.5, 19.5),
    collider: 1.2,
    labelHeight: 3.6,
  },
]

/** Where the player stands when using a station: just in front of it. */
export function standPoint(landmark: Landmark, gap = 1.8): [number, number] {
  const d = landmark.collider + gap
  return [
    landmark.position[0] + Math.sin(landmark.facing) * d,
    landmark.position[1] + Math.cos(landmark.facing) * d,
  ]
}
