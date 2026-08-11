import { useCallback, useEffect, useRef, useState } from 'react'

import ExperimentSection from './components/ExperimentSection'
import SideNav from './components/SideNav'
import { experiments, findExperiment, ordinal } from './experiments/registry'
import { useTheme } from './theme/useTheme'
import './app.css'

/**
 * A section owns the URL once its top edge has risen past this line. The active
 * section is the last one to have crossed it, so there is never a gap between
 * sections and the hero keeps the bare `/` until you actually reach 001.
 */
const CLAIM_LINE = 0.35

function slugFromLocation(): string {
  // Accept both `/magnetic-button` and `/#magnetic-button` so older links and
  // plain anchor links keep working.
  const fromPath = window.location.pathname.replace(/^\/+|\/+$/g, '')
  if (findExperiment(fromPath)) return fromPath

  const fromHash = window.location.hash.replace(/^#\/?/, '')
  if (findExperiment(fromHash)) return fromHash

  return ''
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export default function App() {
  const sections = useRef(new Map<string, HTMLElement>())
  const [active, setActive] = useState('')
  const [theme, toggleTheme] = useTheme()

  const registerSection = useCallback(
    (slug: string, el: HTMLElement | null) => {
      if (el) sections.current.set(slug, el)
      else sections.current.delete(slug)
    },
    [],
  )

  const scrollToSlug = useCallback((slug: string, smooth: boolean) => {
    const el = sections.current.get(slug)
    if (!el) return false
    // The spy is deliberately left running: it tracks the scroll all the way in
    // and settles on the target, so the URL can never end up out of step with
    // where the page actually stopped.
    el.scrollIntoView({
      behavior: smooth && !prefersReducedMotion() ? 'smooth' : 'auto',
      block: 'start',
    })
    return true
  }, [])

  const navigate = useCallback(
    (slug: string) => {
      window.history.pushState(null, '', `/${slug}`)
      setActive(slug)
      scrollToSlug(slug, true)
    },
    [scrollToSlug],
  )

  const goHome = useCallback(() => {
    window.history.pushState(null, '', '/')
    setActive('')
    window.scrollTo({
      top: 0,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    })
  }, [])

  // The URL encodes scroll position, so let it — not the browser — decide where
  // a reload lands.
  useEffect(() => {
    const previous = window.history.scrollRestoration
    window.history.scrollRestoration = 'manual'
    return () => {
      window.history.scrollRestoration = previous
    }
  }, [])

  // Honour the incoming deep link once sections have been laid out. Window
  // frames get their height from CSS aspect-ratio, so layout is already stable
  // and this lands in the right place on the first try.
  useEffect(() => {
    const slug = slugFromLocation()
    if (!slug) return

    setActive(slug)
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => scrollToSlug(slug, false))
    })
    return () => cancelAnimationFrame(frame)
  }, [scrollToSlug])

  // Back / forward between experiments.
  useEffect(() => {
    const onPopState = () => {
      const slug = slugFromLocation()
      setActive(slug)
      if (slug) scrollToSlug(slug, true)
      else {
        window.scrollTo({
          top: 0,
          behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        })
      }
    }

    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [scrollToSlug])

  // Scroll spy: whichever section is nearest the claim line owns the URL.
  useEffect(() => {
    let frame = 0

    const measure = () => {
      frame = 0

      const claimLine = window.innerHeight * CLAIM_LINE

      // Walk the timeline in document order and keep the last section whose top
      // has crossed the line.
      let best = ''
      for (const entry of experiments) {
        const el = sections.current.get(entry.slug)
        if (!el) continue
        if (el.getBoundingClientRect().top > claimLine) break
        best = entry.slug
      }

      setActive(best)
    }

    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(measure)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    onScroll()

    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  // Keep the address bar in step with where the reader actually is.
  useEffect(() => {
    const path = active ? `/${active}` : '/'
    if (window.location.pathname !== path) {
      window.history.replaceState(null, '', path)
    }
  }, [active])

  const activeIndex = experiments.findIndex((entry) => entry.slug === active)
  const activeExperiment =
    activeIndex >= 0 ? experiments[activeIndex] : undefined

  return (
    <div className="layout">
      <SideNav
        active={active}
        onNavigate={navigate}
        onHome={goHome}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <div className="layout__main">
        <header className="topbar">
          <div className="shell topbar__inner">
            <a
              className="topbar__brand"
              href="/"
              onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey) return
                event.preventDefault()
                goHome()
              }}
            >
              <span className="topbar__mark" aria-hidden="true" />
              Microinteractions
            </a>

            <div className="topbar__now mono" aria-live="polite">
              {activeExperiment ? (
                <>
                  <span className="topbar__count">
                    {ordinal(activeIndex)} —{' '}
                    {experiments.length.toString().padStart(3, '0')}
                  </span>
                  <span className="topbar__label">
                    {activeExperiment.title}
                  </span>
                </>
              ) : (
                <span className="topbar__count">
                  {experiments.length} experiment
                  {experiments.length === 1 ? '' : 's'}
                </span>
              )}
            </div>
          </div>
        </header>

        <main className="shell">
          <section className="hero">
            <p className="hero__eyebrow mono">A running log</p>
            <h1 className="hero__title">
              Lab of <span className="hero__accent">Experimentation</span>
            </h1>
            <p className="hero__lede">
              Consistently tinkering and exploring, leaving it here for everyone
              to view and enjoy. Check back in from time to time to see things
              like wonky hover states, unnecessarily complex micro-interactions,
              and other fun explorations.
            </p>
          </section>

          <div className="timeline">
            {experiments.map((experiment, index) => (
              <ExperimentSection
                key={experiment.slug}
                experiment={experiment}
                index={ordinal(index)}
                isActive={experiment.slug === active}
                onNavigate={navigate}
                sectionRef={registerSection}
              />
            ))}

            <div className="timeline__end">
              <span className="timeline__endNode" aria-hidden="true" />
              <p className="mono">More soon</p>
            </div>
          </div>
        </main>

        <footer className="footer shell">
          <p>
            Built with Vite and React. Springs are integrated by hand in{' '}
            <code>src/lib/spring.ts</code> — no animation library.
          </p>
          <p className="footer__stamp mono">
            {__BUILD_REF__}
            {__BUILD_SHA__ ? ` · ${__BUILD_SHA__}` : ''}
          </p>
        </footer>
      </div>
    </div>
  )
}
