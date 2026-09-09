import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { authRevoke, authTest, fetchUser, listConversations, streamUsers } from './lib/api'
import { runDeletion, DeleteRunAborted } from './lib/deleter'
import { scanConversations } from './lib/scan'
import { SlackApiError, type CallContext } from './lib/slack'
import type {
  Conversation,
  ConversationKind,
  DeleteResult,
  Identity,
  ScanProgress,
  SlackUser,
  TargetMessage,
} from './lib/types'
import { ConfirmModal } from './components/ConfirmModal'
import { ConversationPicker } from './components/ConversationPicker'
import { ReviewView } from './components/ReviewView'
import { RunView } from './components/RunView'
import { ScanView } from './components/ScanView'
import { TokenGate } from './components/TokenGate'
import { LANGS, useI18n } from './i18n/context'
import { keyOf } from './lib/format'

type Step = 'connect' | 'select' | 'scan' | 'review' | 'run'

const STEP_IDS: Step[] = ['connect', 'select', 'scan', 'review', 'run']

const TOKEN_KEY = 'slack-cleaner:token'

/** `mpdm-alice--bob--carol-1` → `alice, bob, carol` */
function prettyMpim(name: string): string {
  const stripped = name.replace(/^#?mpdm-/, '').replace(/-\d+$/, '')
  return stripped.split('--').join(', ')
}

export default function App() {
  const { t, n, lang, setLang } = useI18n()
  const [step, setStep] = useState<Step>('connect')
  const [token, setToken] = useState('')
  const [identity, setIdentity] = useState<Identity | null>(null)
  const [connectBusy, setConnectBusy] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)

  const [kinds, setKinds] = useState<ConversationKind[]>(['im'])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [conversationsLoading, setConversationsLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [users, setUsers] = useState<Map<string, SlackUser>>(new Map())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [scanFrom, setScanFrom] = useState('')

  const [progress, setProgress] = useState<ScanProgress[]>([])
  const [scanErrors, setScanErrors] = useState<{ channelId: string; channelLabel: string; code: string }[]>([])
  const [throttleSuspected, setThrottleSuspected] = useState(false)

  const [targets, setTargets] = useState<TargetMessage[]>([])
  const [excluded, setExcluded] = useState<Set<string>>(new Set())

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [dryRun, setDryRun] = useState(false)
  const [runTotal, setRunTotal] = useState(0)
  const [results, setResults] = useState<DeleteResult[]>([])
  const [running, setRunning] = useState(false)
  const [aborted, setAborted] = useState<string | null>(null)

  const [rateLimitUntil, setRateLimitUntil] = useState(0)
  const [nowTick, setNowTick] = useState(Date.now())

  const abortRef = useRef<AbortController | null>(null)
  const autoConnectedRef = useRef(false)

  const rateLimitRemaining = Math.max(0, Math.ceil((rateLimitUntil - nowTick) / 1000))

  // Drive the rate-limit countdown only while one is pending.
  useEffect(() => {
    if (rateLimitUntil <= Date.now()) return
    const timer = setInterval(() => setNowTick(Date.now()), 500)
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
      setStep('select')
      if (remember) sessionStorage.setItem(TOKEN_KEY, candidate)
    } catch (error) {
      sessionStorage.removeItem(TOKEN_KEY)
      if (error instanceof SlackApiError) {
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
  }, [onRateLimit, t])

  // Reconnect automatically if the token was kept for this tab.
  useEffect(() => {
    if (autoConnectedRef.current) return
    autoConnectedRef.current = true
    const saved = sessionStorage.getItem(TOKEN_KEY)
    if (saved) void connect(saved, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function disconnect(revoke: boolean) {
    abortRef.current?.abort()
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
    setStep('connect')
  }

  // ---------- conversations + names ----------

  useEffect(() => {
    if (!identity || !token) return
    const controller = new AbortController()
    setConversationsLoading(true)
    setListError(null)
    setConversations([])
    setSelected(new Set())

    void (async () => {
      const ctx = makeCtx(controller.signal)
      try {
        const list = await listConversations(kinds, ctx)
        setConversations(list)
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
        setConversationsLoading(false)
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

  // ---------- scan ----------

  const startScan = useCallback(async () => {
    const chosen = decorated.filter((item) => selected.has(item.id))
    if (chosen.length === 0) return

    const controller = new AbortController()
    abortRef.current = controller
    setStep('scan')
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
      setStep('review')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setScanErrors((prev) => [
        ...prev,
        {
          channelId: '-',
          channelLabel: t.app.scanErrorLabel,
          code: error instanceof Error ? error.message : 'unknown_error',
        },
      ])
    }
  }, [decorated, selected, scanFrom, identity, makeCtx, t])

  const scannedMine = useMemo(() => progress.reduce((sum, item) => sum + item.mine, 0), [progress])

  // ---------- delete ----------

  const staged = useMemo(() => targets.filter((target) => !excluded.has(keyOf(target))), [targets, excluded])

  const perChannel = useMemo(() => {
    const counts = new Map<string, number>()
    for (const target of staged) counts.set(target.channelId, (counts.get(target.channelId) ?? 0) + 1)
    return [...counts.entries()]
      .map(([channelId, count]) => ({ label: labels.get(channelId) ?? channelId, count }))
      .sort((a, b) => b.count - a.count)
  }, [staged, labels])

  const startDelete = useCallback(
    async (queue: TargetMessage[]) => {
      const controller = new AbortController()
      abortRef.current = controller
      setConfirmOpen(false)
      setStep('run')
      setResults([])
      setRunTotal(queue.length)
      setRunning(true)
      setAborted(null)

      try {
        await runDeletion(
          queue,
          {
            dryRun,
            onResult: (result) => setResults((prev) => [...prev, result]),
          },
          makeCtx(controller.signal),
        )
      } catch (error) {
        if (error instanceof DeleteRunAborted) setAborted(error.code)
        else if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setAborted(error instanceof Error ? error.message : 'unknown_error')
        }
      } finally {
        setRunning(false)
      }
    },
    [dryRun, makeCtx],
  )

  const retryFailed = useCallback(() => {
    const failedKeys = new Set(
      results.filter((result) => result.outcome === 'failed').map(keyOf),
    )
    const queue = targets.filter((target) => failedKeys.has(keyOf(target)))
    if (queue.length > 0) void startDelete(queue)
  }, [results, targets, startDelete])

  const remaining = useMemo(() => {
    const doneKeys = new Set(results.map(keyOf))
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

      {step === 'connect' && <TokenGate onSubmit={(value, remember) => void connect(value, remember)} busy={connectBusy} error={connectError} />}

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
            abortRef.current?.abort()
            setStep('select')
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
                  <button className="btn ghost" onClick={() => setStep('select')}>
                    {t.app.backToSelect}
                  </button>
                </div>
              </div>
            </section>
          ) : (
            <ReviewView
              targets={targets}
              labels={labels}
              excluded={excluded}
              onExcludedChange={setExcluded}
              onBack={() => setStep('select')}
              onConfirm={() => setConfirmOpen(true)}
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
          labels={labels}
          remaining={remaining}
          onStop={() => abortRef.current?.abort()}
          onRetryFailed={retryFailed}
          onFinish={() => {
            setResults([])
            setTargets([])
            setExcluded(new Set())
            setStep('select')
          }}
        />
      )}

      {confirmOpen && (
        <ConfirmModal
          total={staged.length}
          perChannel={perChannel}
          dryRun={dryRun}
          onDryRunChange={setDryRun}
          onCancel={() => setConfirmOpen(false)}
          onStart={() => void startDelete(staged)}
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
