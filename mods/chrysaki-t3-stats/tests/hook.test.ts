import { expect, test } from 'claude-code/testing'

const TOOL_OK = { result: { stdout: '', stderr: '', interrupted: false }, text: 'ok' }

function answers(on: any, written: Array<{ path: string; text: string }>) {
  on('session.id', async () => ({ value: 'sess-1' }))
  on('session.cwd', async () => ({ value: '/w/app' }))
  on('session.model', async () => ({ value: 'opus' }))
  on('session.info', async () => ({ value: { transcriptPath: '', platform: 'linux' } }))
  on('session.usage', async () => ({
    value: { startedAt: 1, context: { window: 1000, tokens: 100, percent: 10 }, rateLimits: [] },
  }))
  on('clock.now', async () => ({ value: 1000 }))
  on('env.get', async (_$: unknown, e: { name: string }) => ({ value: e.name === 'HOME' ? '/h' : undefined }))
  on('fs.write', async (_$: unknown, e: { path: string; text: string }) => {
    written.push({ path: e.path, text: e.text })
    return { value: undefined }
  })
  on('tool.call', { tool: 'Bash' }, async () => TOOL_OK)
}

test('a tool call writes the session file once per gap and counts calls', async ($, on) => {
  const written: Array<{ path: string; text: string }> = []
  answers(on, written)

  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await $.tool.call({ tool: 'Bash', command: 'ls' })

  // The mocked clock does not move, so the second call stays under the gap.
  expect(written.length).toBe(1)
  // Windows resolves the path against a drive, so compare the tail only.
  expect((written[0]?.path ?? '').replace(/\\/g, '/').endsWith('/h/.cache/chrysaki-t3-stats/sessions/sess-1.json')).toBe(true)
  const body = JSON.parse(written[0]?.text ?? '{}')
  expect(body.sessionId).toBe('sess-1')
  expect(body.cwd).toBe('/w/app')
  expect(body.lastTool).toBe('Bash')
  expect(body.toolCalls).toBe(1)
})

test('a failed lookup never breaks the hook', async ($, on) => {
  on('tool.call', { tool: 'Bash' }, async () => TOOL_OK)
  const r = await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(r.deny).toBeUndefined()
})
