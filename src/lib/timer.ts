/**
 * A sleep that keeps its pace when the tab is in the background.
 *
 * Chrome checks the timers of a page hidden for more than five minutes only once
 * a minute. The delete loop waits about a second between messages, so in a tab
 * you switched away from, a 2,000-message run would slow from one a second to
 * one a minute. Timers inside a dedicated worker are not throttled that way, so
 * the wait happens there and the worker posts back when it is up.
 *
 * Falls back to setTimeout wherever a worker cannot run — tests, old browsers, a
 * worker that failed to load — so a missing worker never stalls a run.
 */

interface Waiter {
  resolve: () => void
  due: number
}

let worker: Worker | null | undefined
let nextId = 0
const waiters = new Map<number, Waiter>()

/** The worker died: hand every outstanding wait to an ordinary timer instead. */
function releaseToTimers(): void {
  for (const [id, waiter] of waiters) {
    waiters.delete(id)
    setTimeout(waiter.resolve, Math.max(0, waiter.due - Date.now()))
  }
}

function timerWorker(): Worker | null {
  if (worker !== undefined) return worker
  if (typeof Worker === 'undefined') return (worker = null)
  try {
    const created = new Worker(new URL('./timer.worker.ts', import.meta.url), { type: 'module' })
    created.onmessage = (event: MessageEvent<number>) => {
      const waiter = waiters.get(event.data)
      if (!waiter) return
      waiters.delete(event.data)
      waiter.resolve()
    }
    created.onerror = () => {
      worker = null
      releaseToTimers()
    }
    worker = created
  } catch {
    worker = null
  }
  return worker
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'))
    const id = ++nextId
    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = () => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }
    const onAbort = () => {
      waiters.delete(id)
      if (timer !== undefined) clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })

    const background = timerWorker()
    if (background) {
      waiters.set(id, { resolve: finish, due: Date.now() + ms })
      background.postMessage({ id, ms })
    } else {
      timer = setTimeout(finish, ms)
    }
  })
}
