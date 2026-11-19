// The write throttle. A tool call writes at most once per minimum gap. The
// other events always write, so their callers do not ask.

export function shouldWriteAfterTool(lastWriteMs: number | null, nowMs: number, minGapMs: number): boolean {
  return lastWriteMs === null || nowMs - lastWriteMs >= minGapMs || nowMs < lastWriteMs
}
