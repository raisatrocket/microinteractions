import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Which commit, and which branch, this bundle was built from.
 *
 * Vercel sets VERCEL_GIT_* during a build, so a deployed page can state the
 * branch it came from rather than leaving you to infer it from dashboard
 * settings. Falls back to local git, then to "local" for a bare checkout.
 */
function buildStamp(): { ref: string; sha: string } {
  const fromGit = (args: string) => {
    try {
      return execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .trim()
    } catch {
      return ''
    }
  }

  const ref =
    process.env.VERCEL_GIT_COMMIT_REF ||
    fromGit('rev-parse --abbrev-ref HEAD') ||
    'local'
  const sha =
    process.env.VERCEL_GIT_COMMIT_SHA || fromGit('rev-parse HEAD') || ''

  return { ref, sha: sha.slice(0, 7) }
}

/** Publishes the stamp as meta tags, so it is readable without running JS. */
function stampPlugin(stamp: { ref: string; sha: string }): Plugin {
  return {
    name: 'build-stamp',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: { name: 'build-ref', content: stamp.ref },
          injectTo: 'head',
        },
        {
          tag: 'meta',
          attrs: { name: 'build-sha', content: stamp.sha },
          injectTo: 'head',
        },
      ]
    },
  }
}

const stamp = buildStamp()

export default defineConfig({
  plugins: [react(), stampPlugin(stamp)],
  define: {
    __BUILD_REF__: JSON.stringify(stamp.ref),
    __BUILD_SHA__: JSON.stringify(stamp.sha),
  },
  server: {
    port: 5173,
    host: true,
  },
})
