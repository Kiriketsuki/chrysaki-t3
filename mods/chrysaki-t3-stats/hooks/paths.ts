// Pure path and option logic. No I/O happens here.

import { DATA_SUBDIR, DEFAULT_PORT, MAX_PORT, MIN_PORT, SESSIONS_SUBDIR, SESSION_ID_RE } from './constants'

export type PathEnv = {
  override: string
  home: string | undefined
  userProfile: string | undefined
}

function slashed(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '')
}

function nonEmpty(value: string | undefined): value is string {
  return value !== undefined && value.trim() !== ''
}

// The data folder. The option wins. Otherwise HOME, then USERPROFILE. Null
// when none of the three exists, and the mod then writes nothing.
export function resolveDataDir(env: PathEnv): string | null {
  if (nonEmpty(env.override)) return slashed(env.override.trim())
  const home = nonEmpty(env.home) ? env.home : env.userProfile
  return nonEmpty(home) ? `${slashed(home.trim())}/${DATA_SUBDIR}` : null
}

export function sessionsDir(dataDir: string): string {
  return `${dataDir}/${SESSIONS_SUBDIR}`
}

// The file of one session, or null when the id has a character that could
// leave the folder. The server accepts the same names.
export function sessionFile(dataDir: string, sessionId: string): string | null {
  return SESSION_ID_RE.test(sessionId) ? `${sessionsDir(dataDir)}/${sessionId}.json` : null
}

// The port from the option text. A value outside the user port range falls
// back to the default.
export function parsePort(text: string): number {
  const n = Number(text.trim())
  return Number.isInteger(n) && n >= MIN_PORT && n <= MAX_PORT ? n : DEFAULT_PORT
}

export function isServeOn(text: string): boolean {
  return text.trim().toLowerCase() !== 'off'
}
