// Builds the session file content. Pure: the caller gives every value.

import { SCHEMA_VERSION } from './constants'
import type { Counters } from './counters'
import type { HubSnapshot } from './hub'
import { clampPercent, limitsFromEngine } from './limits'
import type { EngineRateLimit, Limit } from './limits'

export type UsageInput = {
  startedAt?: number
  context?: { tokens?: number; window?: number; percent?: number }
  rateLimits?: readonly EngineRateLimit[]
  cost?: { usd: number }
}

export type SnapshotInput = {
  sessionId: string
  now: number
  cwd?: string
  model?: string
  platform?: string
  usage?: UsageInput
  hub?: HubSnapshot
  counters: Counters
}

export type Snapshot = {
  schema: number
  sessionId: string
  updatedAt: number
  cwd?: string
  model?: string
  platform?: string
  startedAt?: number
  context?: { usedTokens?: number; maxTokens?: number; usedPercent?: number }
  limits?: Limit[]
  cost?: { usd: number }
  hub?: HubSnapshot
  turns: number
  toolCalls: number
  lastTool?: string
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function text(v: string | undefined): string | undefined {
  return v === undefined || v === '' ? undefined : v
}

// The percent from the engine, else tokens over window.
function contextOf(c: UsageInput['context']): Snapshot['context'] {
  if (c === undefined) return undefined
  const usedTokens = isNum(c.tokens) ? c.tokens : undefined
  const maxTokens = isNum(c.window) && c.window > 0 ? c.window : undefined
  const derived = usedTokens !== undefined && maxTokens !== undefined ? (usedTokens / maxTokens) * 100 : undefined
  const raw = isNum(c.percent) ? c.percent : derived
  const usedPercent = raw === undefined ? undefined : clampPercent(raw)
  if (usedTokens === undefined && maxTokens === undefined && usedPercent === undefined) return undefined
  return {
    ...(usedTokens === undefined ? {} : { usedTokens }),
    ...(maxTokens === undefined ? {} : { maxTokens }),
    ...(usedPercent === undefined ? {} : { usedPercent }),
  }
}

// A field the engine does not give is left out, never zeroed.
export function buildSnapshot(input: SnapshotInput): Snapshot {
  const { usage, counters } = input
  const limits = usage?.rateLimits === undefined ? [] : limitsFromEngine(usage.rateLimits)
  const cost = usage?.cost !== undefined && isNum(usage.cost.usd) ? { usd: usage.cost.usd } : undefined
  const optional = {
    cwd: text(input.cwd),
    model: text(input.model),
    platform: text(input.platform),
    startedAt: isNum(usage?.startedAt) ? usage?.startedAt : undefined,
    context: contextOf(usage?.context),
    limits: limits.length === 0 ? undefined : limits,
    cost,
    hub: input.hub,
    lastTool: counters.lastTool,
  }
  const present = Object.fromEntries(Object.entries(optional).filter(([, v]) => v !== undefined))
  return {
    schema: SCHEMA_VERSION,
    sessionId: input.sessionId,
    updatedAt: input.now,
    ...present,
    turns: counters.turns,
    toolCalls: counters.toolCalls,
  }
}
