import { describe, expect, test } from 'claude-code/testing'

import { forSession, freshCounters, withToolCall, withTurn } from '../hooks/counters'
import { hubCachePath, hubPoolOf, parseHub } from '../hooks/hub'
import { buildSnapshot } from '../hooks/snapshot'

const NOW = 1794402600000
const counters = { sessionId: 's1', turns: 2, toolCalls: 5, lastTool: 'Bash' }

describe('snapshot mapping', () => {
  test('maps usage, limits and cost', () => {
    const snap = buildSnapshot({
      sessionId: 's1',
      now: NOW,
      cwd: '/w/app',
      model: 'opus',
      platform: 'linux',
      counters,
      usage: {
        startedAt: 1000,
        context: { tokens: 50000, window: 200000, percent: 25 },
        rateLimits: [
          { kind: 'five_hour', percentUsed: 42.55, resetsAt: '2026-11-19T10:00:00Z' },
          { kind: 'seven_day', percentUsed: 7 },
        ],
        cost: { usd: 1.5 },
      },
    })
    expect(snap).toEqual({
      schema: 1,
      sessionId: 's1',
      updatedAt: NOW,
      cwd: '/w/app',
      model: 'opus',
      platform: 'linux',
      startedAt: 1000,
      context: { usedTokens: 50000, maxTokens: 200000, usedPercent: 25 },
      limits: [
        { id: 'five_hour', label: '5h', usedPercent: 42.6, resetsAt: Date.parse('2026-11-19T10:00:00Z') },
        { id: 'seven_day', label: 'week', usedPercent: 7 },
      ],
      cost: { usd: 1.5 },
      turns: 2,
      toolCalls: 5,
      lastTool: 'Bash',
    })
  })

  test('leaves out what the engine does not give', () => {
    const snap = buildSnapshot({ sessionId: 's1', now: NOW, counters: freshCounters('s1') })
    expect(snap).toEqual({ schema: 1, sessionId: 's1', updatedAt: NOW, turns: 0, toolCalls: 0 })
    expect('limits' in snap).toBe(false)
    expect('cost' in snap).toBe(false)
  })

  test('derives the context percent from tokens and window', () => {
    const snap = buildSnapshot({
      sessionId: 's1', now: NOW, counters,
      usage: { context: { tokens: 1000, window: 4000 }, rateLimits: [] },
    })
    expect(snap.context).toEqual({ usedTokens: 1000, maxTokens: 4000, usedPercent: 25 })
    expect(snap.limits).toBeUndefined()
  })
})

describe('counters', () => {
  test('update without mutation', () => {
    const a = freshCounters('s1')
    const b = withToolCall(withTurn(a), 'Read')
    expect(a).toEqual({ sessionId: 's1', turns: 0, toolCalls: 0 })
    expect(b).toEqual({ sessionId: 's1', turns: 1, toolCalls: 1, lastTool: 'Read' })
  })

  test('a new session id starts from zero', () => {
    expect(forSession(counters, 's1')).toBe(counters)
    expect(forSession(counters, 's2')).toEqual(freshCounters('s2'))
    expect(forSession(null, 's2')).toEqual(freshCounters('s2'))
  })
})

const seat = (name: string, week: number, five: number, extra: object = {}) => ({
  seat: name, state: 'open', week_used: 0.15, five_hour_used: 0.9,
  week_reset_epoch: week, five_hour_reset_epoch: five, ...extra,
})
const SEATS = [seat('seat-b', 1794949200, 1794413400, { week_used: 0, five_hour_used: 0 }), seat('seat-a', 1794855600, 1794414000)]
const cache = JSON.stringify({ updated_epoch: 1794402600, fetched_at: 1794402600, seats: SEATS })
const OWN = { fiveResetMs: 1794414000000, sevenResetMs: 1794855600000 }

describe('hub read', () => {
  test('reads the pool and the cache path', () => {
    expect(hubPoolOf('work')).toBe('work')
    expect(hubPoolOf('Bad Pool')).toBe(null)
    expect(hubPoolOf(undefined)).toBe(null)
    expect(hubCachePath('/h/', 'work')).toBe('/h/.cache/cliproxy/work.status.json')
    expect(hubCachePath('/h', 'work', 'C:\\x')).toBe('C:/x/cliproxy/work.status.json')
  })

  test('a missing cache gives an unknown seat', () => {
    expect(parseHub('work', null, NOW, OWN)).toEqual({ pool: 'work', seat: null, limits: [] })
  })

  test('a broken or stale cache gives an unknown seat', () => {
    expect(parseHub('work', '{nope', NOW, OWN)).toEqual({ pool: 'work', seat: null, limits: [] })
    expect(parseHub('work', cache, NOW + 700000, OWN)).toEqual({ pool: 'work', seat: null, limits: [] })
  })

  test('names the seat by reset times and gives its limits as used percent', () => {
    const hub = parseHub('work', cache, NOW, OWN)
    expect(hub.seat).toBe('seat-a')
    expect(hub.limits).toEqual([
      { id: 'five_hour', label: '5h', usedPercent: 90, resetsAt: 1794414000000 },
      { id: 'seven_day', label: 'week', usedPercent: 15, resetsAt: 1794855600000 },
    ])
  })

  test('no own readings and several seats leave the seat unknown', () => {
    expect(parseHub('work', cache, NOW, null)).toEqual({ pool: 'work', seat: null, limits: [] })
  })
})
