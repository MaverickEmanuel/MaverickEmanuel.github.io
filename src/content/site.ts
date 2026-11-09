/**
 * Single home for site content. Types only for now; data arrives in a later
 * milestone.
 */

export interface Project {
  id: string
  title: string
  summary: string
  url?: string
  tags: string[]
}

export interface ExperienceEntry {
  id: string
  role: string
  organization: string
  /** ISO date, e.g. "2025-05" */
  start: string
  /** ISO date; omit for a current role */
  end?: string
  summary?: string
}

export interface SiteContent {
  projects: Project[]
  experience: ExperienceEntry[]
}

export const site: SiteContent = {
  projects: [],
  experience: [],
}
