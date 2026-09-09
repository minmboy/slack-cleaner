import { useI18n } from '../i18n/context'
import type { ScanProgress } from '../lib/types'
import { Stat } from './ui'

interface Props {
  progress: ScanProgress[]
  totalMine: number
  errors: { channelId: string; channelLabel: string; code: string }[]
  rateLimitRemaining: number
  throttleSuspected: boolean
  onCancel: () => void
}

export function ScanView({ progress, totalMine, errors, rateLimitRemaining, throttleSuspected, onCancel }: Props) {
  const { t, n } = useI18n()
  const doneCount = progress.filter((item) => item.done).length
  const messagesSeen = progress.reduce((sum, item) => sum + item.messagesSeen, 0)

  return (
    <>
      <section className="panel">
        <header className="panel-head">
          <h2>{t.scan.title}</h2>
          <div className="spacer" />
          <button className="btn ghost sm" onClick={onCancel}>
            {t.scan.stop}
          </button>
        </header>

        <div className="panel-body">
          <div className="stat-grid">
            <Stat label={t.scan.statConversations} value={`${n(doneCount)} / ${n(progress.length)}`} />
            <Stat label={t.scan.statSeen} value={n(messagesSeen)} />
            <Stat label={t.scan.statMine} value={n(totalMine)} tone="warn" />
          </div>

          {rateLimitRemaining > 0 && (
            <p className="note warn" style={{ marginTop: 14, marginBottom: 0 }}>
              {t.scan.rateLimitNote(<b>{t.scan.seconds(rateLimitRemaining)}</b>)}
            </p>
          )}

          {throttleSuspected && (
            <p className="note danger" style={{ marginTop: 14, marginBottom: 0 }}>
              {t.scan.throttleNote}
            </p>
          )}
        </div>

        <div>
          {progress.map((item) => {
            const threads =
              item.threadsFound > 0 ? t.scan.threadNote(n(item.threadsDone), n(item.threadsFound)) : ''
            return (
              <div className="scan-line" key={item.channelId}>
                <div className="label">
                  {item.done ? <span className="tick">✓</span> : <span className="spinner" />}
                  <span>{item.channelLabel}</span>
                </div>
                <div className="nums">{t.scan.lineSummary(n(item.messagesSeen), threads, <b>{n(item.mine)}</b>)}</div>
              </div>
            )
          })}
        </div>
      </section>

      {errors.length > 0 && (
        <section className="panel">
          <header className="panel-head">
            <h2>{t.scan.skippedTitle(errors.length)}</h2>
          </header>
          <div className="panel-body">
            <table className="fail-table">
              <tbody>
                {errors.map((item) => (
                  <tr key={item.channelId}>
                    <td>{item.channelLabel}</td>
                    <td className="code">{item.code}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  )
}
