import { useLayoutEffect, useRef, useState } from 'react'

import { experiments, ordinal } from '../experiments/registry'
import type { Theme } from '../theme/useTheme'
import './sidenav.css'

type Props = {
  /** Slug of the section currently owning the URL, or '' at the hero. */
  active: string
  onNavigate: (slug: string) => void
  onHome: () => void
  theme: Theme
  onToggleTheme: () => void
}

type Indicator = { top: number; height: number }

/**
 * Persistent index of the timeline. Visible on wide viewports only — below
 * that the sticky top bar does the same job in less room, so the two never
 * appear together.
 */
export default function SideNav({
  active,
  onNavigate,
  onHome,
  theme,
  onToggleTheme,
}: Props) {
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

      <div className="sidenav__foot">
        <p className="sidenav__count mono">
          {experiments.length} experiment{experiments.length === 1 ? '' : 's'}
        </p>

        <button
          type="button"
          className="sidenav__theme"
          onClick={onToggleTheme}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          aria-pressed={theme === 'light'}
        >
          <span
            className="sidenav__themeIcon"
            data-theme={theme}
            aria-hidden="true"
          >
            <SunIcon />
            <MoonIcon />
          </span>
        </button>
      </div>
    </aside>
  )
}

function SunIcon() {
  return (
    <svg
      className="sidenav__themeSun"
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="7" cy="7" r="3" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M7 0.8v1.6M7 11.6v1.6M13.2 7h-1.6M2.4 7H0.8M11.3 2.7l-1.13 1.13M3.83 10.17L2.7 11.3M11.3 11.3l-1.13-1.13M3.83 3.83L2.7 2.7"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg
      className="sidenav__themeMoon"
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12.4 8.7A5.6 5.6 0 1 1 5.3 1.6a4.4 4.4 0 0 0 7.1 7.1Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  )
}
