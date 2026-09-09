import type { TargetMessage } from './types'

export interface Formatters {
  n: (value: number) => string
  formatTime: (ms: number) => string
}

/**
 * Builds number and date formatters bound to one locale. The i18n provider
 * rebuilds these when the language changes, so timestamps in the review list
 * follow the selected language rather than being frozen at import time.
 */
export function makeFormatters(locale: string): Formatters {
  const numberFormat = new Intl.NumberFormat(locale)
  const dateTime = new Intl.DateTimeFormat(locale, {
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  return {
    n: (value) => numberFormat.format(value),
    formatTime: (ms) => dateTime.format(new Date(ms)),
  }
}

/** Stable identity for a message: unique across the whole scan. */
export const keyOf = (target: Pick<TargetMessage, 'channelId' | 'ts'>) => `${target.channelId}|${target.ts}`
