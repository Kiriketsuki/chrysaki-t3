import type { EngineInterface, Register } from 'claude-code'

import { SERVER_START_TIMEOUT_MS, TIMER_PERIOD_MS, TOOL_WRITE_MIN_GAP_MS } from './constants'
import { forSession, freshCounters, withToolCall, withTurn } from './counters'
import type { Counters } from './counters'
import { hubCachePath, hubPoolOf, parseHub } from './hub'
import { resetsOf } from './limits'
import { isServeOn, parsePort, resolveDataDir, sessionFile } from './paths'
import { serverArgv } from './server'
import { buildSnapshot } from './snapshot'
import type { UsageInput } from './snapshot'
import { shouldWriteAfterTool } from './throttle'

type Options = Readonly<Record<string, unknown>>

// Every lookup can fail in a test or an older engine. A failure gives the
// fallback, so a hook never breaks because of a missing noun.
async function attempt<T>(read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read()
  } catch {
    return fallback
  }
}

function optionText(options: Options, key: string): string {
  const value = options[key]
  return typeof value === 'string' ? value : ''
}

// The data folder from the option, then HOME, then USERPROFILE.
async function dataDirOf($: EngineInterface, options: Options): Promise<string | null> {
  const [home, userProfile] = await Promise.all([
    attempt(() => $.env.get('HOME'), undefined),
    attempt(() => $.env.get('USERPROFILE'), undefined),
  ])
  return resolveDataDir({ override: optionText(options, 'dataDir'), home, userProfile })
}

// The counters of the current session id. A /clear gives a new id, and the
// counters then start from zero.
async function countersFor($: EngineInterface, previous: Counters | null): Promise<Counters> {
  const id = await attempt(() => $.session.id(), '')
  return id === '' ? previous ?? freshCounters('') : forSession(previous, id)
}

async function hubOf($: EngineInterface, usage: UsageInput | undefined, now: number) {
  const pool = hubPoolOf(await attempt(() => $.env.get('CLAUDE_HUB_POOL'), undefined))
  if (pool === null) return undefined
  const [home, userProfile, xdg] = await Promise.all([
    attempt(() => $.env.get('HOME'), undefined),
    attempt(() => $.env.get('USERPROFILE'), undefined),
    attempt(() => $.env.get('XDG_CACHE_HOME'), undefined),
  ])
  const path = hubCachePath(home ?? userProfile ?? '', pool, xdg)
  const text = await attempt(() => $.fs.read(path), null)
  const own = usage?.rateLimits === undefined || usage.rateLimits.length === 0 ? null : resetsOf(usage.rateLimits)
  return parseHub(pool, typeof text === 'string' ? text : null, now, own)
}

// Writes the whole file of the session. It never throws: a failed write waits
// for the next event or timer tick.
async function writeSnapshot($: EngineInterface, options: Options, counters: Counters): Promise<void> {
  try {
    const dataDir = await dataDirOf($, options)
    const file = dataDir === null ? null : sessionFile(dataDir, counters.sessionId)
    if (file === null) return
    const [now, cwd, model, info, usage] = await Promise.all([
      attempt(() => $.clock.now(), Date.now()),
      attempt(() => $.session.cwd(), undefined),
      attempt(() => $.session.model(), undefined),
      attempt(() => $.session.info(), undefined),
      attempt(() => $.session.usage(), undefined),
    ])
    const hub = await hubOf($, usage, now)
    const snapshot = buildSnapshot({
      sessionId: counters.sessionId,
      now,
      cwd,
      model,
      platform: info?.platform,
      usage,
      hub,
      counters,
    })
    await $.fs.write(file, JSON.stringify(snapshot))
  } catch {
    // The next event writes again.
  }
}

// Starts the page server. serve.py detaches itself and exits at once, so the
// call returns fast. A second start finds the port in use and exits quietly.
async function startServer($: EngineInterface, options: Options): Promise<void> {
  try {
    if (!isServeOn(optionText(options, 'serve') || 'on')) return
    const dataDir = await dataDirOf($, options)
    if (dataDir === null) return
    const info = await attempt(() => $.session.info(), undefined)
    const argv = serverArgv({
      platform: info?.platform,
      pluginRoot: $.plugin.root,
      dataDir,
      port: parsePort(optionText(options, 'port')),
    })
    await $.process.run(argv, { timeoutMs: SERVER_START_TIMEOUT_MS })
  } catch {
    // No server means no page. The files still get written.
  }
}

export const register: Register = (on, options) => {
  let counters: Counters | null = null
  let lastToolWriteMs: number | null = null

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    counters = await countersFor($, counters)
    await startServer($, options)
    await writeSnapshot($, options, counters)
    $.clock.every(TIMER_PERIOD_MS, () => {
      void (async () => {
        counters = await countersFor($, counters)
        await writeSnapshot($, options, counters)
      })()
    })
    return result
  })

  on('prompt.submit', async ($, e, next) => {
    counters = await countersFor($, counters)
    await writeSnapshot($, options, counters)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    const isSubagent = (e as { agentId?: string }).agentId !== undefined
    const base = await countersFor($, counters)
    counters = isSubagent ? base : withTurn(base)
    await writeSnapshot($, options, counters)
    return result
  })

  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    const base = await countersFor($, counters)
    counters = withToolCall(base, String(e.tool))
    const now = await attempt(() => $.clock.now(), Date.now())
    if (shouldWriteAfterTool(lastToolWriteMs, now, TOOL_WRITE_MIN_GAP_MS)) {
      lastToolWriteMs = now
      await writeSnapshot($, options, counters)
    }
    return result
  })
}
