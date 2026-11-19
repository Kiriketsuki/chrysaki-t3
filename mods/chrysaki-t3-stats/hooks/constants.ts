// Every number and name the mod shares. Keeping them here avoids a magic
// value inside a hook.

export const SCHEMA_VERSION = 1
export const DATA_SUBDIR = '.cache/chrysaki-t3-stats'
export const SESSIONS_SUBDIR = 'sessions'
export const DEFAULT_PORT = 4517
export const MIN_PORT = 1024
export const MAX_PORT = 65535

// One write per this period after a tool call. A burst of tool calls would
// otherwise rewrite the file many times a second.
export const TOOL_WRITE_MIN_GAP_MS = 5000
// The timer period. It keeps the age on the page small and refreshes the
// rate-limit windows while the model works.
export const TIMER_PERIOD_MS = 30000
export const SERVER_START_TIMEOUT_MS = 10000

// A hub cache older than this is stale, as in chrysaki-statusline.
export const HUB_STALE_MS = 600000
// Two reset times within this many milliseconds name the same window.
export const HUB_MATCH_MS = 5000
export const MS_PER_HOUR = 3600000

export const SESSION_ID_RE = /^[A-Za-z0-9_-]+$/
export const POOL_RE = /^[a-z0-9-]+$/
