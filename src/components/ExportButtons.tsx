import { useI18n } from '../i18n/context'
import { downloadBlob, exportFilename, type ExportFormat } from '../lib/export'

interface Props {
  label: string
  kind: 'review' | 'results'
  /** Builds the file for the chosen format. Called from the click, never earlier. */
  build: (format: ExportFormat) => Blob
  disabled?: boolean
}

/**
 * The pair of format buttons. Both screens export the same way, and building
 * the blob lazily keeps a large scan from being serialised on every render.
 */
export function ExportButtons({ label, kind, build, disabled }: Props) {
  const { t } = useI18n()

  function run(format: ExportFormat) {
    downloadBlob(build(format), exportFilename(kind, format, new Date()))
  }

  return (
    <div className="export-group">
      <span className="hint">{label}</span>
      <button type="button" className="btn ghost sm" disabled={disabled} onClick={() => run('csv')}>
        {t.export.csv}
      </button>
      <button type="button" className="btn ghost sm" disabled={disabled} onClick={() => run('json')}>
        {t.export.json}
      </button>
    </div>
  )
}
