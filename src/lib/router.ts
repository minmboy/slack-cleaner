/**
 * Hash routing, hand-rolled.
 *
 * Why the hash and not the History API: this ships to GitHub Pages at
 * `/slack-cleaner/`, which cannot rewrite unknown paths, so `/review` would 404
 * on refresh. A fragment also never reaches the server, so nothing in the URL
 * shows up in anyone's request logs — which matters for a page whose whole
 * argument is that your data does not leave the browser.
 */

/** `pushState`/`replaceState` fire neither `hashchange` nor `popstate`, so writes announce themselves. */
const listeners = new Set<() => void>()

function announce(): void {
  for (const listener of listeners) listener()
}

export function subscribeHash(listener: () => void): () => void {
  listeners.add(listener)
  window.addEventListener('hashchange', listener)
  window.addEventListener('popstate', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('hashchange', listener)
    window.removeEventListener('popstate', listener)
  }
}

export function readHash(): string {
  return window.location.hash.replace(/^#/, '')
}

/**
 * Safari throws SecurityError past ~100 history writes in 30s, and a throw out
 * of a React event handler would take the UI down. A dropped URL update is a
 * cosmetic loss; a crash is not.
 */
export function writeHash(next: string, mode: 'push' | 'replace'): void {
  const url = `${window.location.pathname}${window.location.search}#${next}`
  try {
    if (mode === 'push') window.history.pushState(null, '', url)
    else window.history.replaceState(null, '', url)
  } catch {
    window.location.hash = next
  }
  announce()
}
