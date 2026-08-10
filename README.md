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
against those dimensions literally — write `190px`, not `24vw`. The stage is
scaled down as one piece on narrow viewports, so the composition never reflows.

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

That is the whole registration. The timeline entry, the deep link, the scroll
spy, and the window chrome all follow from that one object. Experiments are
lazily imported and only mount once you scroll near them.

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

**Pointer coordinates.** The stage is scaled with a transform, so viewport
deltas are not stage units. Divide by `useStageScale().current` before using
them. Measure an untransformed anchor element, never the element the spring is
already moving — that feeds its own output back in.

No animation library. The spring integrator is ~40 lines of semi-implicit Euler
with a fixed substep, in `src/lib/spring.ts`.

---

## Deployment

Vercel builds this from the repo with no configuration beyond `vercel.json`,
which is already committed. To connect it:

1. Go to **https://vercel.com/new** and import `raisatrocket/microinteractions`
2. Accept the detected settings (Vite · `npm run build` · `dist`)
3. Deploy

After that every push to `main` publishes to production, and every branch and
pull request gets its own preview URL.

The `rewrites` rule in `vercel.json` is what makes deep links work on a cold
load — without it, `/elastic-toggle` would 404 on the server instead of
reaching the app.
