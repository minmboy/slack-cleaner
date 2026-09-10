import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { authRevoke, authTest, fetchUser, listConversations, streamUsers } from './lib/api'
import { collectFiles, runDeletion, DeleteRunAborted } from './lib/deleter'
import { scanConversations } from './lib/scan'
import { SlackApiError, type CallContext } from './lib/slack'
import type {
  Conversation,
  ConversationKind,
  DeleteResult,
  Identity,
  ScanProgress,
  SlackUser,
  TargetFile,
  TargetMessage,
} from './lib/types'
import { ConfirmModal } from './components/ConfirmModal'
import { ConversationPicker } from './components/ConversationPicker'
import { ReviewView } from './components/ReviewView'
import { RunView } from './components/RunView'
import { ScanView } from './components/ScanView'
import { TokenGate } from './components/TokenGate'
import { LANGS, useI18n } from './i18n/context'
import { keyOf, resultKey } from './lib/format'
import { canonicalKinds, formatRoute, parseRoute, resolveStep, STEP_IDS, type Step } from './lib/route'
import { readHash, subscribeHash, writeHash } from './lib/router'

const TOKEN_KEY = 'slack-message-manager:token'

/** `mpdm-alice--bob--carol-1` → `alice, bob, carol` */
function prettyMpim(name: string): string {
  const stripped = name.replace(/^#?mpdm-/, '').replace(/-\d+$/, '')
  return stripped.split('--').join(', ')
}

/** Identity of a result row: a message and a file can never share one. */
const rowKey = (row: Pick<DeleteResult, 'kind' | 'channelId' | 'id'>) => `${row.kind}|${resultKey(row)}`

export default function App() {
  const { t, n, lang, setLang } = useI18n()
  const [token, setToken] = useState('')
  const [identity, setIdentity] = useState<Identity | null>(null)
  const [connectBusy, setConnectBusy] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [conversationsLoading, setConversationsLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [users, setUsers] = useState<Map<string, SlackUser>>(new Map())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [scanFrom, setScanFrom] = useState('')

  const [progress, setProgress] = useState<ScanProgress[]>([])
  const [scanErrors, setScanErrors] = useState<{ channelId: string; channelLabel: string; code: string }[]>([])
  const [throttleSuspected, setThrottleSuspected] = useState(false)

  const [scanning, setScanning] = useState(false)
  const [scanCompleted, setScanCompleted] = useState(false)
  /** A scan that died outright, shown on the picker it drops the user back to. */
  const [scanFatal, setScanFatal] = useState<string | null>(null)
  const [runStarted, setRunStarted] = useState(false)
  const [runDestructive, setRunDestructive] = useState(false)
  /**
   * Why the last landing was redirected. Latched, because the redirect itself
   * rewrites the address bar — deriving the notice from the live hash would
   * erase it on the very next render.
   */
  const [routeNotice, setRouteNotice] = useState<null | 'not-restorable' | 'kinds'>(null)
  /**
   * Conversation labels frozen when the scan finished. The picker's list can be
   * refetched behind the user's back (a chip change, a Back/Forward), and the
   * review and confirm screens must keep naming the conversations they scanned.
   */
  const [scanLabels, setScanLabels] = useState<Map<string, string>>(new Map())
  const [targets, setTargets] = useState<TargetMessage[]>([])
  const [excluded, setExcluded] = useState<Set<string>>(new Set())

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [dryRun, setDryRun] = useState(false)
  const [deleteFiles, setDeleteFiles] = useState(false)
  const [runTotal, setRunTotal] = useState(0)
  const [results, setResults] = useState<DeleteResult[]>([])
  const [running, setRunning] = useState(false)
  const [aborted, setAborted] = useState<string | null>(null)

  const [rateLimitUntil, setRateLimitUntil] = useState(0)
  const [nowTick, setNowTick] = useState(Date.now())

  const scanAbortRef = useRef<AbortController | null>(null)
  const deleteAbortRef = useRef<AbortController | null>(null)
  const autoConnectedRef = useRef(false)

  // pushState/replaceState fire neither hashchange nor popstate, so the router
  // module announces its own writes and this stays the single source of truth.
  const hash = useSyncExternalStore(subscribeHash, readHash, () => '')
  const { route: asked, kindsClamped } = useMemo(() => parseRoute(hash), [hash])
  const kinds = asked.kinds

  const { step, reason: stepReason } = useMemo(
    () =>
      resolveStep(asked.step, {
        identity: Boolean(identity),
        running,
        scanning,
        scanCompleted,
        runStarted,
        runDestructive,
      }),
    [asked.step, identity, running, scanning, scanCompleted, runStarted, runDestructive],
  )

  /** Navigate. `replace` for filter-ish changes, `push` for real destinations. */
  const goto = useCallback(
    (next: Partial<{ step: Step; kinds: ConversationKind[] }>, mode: 'push' | 'replace' = 'push') => {
      writeHash(formatRoute({ step: next.step ?? step, kinds: next.kinds ?? kinds }), mode)
    },
    [step, kinds],
  )

  const setKinds = useCallback(
    (next: ConversationKind[]) => {
      setRouteNotice(null)
      goto({ kinds: canonicalKinds(next.join(',')).kinds }, 'replace')
    },
    [goto],
  )

  // Write back whatever the clamp changed, so the address bar never shows a
  // route the app is not on — and remember why, before the rewrite erases it.
  useEffect(() => {
    const canonical = formatRoute({ step, kinds })
    if (`/${hash.replace(/^\//, '')}` === canonical) return
    if (stepReason === 'not-restorable') setRouteNotice('not-restorable')
    else if (kindsClamped) setRouteNotice('kinds')
    writeHash(canonical, 'replace')
  }, [step, kinds, hash, stepReason, kindsClamped])

  // A notice explains one landing, so moving on into a scan retires it. The
  // delete dialog belongs to the review screen alone: a route change must not
  // leave it floating, armed, over another one.
  useEffect(() => {
    if (step === 'scan' || step === 'review' || step === 'run') setRouteNotice(null)
    if (step !== 'review') setConfirmOpen(false)
  }, [step])

  const rateLimitRemaining = Math.max(0, Math.ceil((rateLimitUntil - nowTick) / 1000))

  // Drive the rate-limit countdown only while one is pending. The deadline passing
  // does not change any dependency, so the tick has to stop itself.
  useEffect(() => {
    if (rateLimitUntil <= Date.now()) return
    const timer = setInterval(() => {
      const now = Date.now()
      setNowTick(now)
      if (now >= rateLimitUntil) clearInterval(timer)
    }, 500)
    return () => clearInterval(timer)
  }, [rateLimitUntil])

  const onRateLimit = useCallback(({ waitMs }: { waitMs: number }) => {
    setRateLimitUntil(Date.now() + waitMs)
    setNowTick(Date.now())
  }, [])

  const makeCtx = useCallback(
    (signal?: AbortSignal): CallContext => ({ token, signal, onRateLimit }),
    [token, onRateLimit],
  )

  /** Warn before a refresh throws away an in-flight delete run. */
  useEffect(() => {
    if (!running) return
    const guard = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [running])

  // ---------- connect ----------

  const connect = useCallback(async (candidate: string, remember: boolean) => {
    setConnectBusy(true)
    setConnectError(null)
    const controller = new AbortController()
    try {
      const who = await authTest({ token: candidate, signal: controller.signal, onRateLimit })
      setToken(candidate)
      setIdentity(who)
      goto({ step: 'select' }, 'replace')
      if (remember) sessionStorage.setItem(TOKEN_KEY, candidate)
    } catch (error) {
      if (error instanceof SlackApiError) {
        // A transport failure says nothing about the token, so keep it; only drop
        // it when Slack itself refuses it.
        sessionStorage.removeItem(TOKEN_KEY)
        setConnectError(
          error.code === 'invalid_auth' || error.code === 'not_authed'
            ? t.app.errInvalidToken
            : t.app.errSlackResponse(error.code),
        )
      } else {
        setConnectError(t.app.errUnreachable)
      }
    } finally {
      setConnectBusy(false)
    }
  }, [onRateLimit, t, goto])

  // Reconnect automatically if the token was kept for this tab.
  useEffect(() => {
    if (autoConnectedRef.current) return
    autoConnectedRef.current = true
    const saved = sessionStorage.getItem(TOKEN_KEY)
    if (saved) void connect(saved, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function disconnect(revoke: boolean) {
    scanAbortRef.current?.abort()
    deleteAbortRef.current?.abort()
    if (revoke && token) {
      try {
        await authRevoke(makeCtx())
      } catch {
        // Revoking is best-effort; the user can also delete the app in Slack.
      }
    }
    sessionStorage.removeItem(TOKEN_KEY)
    setToken('')
    setIdentity(null)
    setConversations([])
    setUsers(new Map())
    setSelected(new Set())
    setTargets([])
    setExcluded(new Set())
    setResults([])
    setProgress([])
    setScanErrors([])
    setAborted(null)
    setScanning(false)
    setScanCompleted(false)
    setScanFatal(null)
    setRunStarted(false)
    setRunDestructive(false)
    setRouteNotice(null)
    setConfirmOpen(false)
    setDeleteFiles(false)
    setScanLabels(new Map())
    writeHash(formatRoute({ step: 'connect', kinds: ['im'] }), 'replace')
  }

  // ---------- conversations + names ----------

  useEffect(() => {
    if (!identity || !token) return
    const controller = new AbortController()
    setConversationsLoading(true)
    setListError(null)
    setConversations([])

    void (async () => {
      const ctx = makeCtx(controller.signal)
      try {
        const list = await listConversations(kinds, ctx)
        setConversations(list)
        // Adding a type should not discard rows already picked, but a row that is
        // no longer listed cannot stay selected either.
        const ids = new Set(list.map((item) => item.id))
        setSelected((prev) => new Set([...prev].filter((id) => ids.has(id))))
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setListError(
          error instanceof SlackApiError
            ? error.code === 'missing_scope'
              ? t.app.errMissingScope(error.needed ?? 'missing_scope')
              : t.app.errListFailed(error.code)
            : t.app.errListUnreachable,
        )
      } finally {
        // A superseded fetch must not flip the flag; its replacement is still running.
        if (!controller.signal.aborted) setConversationsLoading(false)
      }
    })()

    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity, token, kinds.join(',')])

  // Resolve DM partner names in the background so the picker is usable immediately.
  useEffect(() => {
    if (!identity || !token || conversations.length === 0) return
    const needed = new Set(
      conversations.filter((item) => item.kind === 'im' && item.partnerId).map((item) => item.partnerId!),
    )
    for (const id of users.keys()) needed.delete(id)
    if (needed.size === 0) return

    const controller = new AbortController()
    void (async () => {
      const ctx = makeCtx(controller.signal)
      try {
        for await (const page of streamUsers(ctx)) {
          if (controller.signal.aborted) return
          setUsers((prev) => {
            const next = new Map(prev)
            for (const user of page) next.set(user.id, user)
            return next
          })
          for (const user of page) needed.delete(user.id)
          if (needed.size === 0) return
        }
        // Directory walk capped out; fill the rest one at a time.
        for (const id of [...needed].slice(0, 60)) {
          if (controller.signal.aborted) return
          try {
            const user = await fetchUser(id, ctx)
            setUsers((prev) => new Map(prev).set(user.id, user))
          } catch {
            // Deactivated or invisible member — the raw ID stays as the label.
          }
        }
      } catch {
        // Names are cosmetic; a failure here must not block the cleanup.
      }
    })()

    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity, token, conversations])

  const decorated = useMemo<Conversation[]>(
    () =>
      conversations.map((item) => {
        if (item.kind === 'im' && item.partnerId) {
          const user = users.get(item.partnerId)
          if (!user) return item
          const suffix = user.isDeleted ? t.app.userDeactivated : user.isBot ? t.app.userIsApp : ''
          return { ...item, label: `${user.displayName}${suffix}`, labelResolved: true }
        }
        if (item.kind === 'mpim') return { ...item, label: prettyMpim(item.label), labelResolved: true }
        return item
      }),
    [conversations, users, t],
  )

  const namesPending = useMemo(
    () => decorated.filter((item) => item.kind === 'im' && !item.labelResolved).length,
    [decorated],
  )

  const labels = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of decorated) map.set(item.id, item.label)
    return map
  }, [decorated])

  /** A directory walk usually outlives the scan; let late names update the frozen map. */
  useEffect(() => {
    if (scanLabels.size === 0) return
    setScanLabels((prev) => {
      let changed = false
      const next = new Map(prev)
      for (const [id, label] of labels) {
        if (prev.has(id) && prev.get(id) !== label && label !== id) {
          next.set(id, label)
          changed = true
        }
      }
      return changed ? next : prev
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labels])


  // ---------- scan ----------

  const startScan = useCallback(async () => {
    const chosen = decorated.filter((item) => selected.has(item.id))
    if (chosen.length === 0) return

    const controller = new AbortController()
    scanAbortRef.current = controller
    setScanning(true)
    setScanCompleted(false)
    setScanFatal(null)
    // A new scan starts a new flow: the previous run's screen, its results and
    // its file opt-in must not carry into it.
    setRunStarted(false)
    setRunDestructive(false)
    setResults([])
    setDeleteFiles(false)
    goto({ step: 'scan' })
    setProgress(chosen.map((item) => ({
      channelId: item.id,
      channelLabel: item.label,
      messagesSeen: 0,
      threadsFound: 0,
      threadsDone: 0,
      mine: 0,
      done: false,
    })))
    setScanErrors([])
    setThrottleSuspected(false)
    setTargets([])

    const oldest = scanFrom ? Math.floor(new Date(`${scanFrom}T00:00:00`).getTime() / 1000) : undefined

    try {
      const report = await scanConversations(
        chosen,
        {
          myUserId: identity!.userId,
          oldest,
          onProgress: (update) =>
            setProgress((prev) => prev.map((row) => (row.channelId === update.channelId ? update : row))),
          onThrottleSuspected: () => setThrottleSuspected(true),
        },
        makeCtx(controller.signal),
      )
      setTargets(report.targets)
      setScanErrors(report.errors)
      setExcluded(new Set())
      // Freeze the names as scanned; the picker list may change under us later.
      setScanLabels(new Map(labels))
      setScanCompleted(true)
      goto({ step: 'review' })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      // The scan screen is about to become unreachable (nothing is scanning), so
      // an error recorded there would never be seen. Carry it to the picker.
      setScanFatal(error instanceof Error ? error.message : 'unknown_error')
      goto({ step: 'select' }, 'replace')
    } finally {
      setScanning(false)
    }
  }, [decorated, selected, scanFrom, identity, makeCtx, labels, goto])

  useEffect(() => {
    if (step !== 'scan' && scanning) {
      scanAbortRef.current?.abort()
      setScanning(false)
    }
  }, [step, scanning])

  const scannedMine = useMemo(() => progress.reduce((sum, item) => sum + item.mine, 0), [progress])

  // ---------- delete ----------

  const staged = useMemo(() => targets.filter((target) => !excluded.has(keyOf(target))), [targets, excluded])

  /**
   * Files I uploaded on the staged messages, one entry per file id. Deleting one
   * removes it from every conversation it was shared into, so this is opt-in.
   */
  const stagedFiles = useMemo(() => collectFiles(staged), [staged])
  /** Messages carrying an attachment of any kind, mine or not — the honesty counter. */
  const stagedWithFiles = useMemo(() => staged.filter((target) => target.hasFiles).length, [staged])

  const perChannel = useMemo(() => {
    const counts = new Map<string, number>()
    for (const target of staged) counts.set(target.channelId, (counts.get(target.channelId) ?? 0) + 1)
    return [...counts.entries()]
      .map(([channelId, count]) => ({ channelId, label: scanLabels.get(channelId) ?? channelId, count }))
      .sort((a, b) => b.count - a.count)
  }, [staged, scanLabels])

  /**
   * `keepPrior` carries results forward across a retry. Deletion is irreversible,
   * so the record of what already went is part of the output — clearing it would
   * drop those rows from the tally, the failure table and the CSV audit log.
   */
  const startDelete = useCallback(
    async (
      queue: TargetMessage[],
      files: TargetFile[],
      keepPrior: DeleteResult[] = [],
      /** Failed rows left out of `keepPrior` because this run should re-report them. */
      pending: DeleteResult[] = [],
    ) => {
      const controller = new AbortController()
      deleteAbortRef.current = controller
      setConfirmOpen(false)
      setRunStarted(true)
      setRunDestructive(!dryRun)
      goto({ step: 'run' })
      setResults(keepPrior)
      setRunTotal(keepPrior.length + queue.length + files.length)
      setRunning(true)
      setAborted(null)

      const reported = new Set<string>()
      try {
        await runDeletion(
          queue,
          {
            dryRun,
            files,
            onResult: (result) => {
              reported.add(rowKey(result))
              setResults((prev) => [...prev, result])
            },
          },
          makeCtx(controller.signal),
        )
      } catch (error) {
        if (error instanceof DeleteRunAborted) setAborted(error.code)
        else if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setAborted(error instanceof Error ? error.message : 'unknown_error')
        }
      } finally {
        // A stop or a fatal code ends the run before it re-reports every retried
        // row. Put the old failure back for anything it never reached, so the
        // tally and the export still account for it.
        const unreported = pending.filter((row) => !reported.has(rowKey(row)))
        if (unreported.length > 0) setResults((prev) => [...prev, ...unreported])
        setRunning(false)
      }
    },
    [dryRun, makeCtx, goto],
  )

  const retryFailed = useCallback(() => {
    const failed = results.filter((result) => result.outcome === 'failed')
    const messageKeys = new Set(failed.filter((row) => row.kind === 'message').map(resultKey))
    const fileIds = new Set(failed.filter((row) => row.kind === 'file').map((row) => row.id))

    const queue = targets.filter((target) => messageKeys.has(keyOf(target)))
    const files = stagedFiles.filter((file) => fileIds.has(file.id))
    // Everything except the rows being retried survives, so the run total and the
    // audit log still describe the whole operation.
    const keepPrior = results.filter((result) => result.outcome !== 'failed')
    // `failed` rides along so any row the retry never reaches is put back.
    if (queue.length + files.length > 0) void startDelete(queue, files, keepPrior, failed)
  }, [results, targets, stagedFiles, startDelete])

  const remaining = useMemo(() => {
    const doneKeys = new Set(results.filter((result) => result.kind === 'message').map(resultKey))
    return staged.filter((target) => !doneKeys.has(keyOf(target)))
  }, [results, staged])

  // ---------- render ----------

  const stepIndex = STEP_IDS.indexOf(step)

  return (
    <div className="app">
      <header className="masthead">
        <h1>{t.app.title}</h1>
        <span className="tag" title={t.app.badgeTip}>
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <rect x="2.25" y="5.25" width="7.5" height="5.25" rx="1.1" />
            <path d="M4.1 5.25V3.9a1.9 1.9 0 0 1 3.8 0v1.35" />
          </svg>
          {t.app.badge}
        </span>
        <div className="spacer" />
        <div className="lang" role="group" aria-label="Language">
          {LANGS.map((code) => (
            <button key={code} type="button" data-on={lang === code} onClick={() => setLang(code)}>
              {code.toUpperCase()}
            </button>
          ))}
        </div>
        {identity && (
          <div className="identity">
            <span>
              <b>{identity.userName}</b> · {identity.teamName}
            </span>
            <button className="btn ghost sm" onClick={() => void disconnect(false)}>
              {t.app.disconnect}
            </button>
            <button className="btn ghost sm" title={t.app.revokeTip} onClick={() => void disconnect(true)}>
              {t.app.revoke}
            </button>
          </div>
        )}
      </header>

      {identity && (
        <ol className="steps">
          {STEP_IDS.map((id, index) => (
            <li key={id} data-state={index === stepIndex ? 'active' : index < stepIndex ? 'done' : 'todo'}>
              <span className="dot">{index < stepIndex ? '✓' : index + 1}</span>
              {t.app.steps[id]}
            </li>
          ))}
        </ol>
      )}

      {(step === 'connect' || step === 'select') && routeNotice === 'not-restorable' && (
        <p className="note warn">{t.app.routeNotRestorable}</p>
      )}

      {step === 'connect' && <TokenGate onSubmit={(value, remember) => void connect(value, remember)} busy={connectBusy} error={connectError} />}

      {step === 'select' && routeNotice === 'kinds' && <p className="note warn">{t.app.kindsClamped}</p>}
      {step === 'select' && scanFatal && <p className="note danger">{t.app.scanFailed(scanFatal)}</p>}
      {step === 'select' && listError && <p className="note danger">{listError}</p>}

      {step === 'select' && (
        <ConversationPicker
          conversations={decorated}
          loading={conversationsLoading}
          namesPending={namesPending}
          kinds={kinds}
          selected={selected}
          scanFrom={scanFrom}
          onKindsChange={setKinds}
          onSelectedChange={setSelected}
          onScanFromChange={setScanFrom}
          onScan={() => void startScan()}
        />
      )}

      {step === 'scan' && (
        <ScanView
          progress={progress}
          totalMine={scannedMine}
          errors={scanErrors}
          rateLimitRemaining={rateLimitRemaining}
          throttleSuspected={throttleSuspected}
          onCancel={() => {
            scanAbortRef.current?.abort()
            goto({ step: 'select' }, 'replace')
          }}
        />
      )}

      {step === 'review' && (
        <>
          {scanErrors.length > 0 && (
            <p className="note warn">
              {t.app.skippedNotice(
                scanErrors.length,
                scanErrors.map((item) => `${item.channelLabel} (${item.code})`).join(', '),
              )}
            </p>
          )}
          {targets.length === 0 ? (
            <section className="panel">
              <div className="empty">
                {t.app.noneFound}
                <div style={{ marginTop: 14 }}>
                  <button className="btn ghost" onClick={() => goto({ step: 'select' })}>
                    {t.app.backToSelect}
                  </button>
                </div>
              </div>
            </section>
          ) : (
            <ReviewView
              targets={targets}
              labels={scanLabels}
              excluded={excluded}
              onExcludedChange={setExcluded}
              onBack={() => goto({ step: 'select' })}
              onConfirm={() => {
                // File deletion is an opt-in to something wider than the list
                // shows; it must be ticked afresh each time, never inherited.
                setDeleteFiles(false)
                setConfirmOpen(true)
              }}
            />
          )}
        </>
      )}

      {step === 'run' && (
        <RunView
          total={runTotal}
          results={results}
          running={running}
          dryRun={dryRun}
          aborted={aborted}
          rateLimitRemaining={rateLimitRemaining}
          labels={scanLabels}
          targets={targets}
          remaining={remaining}
          onStop={() => deleteAbortRef.current?.abort()}
          onRetryFailed={retryFailed}
          onFinish={() => {
            setResults([])
            setTargets([])
            setExcluded(new Set())
            setScanCompleted(false)
            setRunStarted(false)
            setRunDestructive(false)
            setDeleteFiles(false)
            goto({ step: 'select' })
          }}
        />
      )}

      {step === 'review' && confirmOpen && (
        <ConfirmModal
          total={staged.length}
          withFiles={stagedWithFiles}
          fileCount={stagedFiles.length}
          deleteFiles={deleteFiles}
          onDeleteFilesChange={setDeleteFiles}
          perChannel={perChannel}
          dryRun={dryRun}
          onDryRunChange={setDryRun}
          onCancel={() => setConfirmOpen(false)}
          onStart={() => void startDelete(staged, deleteFiles ? stagedFiles : [])}
        />
      )}

      <footer className="foot-note">
        {t.app.footer(<code className="inline">slack.com/api</code>)}
        {identity && t.app.footerUserId(identity.userId)}
        {targets.length > 0 && t.app.footerScanned(n(targets.length))}
      </footer>
    </div>
  )
}
