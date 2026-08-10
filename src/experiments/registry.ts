import { lazy } from 'react'
import type { ComponentType, LazyExoticComponent } from 'react'

export type Experiment = {
  /** URL segment. `/magnetic-button` deep-links to this entry. Never rename. */
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
    slug: 'magnetic-button',
    title: 'Magnetic Button',
    blurb:
      'A button that leans toward the pointer inside an invisible field, then springs home when you leave. The label travels further than the surface, which is what sells the depth.',
    tags: ['pointer', 'spring', 'parallax'],
    date: '2026-08-10',
    Component: lazy(() => import('./001-magnetic-button/Experiment')),
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
