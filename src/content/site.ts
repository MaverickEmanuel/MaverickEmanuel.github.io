/**
 * Single home for all site copy and media wiring. Components render from this
 * file only, so updating content never requires touching them.
 */
import type { ImageMetadata } from "astro"
import roflowLockupSvg from "@/assets/roflow-logo-lockup.svg?raw"

export interface Link {
  label: string
  href: string
}

export interface Portrait {
  image: ImageMetadata
  alt: string
}

export type ProjectMedia =
  /** Backdrop panel with a logo lockup (inline SVG, themed via --logo-ink). */
  | { kind: "logo"; svg: string; label: string }
  /** Backdrop panel with an image inset in a desktop-app window frame. */
  | { kind: "screenshot"; image: ImageMetadata; alt: string }
  /** Backdrop panel with a native video player. No window frame. */
  | {
      kind: "video"
      src: string
      poster: string
      width: number
      height: number
      label: string
      caption: string
    }

export interface Project {
  id: string
  title: string
  /** One-line result, shown directly under the title. */
  outcome: string
  /** Shown one part per line; read aloud joined with a middle dot. */
  meta: string[]
  problem: string
  built: string
  why: string
  tags: string[]
  link: Link
  media: ProjectMedia
}

export interface ExperienceEntry {
  id: string
  title: string
  organization?: string
  dates?: string
  description?: string
}

export interface OffTheClockItem {
  label: string
  text: string
}

export interface SiteContent {
  title: string
  description: string
  name: string
  /** Public profile links, shown in order in the header and the footer. */
  profiles: Link[]
  hero: {
    greeting: string
    headline: string
    paragraphs: string[]
  }
  /** `null` renders the monogram placeholder. */
  portrait: Portrait | null
  work: { heading: string; projects: Project[] }
  experience: {
    heading: string
    /** The featured, current role. */
    entries: ExperienceEntry[]
    /** Quieter sub-group under the roles: degree and certifications. */
    education: { heading: string; entries: ExperienceEntry[] }
  }
  offTheClock: { heading: string; updated: string; items: OffTheClockItem[] }
  /** Quiet closing line before the footer; `link` is rendered inline. */
  closing: { text: string; link: Link; suffix: string }
  footer: { copyright: string; profiles: Link[] }
  labels: { problem: string; built: string; why: string }
}

/**
 * Optional images dropped into src/assets/ are found by name, so a missing
 * file never breaks the build until it is actually referenced.
 */
const assetModules = import.meta.glob<{ default: ImageMetadata }>(
  "/src/assets/*.{png,jpg,jpeg,webp,avif}",
  { eager: true }
)

function assetImage(name: string): ImageMetadata {
  const key = Object.keys(assetModules).find((path) =>
    new RegExp(`/${name}\\.[a-z]+$`).test(path)
  )
  if (!key) {
    throw new Error(
      `Missing image: put src/assets/${name}.png (or .jpg/.webp) in place.`
    )
  }
  return assetModules[key].default
}

/** Roflow media, variant "logo" (current). */
const roflowLogoMedia: ProjectMedia = {
  kind: "logo",
  svg: roflowLockupSvg,
  label: "Roflow logo",
}

/**
 * Roflow media, variant "screenshot". To switch, set `media` on the Roflow
 * project below to `roflowScreenshotMedia()` and add src/assets/roflow-screenshot.png.
 */
export function roflowScreenshotMedia(): ProjectMedia {
  return {
    kind: "screenshot",
    image: assetImage("roflow-screenshot"),
    alt: "Screenshot of the Roflow desktop app",
  }
}

/** The only public contact channels. Order is the display order. */
const profiles: Link[] = [
  { label: "GitHub", href: "https://github.com/MaverickEmanuel" },
  { label: "LinkedIn", href: "https://www.linkedin.com/in/maverick-emanuel/" },
]
const linkedin = profiles[1]

