import { lazy } from 'react'
import type { ComponentType, LazyExoticComponent } from 'react'

export type Experiment = {
  /** URL segment. `/elastic-toggle` deep-links to this entry. Never rename. */
  slug: string
  title: string
  /** One or two sentences: what the interaction is, and what to notice. */
  blurb: string
  tags: string[]
  /** ISO date, shown on the timeline. */
  date: string
  Component: LazyExoticComponent<ComponentType>
}

/**
 * The timeline, oldest first. Adding an experiment is one entry here plus a
 * folder under `src/experiments/`; everything else — the deep link, the scroll
 * spy, the window chrome — follows from this list.
 */
export const experiments: Experiment[] = [
  {
    slug: 'inflated-letters',
    title: 'Inflated Letters',
    blurb:
      'Six letters spelling BUBBLE, each one an inflated, draggable glyph in its own bright color, pushing back against its neighbors and the walls of a resizable container. Shrink the box and they compress into each other rather than just rearranging.',
    tags: ['physics', 'drag', 'collision'],
    date: '2026-08-14',
    Component: lazy(() => import('./001-inflated-letters/Experiment')),
  },
  {
    slug: 'elastic-toggle',
    title: 'Elastic Toggle',
    blurb:
      'A switch whose knob squashes and stretches in proportion to its own velocity. The deformation is read straight off the spring, so it is never keyframed and never out of sync.',
    tags: ['spring', 'squash & stretch', 'state'],
    date: '2026-08-10',
    Component: lazy(() => import('./002-elastic-toggle/Experiment')),
  },
  {
    slug: 'morphing-action',
    title: 'Morphing Action',
    blurb:
      'One button carrying three states. The pill collapses to a disc while work is pending and reopens around a result, so the outcome arrives in the place you pressed.',
    tags: ['state machine', 'morph', 'choreography'],
    date: '2026-08-10',
    Component: lazy(() => import('./003-morphing-action/Experiment')),
  },
]

export function findExperiment(slug: string): Experiment | undefined {
  return experiments.find((entry) => entry.slug === slug)
}

/** "001", "002", … for a given position in the timeline. */
export function ordinal(index: number): string {
  return String(index + 1).padStart(3, '0')
}
