import { useLayoutEffect, useRef, useState } from 'react'

import { experiments, ordinal } from '../experiments/registry'
import './sidenav.css'

type Props = {
  /** Slug of the section currently owning the URL, or '' at the hero. */
  active: string
  onNavigate: (slug: string) => void
  onHome: () => void
}

type Indicator = { top: number; height: number }

/**
 * Persistent index of the timeline. Visible on wide viewports only — below
 * that the sticky top bar does the same job in less room, so the two never
 * appear together.
 */
export default function SideNav({ active, onNavigate, onHome }: Props) {
  const listRef = useRef<HTMLUListElement>(null)
  const [indicator, setIndicator] = useState<Indicator | null>(null)

  // Track the active item's box so the accent rail can slide between entries
  // rather than blinking from one to the next.
  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return

    const measure = () => {
      const current = list.querySelector<HTMLElement>('[data-current="true"]')
      setIndicator(
        current
          ? { top: current.offsetTop, height: current.offsetHeight }
          : null,
      )
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(list)
    return () => observer.disconnect()
  }, [active])

  const guard = (event: React.MouseEvent, run: () => void) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey) return
    event.preventDefault()
    run()
  }

  return (
    <aside className="sidenav">
      <a className="sidenav__brand" href="/" onClick={(e) => guard(e, onHome)}>
        <span className="sidenav__mark" aria-hidden="true" />
        Microinteractions
      </a>

      <nav className="sidenav__nav" aria-label="Experiments">
        <p className="sidenav__label mono">The log</p>

        <ul className="sidenav__list" ref={listRef}>
          <li>
            <a
              className="sidenav__item"
              href="/"
              data-current={active === ''}
              aria-current={active === '' ? 'page' : undefined}
              onClick={(e) => guard(e, onHome)}
            >
              <span className="sidenav__index mono">—</span>
              <span className="sidenav__title">Overview</span>
            </a>
          </li>

          {experiments.map((experiment, index) => {
            const current = experiment.slug === active
            return (
              <li key={experiment.slug}>
                <a
                  className="sidenav__item"
                  href={`/${experiment.slug}`}
                  data-current={current}
                  aria-current={current ? 'page' : undefined}
                  onClick={(e) => guard(e, () => onNavigate(experiment.slug))}
                >
                  <span className="sidenav__index mono">{ordinal(index)}</span>
                  <span className="sidenav__title">{experiment.title}</span>
                </a>
              </li>
            )
          })}

          {indicator ? (
            <span
              className="sidenav__rail"
              aria-hidden="true"
              style={{
                transform: `translateY(${indicator.top}px)`,
                height: indicator.height,
              }}
            />
          ) : null}
        </ul>
      </nav>

      <p className="sidenav__foot mono">
        {experiments.length} experiment{experiments.length === 1 ? '' : 's'}
      </p>
    </aside>
  )
}