export const site: SiteContent = {
  title: "Maverick Emanuel · Software engineer",
  description:
    "Maverick Emanuel is a software engineer in Toronto who builds AI systems and the software that makes them useful.",
  name: "Maverick Emanuel",
  profiles,

  hero: {
    greeting: "Hi, I'm Maverick.",
    headline: "I build AI systems, and the software that makes them useful.",
    paragraphs: [
      "I'm a software engineer in Toronto. I work on the AI team at MPAC, and I co‑founded Roflow, an AI-native IDE for Roblox developers. The part I like most is the layer between a model and a real workflow: tool design, context and evaluation are usually what make an AI system dependable.",
      "I've done hands-on LoRA fine-tuning on a team project at MPAC, and model adaptation is where I want to go deeper next.",
    ],
  },

  // To add the real portrait: put the file in src/assets/ (e.g. portrait.jpg),
  // import it above, and replace `null` with
  //   { image: portraitImage, alt: "<description>" }
  portrait: null,

  labels: { problem: "Problem", built: "What I built", why: "Why it matters" },

  work: {
    heading: "Selected work",
    projects: [
      {
        id: "roflow",
        title: "Roflow",
        outcome:
          "A desktop AI IDE for Roblox, taken from idea to public beta with my co-founder.",
        meta: ["Co-founder & Founding AI Engineer", "Public beta released July 2026"],
        problem:
          "Roblox developers split their work between Roblox Studio and a code editor, and general-purpose AI coding tools don't know how a Roblox project fits together.",
        built:
          "I built Roflow with my co-founder. My side was the AI agent extension, the roflow.co site with Roblox sign-in, downloads and subscriptions, and the AWS infrastructure behind them. I also worked on file sync with Roblox Studio, diagnostics, and a 3D viewport inside the IDE.",
        why: "We took it from an idea to a signed, downloadable desktop app with accounts and billing, released as a public beta for individual Roblox developers.",
        tags: [
          "TypeScript",
          "VS Code (Code-OSS)",
          "AWS",
          "Terraform",
          "Stripe",
          "three.js",
        ],
        link: { label: "Visit roflow.co", href: "https://roflow.co" },
        media: roflowLogoMedia,
      },
      {
        id: "demopilot",
        title: "DemoPilot",
        outcome: "Turns a prompt into a reproducible product demo video.",
        meta: ["Open source (MIT) side project"],
        problem:
          "Product demo videos take a long time to record, and they go out of date as soon as the interface changes.",
        built:
          "An MCP server that lets an AI assistant plan a demo, drive the app in a real browser with Playwright, and render an MP4 with Remotion, all from a YAML script it writes and validates.",
        why: "The AI writes the script once. Replaying and rendering it are deterministic, so the same demo can be rendered again without re-recording.",
        tags: ["TypeScript", "MCP", "Playwright", "Remotion"],
        link: {
          label: "View DemoPilot on GitHub",
          href: "https://github.com/MaverickEmanuel/DemoPilot",
        },
        media: {
          kind: "video",
          src: "/media/demopilot-first-demo.mp4",
          poster: "/media/demopilot-poster.jpg",
          width: 1920,
          height: 1080,
          label: "Sample demo video rendered by DemoPilot",
          caption: "A sample demo rendered by DemoPilot.",
        },
      },
    ],
  },

  experience: {
    heading: "Experience",
    entries: [
      {
        id: "mpac",
        title: "Junior Systems Developer, AI team",
        organization: "MPAC",
        dates: "May 2025 – Present",
        description:
          "Internal AI tools: LLM workflows and agents, retrieval, evaluation and guardrails, MCP servers, and the full-stack and AWS work around them.",
      },
    ],
    education: {
      heading: "Education & certifications",
      entries: [
        {
          id: "queens",
          title:
            "Bachelor of Computing (Honours), Artificial Intelligence Specialization",
          organization: "Queen's University",
          dates: "2021 – 2025",
        },
        {
          id: "certifications",
          title: "Certifications",
          description:
            "AWS Certified Cloud Practitioner, AWS Certified AI Practitioner",
        },
      ],
    },
  },

  offTheClock: {
    heading: "Off the clock",
    updated: "Updated Nov 2026",
    items: [
      {
        label: "Training for",
        text: "a 5,000 m peak next year, after climbing a 4,700 m mountain in Yunnan, China.",
      },
      {
        label: "Building",
        text: "Shovel Snow Sim and Planet Sweeper on Roblox (both in progress), with a set of Claude Code skills and subagents I wrote to help make them.",
      },
      { label: "Playing", text: "World of Warcraft." },
      {
        label: "Otherwise",
        text: "travelling, working out, and getting outside for the scenery.",
      },
    ],
  },

  closing: {
    text: "Want to talk about AI systems or developer tools?",
    link: { label: "Message me on LinkedIn", href: linkedin.href },
    suffix: ".",
  },

  footer: {
    copyright: "© 2026 Maverick Emanuel",
    profiles,
  },
}
