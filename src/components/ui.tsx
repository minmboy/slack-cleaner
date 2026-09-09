import { useCallback, useState, type ReactNode } from 'react'
import { useI18n } from '../i18n/context'

export function CopyBlock({ code }: { code: string }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  const copy = useCallback(() => {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    })
  }, [code])

  return (
    <div className="code-block">
      <button type="button" className="btn ghost sm copy" onClick={copy}>
        {copied ? t.ui.copied : t.ui.copy}
      </button>
      <pre>{code}</pre>
    </div>
  )
}

export function Bar({ value, total, tone }: { value: number; total: number; tone?: 'ok' | 'danger' }) {
  const pct = total > 0 ? Math.min(100, (value / total) * 100) : 0
  return (
    <div className={`bar${tone ? ` ${tone}` : ''}`}>
      <i style={{ width: `${pct}%` }} />
    </div>
  )
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: 'ok' | 'warn' | 'danger' }) {
  return (
    <div className="stat">
      <div className="k">{label}</div>
      <div className={`v${tone ? ` ${tone}` : ''}`}>{value}</div>
    </div>
  )
}
