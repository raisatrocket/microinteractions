# Microinteractions

A running log of interaction experiments, each one built inside the same fixed
**800 × 600** stage. Same frame every time, so the only variable is the
interaction itself.

The page is a vertical timeline. Every experiment has its own link, and opening
that link scrolls straight to it.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build to dist/
npm run preview    # serve the production build
```

---

## Adding an experiment

Two steps.

**1. Create the folder.** Copy the shape of an existing one:

```
src/experiments/004-your-thing/
  Experiment.tsx     # default export, fills the stage
  style.css
```

The component is mounted into an 800 × 600 box and stretched to fill it. Build
against those dimensions literally — write `190px`, not `24vw` or `clamp()`.
The stage never scales: it renders at its true pixel size on every viewport, so
a button is exactly as big on a phone as it is on a desktop. On a narrower
viewport the window scrolls horizontally instead of shrinking, opening
centered so content built in the middle of the stage — which is most of it —
is visible without scrolling first. Off-center content near the left or right
edge may need a scroll to reach on mobile; keep that in mind when composing.

**2. Register it.** Append one entry to `src/experiments/registry.ts`:

```ts
{
  slug: 'your-thing',          // becomes /your-thing — never rename it
  title: 'Your Thing',
  blurb: 'What it is, and what to notice.',
  tags: ['pointer', 'spring'],
  date: '2026-08-14',
  Component: lazy(() => import('./004-your-thing/Experiment')),
}
```

That is the whole registration. The timeline entry, the sidebar entry, the deep
link, the embed route, the scroll spy, and the window chrome all follow from
that one object. Experiments are lazily imported and only mount once you scroll
near them.

The sidebar appears at 1080px and up; below that the sticky top bar takes over
the same job, so the two are never on screen together.

---

## Light and dark

A toggle pinned to the bottom of the sidebar, next to the experiment count.
Dark is the default and the only look until a reader switches; the choice is
then remembered (`localStorage`, key `mi-theme`) and applied before first
paint on return visits — a small inline script in `index.html` does that, so
there is no flash of the other theme on load.

The experiment stage follows the toggle too — it isn't pinned to dark. It was,
briefly, out of caution that the first few experiments' glows were tuned
against a near-black canvas; that turned out not to matter in practice, since
they're built on the same color tokens as everything else rather than
hardcoded values, so removing the override just worked. The embed route is
unaffected either way, since it never sets a theme and the dark values are
already `:root`'s default.

Tokens live in `src/styles/global.css`. Most of them (`--bg`, `--panel`,
`--text`, …) are used as-is and simply have a light variant. `--accent` is the
exception: it stays the same bright mint in both themes for surface fills
(buttons, tracks) where the always-dark `--accent-ink` sits on top of it as
text. Where the accent is used as text or a thin line _directly on the page
background_ instead, contrast breaks in light mode — pale mint on white is
close to invisible — so those spots use `--accent-text`, which is the same
mint in dark and a darkened mix of it in light. If a new page-level element
puts the accent color on the page background rather than inside a filled
surface, reach for `--accent-text`, not `--accent`.

---

## Embedding an experiment elsewhere

Every experiment is also served standalone at `/embed/<slug>`, with the
timeline, the copy, and the window chrome stripped away — just the stage,
scaled to fill whatever box the host gives it. This is the one place the stage
does scale: an embed has no native size of its own, so it has to fit whatever
box Framer (or any other host) hands it — unlike the timeline, which now
always renders the stage at its true pixel size and scrolls instead of
shrinking on narrow viewports.

The **Copy embed** button on each timeline entry puts a ready snippet on your
clipboard:

```html
<iframe
  src="https://your-domain/embed/elastic-toggle"
  title="Elastic Toggle"
  loading="lazy"
  style="width:100%;aspect-ratio:4/3;border:0;display:block;border-radius:12px"
></iframe>
```

In **Framer**: add an Embed element, choose _HTML_, and paste. Give it a fill
width and the `aspect-ratio` in the snippet keeps the height correct at every
breakpoint.

The snippet is built from the origin you copy it from, so copy from the
deployed site — copying from `localhost:5173` will paste a localhost URL.

**Sizing.** The stage is scaled to _fit_, by whichever axis is tighter, so an
iframe at any ratio letterboxes instead of cropping. 4:3 matches the stage
exactly and wastes no space, which is why it is the default in the snippet.

**Options.**

| Query       | Effect                                                                                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| _(none)_    | Bare stage. The default, and what you usually want in a designed page.                                                                                  |
| `?chrome=1` | Keeps the replay / speed / grid controls above the stage. Useful for one-shot interactions like Morphing Action, where a visitor may want to replay it. |

**Framing is allowed from anywhere** — nothing sets `X-Frame-Options` or a
`frame-ancestors` policy. If you later want to restrict embedding to your own
domain, add a `frame-ancestors` header for `/embed/*` in `vercel.json`.

---

## What the harness gives you

Each window has chrome with three controls: **replay** (remounts the
experiment), **speed** (1× / 0.5× / 0.25×), and an **8px grid** overlay.

For the speed control to reach your work, use what the stage publishes rather
than hard-coded timings.

**In CSS** — durations already folded through the multiplier, plus the shared
easing set:

```css
.thing {
  transition: transform var(--dur-2) var(--ease-back);
}
```

`--dur-1` 120ms · `--dur-2` 220ms · `--dur-3` 400ms · `--dur-4` 700ms
`--ease-out` · `--ease-in-out` · `--ease-back`

For a raw duration, multiply it yourself: `calc(760ms * var(--mi-t))`.

**In JS** — the spring hooks in `src/lib/spring.ts` read the multiplier
already. They run on `requestAnimationFrame` and never touch React state, so
write straight to the DOM from the frame callback:

```tsx
const setX = useSpringValue(0, SPRINGS.bouncy, (x, velocity) => {
  knobRef.current.style.transform = `translateX(${x}px)`
})
```

`useSpringValue` (scalar), `useSpring2D` (pointer follow), and
`useScaledTimeout` (choreography that slows down with everything else).
Velocity is handed to you deliberately — driving squash-and-stretch from it is
what separates a spring that moves from one that feels like matter.
`SPRINGS` holds the named configs: `gentle`, `snappy`, `bouncy`, `stiff`.

**Pointer coordinates.** On the timeline the stage is always at scale 1, so
viewport deltas are stage units there already. In an embed the stage is scaled
to fit its host box, so the same math needs `useStageScale().current` to
convert — divide by it before using a pointer delta, and the code works
correctly in both places without knowing which one it's in. Measure an
untransformed anchor element, never the element the spring is already
moving — that feeds its own output back in.

No animation library. The spring integrator is ~40 lines of semi-implicit Euler
with a fixed substep, in `src/lib/spring.ts`.

---

## Deployment

Live at **https://microinteractions-pi.vercel.app**, built by Vercel from
`main`. Every other branch and pull request gets its own preview URL.

The `rewrites` rule in `vercel.json` is what makes deep links work on a cold
load — without it, `/elastic-toggle` and `/embed/elastic-toggle` would 404 on
the server instead of reaching the app.

### Knowing what is actually live

Each build stamps itself with the branch and commit it came from — in the page
footer, and as meta tags for reading without a browser:

```bash
curl -s https://microinteractions-pi.vercel.app/ | grep build-ref
# <meta name="build-ref" content="main">
```

This exists because the two are easy to get out of step. Vercel's production
branch is a setting on the Vercel side; changing the repo's default branch on
GitHub does not move it, and changing it in Vercel does not trigger a rebuild
on its own — the next push does. When production looks stale, check the stamp
before assuming the deploy failed.
