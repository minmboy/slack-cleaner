import type { DeleteResult, TargetMessage } from './types'

export interface Formatters {
  n: (value: number) => string
  formatTime: (ms: number) => string
  /** A day, with the year only when it is not the current one. */
  formatDate: (ms: number) => string
  /**
   * "today", "3 days ago" — the usual shape for a last-activity column — falling
   * back to formatDate past a month, where a relative figure stops helping.
   */
  formatRelative: (ms: number) => string
}

const DAY = 86_400_000

/** Calendar days between two instants in local time, so "yesterday" means yesterday. */
function calendarDaysAgo(ms: number, now: number): number {
  const start = (value: number) => {
    const date = new Date(value)
    date.setHours(0, 0, 0, 0)
    return date.getTime()
  }
  return Math.round((start(now) - start(ms)) / DAY)
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
  const dayThisYear = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' })
  const dayWithYear = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric' })
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const formatDate = (ms: number) => {
    const date = new Date(ms)
    return (date.getFullYear() === new Date().getFullYear() ? dayThisYear : dayWithYear).format(date)
  }
  return {
    n: (value) => numberFormat.format(value),
    formatTime: (ms) => dateTime.format(new Date(ms)),
    formatDate,
    formatRelative: (ms) => {
      const days = calendarDaysAgo(ms, Date.now())
      return days >= 0 && days <= 30 ? relative.format(-days, 'day') : formatDate(ms)
    },
  }
}

/** Stable identity for a message: unique across the whole scan. */
export const keyOf = (target: Pick<TargetMessage, 'channelId' | 'ts'>) => `${target.channelId}|${target.ts}`

/** The same identity for a result row, so message results line up with their targets. */
export const resultKey = (result: Pick<DeleteResult, 'channelId' | 'id'>) => `${result.channelId}|${result.id}`
