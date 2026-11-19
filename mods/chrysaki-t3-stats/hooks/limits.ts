// The limit windows of the snapshot. Pure mapping, no I/O.

export type Limit = {
  id: string
  label: string
  usedPercent: number
  resetsAt?: number
}

export type EngineRateLimit = {
  kind: string
  percentUsed: number
  resetsAt?: string
}

const LABELS: Readonly<Record<string, string>> = {
  five_hour: '5h',
  seven_day: 'week',
  spend_limit: 'spend',
}

// The used percent, clamped to 0 through 100 with one decimal. A spend limit
// can pass 100, and the page draws the bar at 100 then.
export function clampPercent(value: number): number {
  return Math.round(Math.max(0, Math.min(100, value)) * 10) / 10
}

export function parseResetMs(text: string | undefined): number | undefined {
  if (text === undefined) return undefined
  const at = Date.parse(text)
  return Number.isNaN(at) ? undefined : at
}

export function limitsFromEngine(rateLimits: readonly EngineRateLimit[]): Limit[] {
  return rateLimits
    .filter(r => typeof r.percentUsed === 'number' && Number.isFinite(r.percentUsed))
    .map(r => {
      const resetsAt = parseResetMs(r.resetsAt)
      return {
        id: r.kind,
        label: LABELS[r.kind] ?? r.kind,
        usedPercent: clampPercent(r.percentUsed),
        ...(resetsAt === undefined ? {} : { resetsAt }),
      }
    })
}

// The reset times of the session's own windows. The hub reader uses them to
// name the seat that serves the session.
export function resetsOf(rateLimits: readonly EngineRateLimit[]): { fiveResetMs?: number; sevenResetMs?: number } {
  const at = (kind: string) => parseResetMs(rateLimits.find(r => r.kind === kind)?.resetsAt)
  const five = at('five_hour')
  const seven = at('seven_day')
  return { ...(five === undefined ? {} : { fiveResetMs: five }), ...(seven === undefined ? {} : { sevenResetMs: seven }) }
}
