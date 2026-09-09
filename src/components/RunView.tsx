import { useMemo } from 'react'
import { useI18n } from '../i18n/context'
import type { DeleteResult, TargetMessage } from '../lib/types'
import { Bar, Stat } from './ui'

interface Props {
  total: number
  results: DeleteResult[]
  running: boolean
  dryRun: boolean
  aborted: string | null
  rateLimitRemaining: number
  labels: Map<string, string>
  remaining: TargetMessage[]
  onStop: () => void
  onRetryFailed: () => void
  onFinish: () => void
}

export function RunView({
  total,
  results,
  running,
  dryRun,
  aborted,
  rateLimitRemaining,
  labels,
  remaining,
  onStop,
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

  function exportLog() {
    const rows = [
      'channel_id,channel_label,ts,outcome,error_code',
      ...results.map((result) =>
        [
          result.channelId,
          `"${(labels.get(result.channelId) ?? '').replace(/"/g, '""')}"`,
          result.ts,
          result.outcome,
          result.errorCode ?? '',
        ].join(','),
      ),
    ]
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `slack-cleanup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const title = running
    ? dryRun
      ? t.run.titleDryRunning
      : t.run.titleRunning
    : dryRun
      ? t.run.titleDryDone
      : t.run.titleDone

  return (
    <section className="panel">
      <header className="panel-head">
        <h2>{title}</h2>
        <div className="spacer" />
        {running ? (
          <button className="btn ghost sm" onClick={onStop}>
            {t.run.stop}
          </button>
        ) : (
          <button className="btn ghost sm" onClick={exportLog} disabled={results.length === 0}>
            {t.run.exportCsv}
          </button>
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
        </div>

        {rateLimitRemaining > 0 && (
          <p className="note warn" style={{ marginTop: 14, marginBottom: 0 }}>
            {t.run.rateLimitNote(<b>{t.run.seconds(rateLimitRemaining)}</b>)}
          </p>
        )}

        {aborted && (
          <p className="note danger" style={{ marginTop: 14, marginBottom: 0 }}>
            {t.run.abortedNote(<b>{aborted}</b>, n(remaining.length))}
          </p>
        )}

        {!running && tally.not_allowed > 0 && (
          <p className="note warn" style={{ marginTop: 14, marginBottom: 0 }}>
            {t.run.notAllowedNote(n(tally.not_allowed), <code className="inline">cant_delete_message</code>)}
          </p>
        )}

        {!running && (
          <div className="row" style={{ marginTop: 16 }}>
            {retryable > 0 && (
              <button className="btn primary" onClick={onRetryFailed}>
                {t.run.retryFailed(n(retryable))}
              </button>
            )}
            <button className="btn ghost" onClick={onFinish}>
              {t.run.restart}
            </button>
          </div>
        )}
      </div>

      {problems.length > 0 && (
        <div className="list" style={{ maxHeight: 260 }}>
          <table className="fail-table">
            <thead>
              <tr>
                <th>{t.run.thConversation}</th>
                <th>{t.run.thTs}</th>
                <th>{t.run.thOutcome}</th>
                <th>{t.run.thCode}</th>
              </tr>
            </thead>
            <tbody>
              {problems.slice(0, 200).map((result) => (
                <tr key={`${result.channelId}|${result.ts}`}>
                  <td>{labels.get(result.channelId) ?? result.channelId}</td>
                  <td>{result.ts}</td>
                  <td>{t.run.outcome[result.outcome]}</td>
                  <td className="code">{result.errorCode ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
