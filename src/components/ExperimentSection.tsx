import { useCallback, useEffect, useRef, useState } from 'react'

import type { Experiment } from '../experiments/registry'
import Window from './Window'
import './experiment-section.css'

type Props = {
  experiment: Experiment
  index: string
  isActive: boolean
  onNavigate: (slug: string) => void
  sectionRef: (slug: string, el: HTMLElement | null) => void
}

export default function ExperimentSection({
  experiment,
  index,
  isActive,
  onNavigate,
  sectionRef,
}: Props) {
  const { slug, title, blurb, tags, date, Component } = experiment

  const [copied, setCopied] = useState(false)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(copyTimer.current), [])

  const copyLink = useCallback(async () => {
    const url = `${window.location.origin}/${slug}`
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      // Clipboard can be blocked (insecure origin, permissions). The link is
      // still in the address bar, so fail quietly rather than alarm anyone.
    }
    setCopied(true)
    clearTimeout(copyTimer.current)
    copyTimer.current = setTimeout(() => setCopied(false), 1800)
  }, [slug])

  return (
    <section
      id={slug}
      className="exp"
      data-active={isActive || undefined}
      ref={(el) => {
        sectionRef(slug, el)
      }}
      aria-labelledby={`${slug}-title`}
    >
      <div className="exp__rail" aria-hidden="true">
        <span className="exp__node" />
      </div>

      <div className="exp__body">
        <header className="exp__meta">
          <div className="exp__eyebrow mono">
            <span className="exp__index">{index}</span>
            <span className="exp__sep">/</span>
            <time dateTime={date}>{formatDate(date)}</time>
          </div>

          <h2 className="exp__title" id={`${slug}-title`}>
            <a
              href={`/${slug}`}
              onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey) return
                event.preventDefault()
                onNavigate(slug)
              }}
            >
              {title}
            </a>
          </h2>

          <p className="exp__blurb">{blurb}</p>

          <div className="exp__footer">
            <ul className="exp__tags">
              {tags.map((tag) => (
                <li key={tag} className="exp__tag mono">
                  {tag}
                </li>
              ))}
            </ul>

            <button
              type="button"
              className="exp__copy"
              onClick={copyLink}
              data-copied={copied || undefined}
            >
              <LinkIcon />
              <span>{copied ? 'Copied' : 'Copy link'}</span>
            </button>
          </div>
        </header>

        <Window index={index} title={title}>
          <Component />
        </Window>
      </div>
    </section>
  )
}

function formatDate(iso: string): string {
  const parsed = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return iso
  return parsed.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

function LinkIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M5.8 8.2a2.4 2.4 0 0 0 3.4 0l2-2a2.4 2.4 0 0 0-3.4-3.4l-.7.7"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path
        d="M8.2 5.8a2.4 2.4 0 0 0-3.4 0l-2 2a2.4 2.4 0 0 0 3.4 3.4l.7-.7"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  )
}
