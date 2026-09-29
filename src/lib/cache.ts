/**
 * A tab-lifetime cache for chain reads, so the board paints instantly on the
 * way back.
 *
 * A cold read costs four serial round trips - head, logs, the aggregate, then
 * the quote assets - and no amount of batching removes the latency of one
 * depending on the next. So the last good answer is kept and shown at once,
 * with a fresh read always started behind it. The screen is never empty for
 * data we already have, and never older than one refresh.
 *
 * sessionStorage, not localStorage: this is a snapshot of a moving market and
 * has no business outliving the tab. Every access is guarded, because storage
 * throws in private windows and returns nothing when site data is cleared, and
 * a cache that cannot be read is simply a cache miss.
 */
const PREFIX = 'berrypad.cache.'

/** Beyond this the snapshot is too stale to show even for a moment. */
const MAX_AGE_MS = 5 * 60_000

interface Envelope<T> {
  at: number
  data: T
}

export function readCache<T>(key: string): { data: T; at: number } | null {
  try {
    const raw = sessionStorage.getItem(PREFIX + key)
    if (!raw) return null
    const parsed = JSON.parse(raw, reviveBigints) as Envelope<T>
    if (!parsed || Date.now() - parsed.at > MAX_AGE_MS) return null
    return { data: parsed.data, at: parsed.at }
  } catch {
    return null
  }
}

export function writeCache<T>(key: string, data: T): void {
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), data }, replaceBigints))
  } catch {
    // A full or unavailable store costs a fast repaint, nothing more.
  }
}

/*
 * JSON has no bigint, and these payloads are full of them - reserves,
 * thresholds, block numbers. Tagging them on the way out and restoring them on
 * the way in keeps wei exact; going through Number would quietly round the
 * values the whole site exists to report accurately.
 */
const TAG = '\u0000n:'

function replaceBigints(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? TAG + value.toString() : value
}

function reviveBigints(_key: string, value: unknown): unknown {
  return typeof value === 'string' && value.startsWith(TAG) ? BigInt(value.slice(TAG.length)) : value
}
