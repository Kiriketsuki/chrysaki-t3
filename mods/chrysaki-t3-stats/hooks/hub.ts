// The hub reader. A hub session runs through a CLIProxy pool. The script
// hub-status.sh of the hub setup keeps a cache file per pool. The seat logic
// below is copied from the chrysaki-statusline mod, cut to what this mod
// needs. This module does no I/O.

import { HUB_MATCH_MS, HUB_STALE_MS, MS_PER_HOUR, POOL_RE } from './constants'
import { clampPercent } from './limits'
import type { Limit } from './limits'

export type HubSnapshot = {
  pool: string
  seat: string | null
  limits: Limit[]
}

export type HubCurrent = { fiveResetMs?: number; sevenResetMs?: number }

type Seat = Record<string, unknown>

// The pool name when the session is a hub session, else null.
export function hubPoolOf(env: string | undefined): string | null {
  return env !== undefined && POOL_RE.test(env) ? env : null
}

// The cache path of a pool, as hub-status.sh writes it.
export function hubCachePath(home: string, pool: string, xdgCache?: string): string {
  const base = xdgCache !== undefined && xdgCache !== '' ? xdgCache : `${home.replace(/[\\/]+$/, '')}/.cache`
  return `${base.replace(/\\/g, '/')}/cliproxy/${pool}.status.json`
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

function near(epochS: unknown, ms: number | undefined): boolean {
  const e = num(epochS)
  return e !== undefined && ms !== undefined && Math.abs(e * 1000 - ms) <= HUB_MATCH_MS
}

function nameIfSingle(seats: readonly Seat[]): string | null {
  const only = seats[0]
  return seats.length === 1 && typeof only?.seat === 'string' ? only.seat : null
}

// The seat whose reset times equal the session's, within a few seconds. A
// pool of one seat is that seat. Null when no seat or several seats match.
export function matchSeat(seats: readonly Seat[], cur: HubCurrent | null): Seat | null {
  const byName = (name: string | null) => (name === null ? null : seats.find(s => s.seat === name) ?? null)
  if (seats.length === 1) return seats[0] ?? null
  if (cur === null) return null
  const week = seats.filter(s => near(s.week_reset_epoch, cur.sevenResetMs))
  const five = seats.filter(s => near(s.five_hour_reset_epoch, cur.fiveResetMs))
  const both = week.filter(s => near(s.five_hour_reset_epoch, cur.fiveResetMs))
  return byName(nameIfSingle(week) ?? nameIfSingle(both) ?? nameIfSingle(five))
}

function resetOf(epoch: unknown, hours: unknown, baseMs: number): number | undefined {
  const e = num(epoch)
  if (e !== undefined) return e * 1000
  const h = num(hours)
  return h === undefined ? undefined : Math.floor(baseMs + h * MS_PER_HOUR)
}

function windowOf(id: string, label: string, used: unknown, epoch: unknown, hours: unknown, baseMs: number): Limit[] {
  const u = num(used)
  if (u === undefined) return []
  const resetsAt = resetOf(epoch, hours, baseMs)
  return [{ id, label, usedPercent: clampPercent(u * 100), ...(resetsAt === undefined ? {} : { resetsAt }) }]
}

export function seatLimits(seat: Seat, baseMs: number): Limit[] {
  return [
    ...windowOf('five_hour', '5h', seat.five_hour_used, seat.five_hour_reset_epoch, seat.five_hour_hours_left, baseMs),
    ...windowOf('seven_day', 'week', seat.week_used, seat.week_reset_epoch, seat.week_hours_left, baseMs),
  ]
}

function parseBody(text: string): Record<string, unknown> | null {
  try {
    const body: unknown = JSON.parse(text)
    return typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : null
  } catch {
    return null
  }
}

// The snapshot field of a hub session. A missing, broken or stale cache, and
// a seat the reset times do not name, give an unknown seat and no limits.
// The page shows the next seat's limits for none of these, because they would
// not belong to the serving seat.
export function parseHub(pool: string, text: string | null, nowMs: number, cur: HubCurrent | null): HubSnapshot {
  const unknown: HubSnapshot = { pool, seat: null, limits: [] }
  const body = text === null ? null : parseBody(text)
  if (body === null || !Array.isArray(body.seats)) return unknown
  const updatedS = num(body.updated_epoch) ?? num(body.fetched_at)
  const fetchedS = num(body.fetched_at) ?? updatedS
  if (updatedS === undefined || fetchedS === undefined) return unknown
  if (nowMs - Math.min(updatedS, fetchedS) * 1000 > HUB_STALE_MS) return unknown
  const seats = body.seats.filter((s): s is Seat => typeof s === 'object' && s !== null)
  const hit = matchSeat(seats, cur)
  if (hit === null || typeof hit.seat !== 'string') return unknown
  return { pool, seat: hit.seat, limits: seatLimits(hit, updatedS * 1000) }
}
