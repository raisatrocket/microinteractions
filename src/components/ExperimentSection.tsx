import { useCallback } from 'react'

import { useCopy } from '../lib/useCopy'
import type { Experiment } from '../experiments/registry'
import Window from './Window'
import './experiment-section.css'

/**
 * The snippet to paste into an Embed element on another site. Kept as an
 * aspect-ratio box rather than fixed pixels so it stays 4:3 at whatever width
 * the host layout gives it — which is the ratio the stage is built at.
 */
function embedSnippet(origin: string, slug: string, title: string): string {
  return `<iframe
  src="${origin}/embed/${slug}"
  title="${title}"
  loading="lazy"
  style="width:100%;aspect-ratio:4/3;border:0;display:block;border-radius:12px"
></iframe>`
}

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

  const link = useCopy()
  const embed = useCopy()

  const copyLink = useCallback(() => {
    void link.copy(`${window.location.origin}/${slug}`)
  }, [link, slug])

  const copyEmbed = useCallback(() => {
    void embed.copy(embedSnippet(window.location.origin, slug, title))
  }, [embed, slug, title])

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

            <div className="exp__actions">
              <button
                type="button"
                className="exp__copy"
                onClick={copyLink}
                data-copied={link.copied || undefined}
              >
                <LinkIcon />
                <span>{link.copied ? 'Copied' : 'Copy link'}</span>
              </button>

              <button
                type="button"
                className="exp__copy"
                onClick={copyEmbed}
                data-copied={embed.copied || undefined}
                title={`<iframe src="${'/embed/'}${slug}"> — paste into an Embed element`}
              >
                <EmbedIcon />
                <span>{embed.copied ? 'Copied' : 'Copy embed'}</span>
              </button>
            </div>
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

function EmbedIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5.2 3.6L1.8 7l3.4 3.4M8.8 3.6L12.2 7l-3.4 3.4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function LinkIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
    >
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
