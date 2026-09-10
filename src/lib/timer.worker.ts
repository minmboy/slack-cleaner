// Runs the waits for timer.ts. Timers in a dedicated worker keep their pace in a
// background tab, where the page's own chained timers are checked once a minute.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<{ id: number; ms: number }>) => void) | null
  postMessage: (message: number) => void
}

scope.onmessage = (event) => {
  const { id, ms } = event.data
  setTimeout(() => scope.postMessage(id), ms)
}

export {}
