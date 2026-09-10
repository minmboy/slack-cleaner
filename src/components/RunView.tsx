import { useMemo } from 'react'
import { useI18n } from '../i18n/context'
import { resultsExport } from '../lib/export'
import type { DeleteResult, TargetMessage } from '../lib/types'
import { ExportButtons } from './ExportButtons'
import { Bar, Stat } from './ui'

interface Props {
  total: number
  results: DeleteResult[]
  running: boolean
  dryRun: boolean
  aborted: string | null
  rateLimitRemaining: number
  labels: Map<string, string>
  /** Joined into the export so it carries the text of every message removed. */
  targets: TargetMessage[]
  /** Staged messages this flow has not processed yet. */
  remaining: TargetMessage[]
  /** Opted-in files this flow has not processed yet. */
  remainingFiles: number
  /** When the current run started, when its latest result arrived, and how many results it inherited. */
  startedAt: number
  lastAt: number
  base: number
  onPause: () => void
  onResume: () => void
  onRetryFailed: () => void
  onFinish: () => void
}

/** Below this many results the pace is a guess, so the estimate uses Slack's one-a-second. */
const SAMPLE = 5

export function RunView({
  total,
  results,
  running,
  dryRun,
  aborted,
  rateLimitRemaining,
  labels,
  targets,
  remaining,
  remainingFiles,
  startedAt,
  lastAt,
  base,
  onPause,
  onResume,
  onRetryFailed,
  onFinish,
}: Props) {
  const { t, n } = useI18n()

  const tally = useMemo(() => {
    const counts = { deleted: 0, already_gone: 0, not_allowed: 0, failed: 0, skipped: 0 }
    for (const result of results) counts[result.outcome]++
    return counts
  }, [results])

  const problems = useMemo(
    () => results.filter((result) => result.outcome === 'not_allowed' || result.outcome === 'failed'),
    [results],
  )

  const retryable = problems.filter((result) => result.outcome === 'failed').length

  // Only shown once files are part of the run, so the grid stays at four columns
  // for the common message-only case.
  const filesDeleted = useMemo(() => {
    const rows = results.filter((result) => result.kind === 'file')
    if (rows.length === 0) return null
    return rows.filter((result) => result.outcome === 'deleted' || result.outcome === 'skipped').length
  }, [results])

  /** What a resume would pick up: everything staged that no run has reached yet. */
  const left = remaining.length + remainingFiles
  const paused = !running && left > 0

  /**
   * Time left, from the pace this run has actually managed — rate limits and
   * slow responses included — rather than from a nominal rate.
   */
  const eta = useMemo(() => {
    if (!running) return null
    const done = results.length - base
    const perItem = done >= SAMPLE ? (lastAt - startedAt) / done : 1_000
    const leftMs = left * perItem
    const leftText = leftMs < 60_000 ? t.run.etaUnderMinute : t.run.etaMinutes(n(Math.ceil(leftMs / 60_000)))
    return t.run.eta(leftText, n(Math.round(60_000 / perItem)))
  }, [running, results.length, base, startedAt, lastAt, left, t, n])

  const title = running
    ? dryRun
      ? t.run.titleDryRunning
      : t.run.titleRunning
    : paused
      ? dryRun
        ? t.run.titleDryPaused
        : t.run.titlePaused
      : dryRun
        ? t.run.titleDryDone
        : t.run.titleDone

  return (
    <>
      <section className="panel">
        <header className="panel-head">
          <h2>{title}</h2>
          <div className="spacer" />
          {!running && (
            <ExportButtons
              label={t.export.resultsLabel}
              kind="results"
              disabled={results.length === 0}
              build={(format) => resultsExport(results, targets, labels, format)}
            />
          )}
        </header>

        <div className="panel-body">
          <div style={{ marginBottom: 16 }}>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
              <span className="hint">
                {n(results.length)} / {n(total)}
              </span>
              <span className="hint">{total > 0 ? Math.floor((results.length / total) * 100) : 0}%</span>
            </div>
            <Bar
              value={results.length}
              total={total}
              tone={!running ? (tally.failed > 0 ? 'danger' : 'ok') : undefined}
            />
          </div>

          <div className="stat-grid">
            <Stat
              label={dryRun ? t.run.statTarget : t.run.statDeleted}
              value={n(dryRun ? tally.skipped : tally.deleted)}
              tone="ok"
            />
            <Stat label={t.run.statAlreadyGone} value={n(tally.already_gone)} />
            <Stat
              label={t.run.statNotAllowed}
              value={n(tally.not_allowed)}
              tone={tally.not_allowed > 0 ? 'warn' : undefined}
            />
            <Stat label={t.run.statFailed} value={n(tally.failed)} tone={tally.failed > 0 ? 'danger' : undefined} />
            {filesDeleted !== null && <Stat label={t.run.statFiles} value={n(filesDeleted)} tone="ok" />}
          </div>

          {running && (
            <p className="note" style={{ marginTop: 14, marginBottom: 0 }}>
              {t.run.keepOpen}
            </p>
          )}

          {rateLimitRemaining > 0 && (
            <p className="note warn" style={{ marginTop: 14, marginBottom: 0 }}>
              {t.run.rateLimitNote(<b>{t.run.seconds(rateLimitRemaining)}</b>)}
            </p>
          )}

          {aborted && (
            <p className="note danger" style={{ marginTop: 14, marginBottom: 0 }}>
              {t.run.abortedNote(<b>{aborted}</b>, n(left))}
            </p>
          )}

          {!running && tally.not_allowed > 0 && (
            <p className="note warn" style={{ marginTop: 14, marginBottom: 0 }}>
              {t.run.notAllowedNote(n(tally.not_allowed), <code className="inline">cant_delete_message</code>)}
            </p>
          )}
        </div>

        {problems.length > 0 && (
          <div className="list" style={{ maxHeight: 260 }}>
            <table className="fail-table">
              <thead>
                <tr>
                  <th>{t.run.thKind}</th>
                  <th>{t.run.thConversation}</th>
                  <th>{t.run.thTarget}</th>
                  <th>{t.run.thOutcome}</th>
                  <th>{t.run.thCode}</th>
                </tr>
              </thead>
              <tbody>
                {problems.slice(0, 200).map((result) => (
                  <tr key={`${result.kind}|${result.channelId}|${result.id}`}>
                    <td>{result.kind === 'file' ? t.run.kindFile : t.run.kindMessage}</td>
                    <td>{labels.get(result.channelId) ?? result.channelId}</td>
                    <td>{result.label ?? result.id}</td>
                    <td>{t.run.outcome[result.outcome]}</td>
                    <td className="code">{result.errorCode ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Every screen keeps its main action here: pause while running, then resume or leave. */}
      <div className="sticky-foot">
        {running ? (
          <>
            <div className="summary hint">{eta}</div>
            <button className="btn primary" onClick={onPause}>
              {t.run.pause}
            </button>
          </>
        ) : (
          <>
            <div className="summary hint">{t.run.leaveHint}</div>
            {retryable > 0 && (
              <button className="btn ghost" onClick={onRetryFailed}>
                {t.run.retryFailed(n(retryable))}
              </button>
            )}
            <button className={paused ? 'btn ghost' : 'btn primary'} onClick={onFinish}>
              {t.app.backToSelect}
            </button>
            {paused && (
              <button className="btn primary" onClick={onResume}>
                {t.run.resume(n(left))}
              </button>
            )}
          </>
        )}
      </div>
    </>
  )
}
