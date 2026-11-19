// The counters of one session. Each function returns a new object.

export type Counters = {
  sessionId: string
  turns: number
  toolCalls: number
  lastTool?: string
}

export function freshCounters(sessionId: string): Counters {
  return { sessionId, turns: 0, toolCalls: 0 }
}

// A /clear gives the process a new session id and fires no session.start.
// The counters then start again from zero.
export function forSession(current: Counters | null, sessionId: string): Counters {
  return current !== null && current.sessionId === sessionId ? current : freshCounters(sessionId)
}

export function withTurn(counters: Counters): Counters {
  return { ...counters, turns: counters.turns + 1 }
}

export function withToolCall(counters: Counters, tool: string): Counters {
  return { ...counters, toolCalls: counters.toolCalls + 1, lastTool: tool }
}
