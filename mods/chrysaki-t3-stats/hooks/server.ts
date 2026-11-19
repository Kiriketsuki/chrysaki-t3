// The argument vector that starts the page server.

export type ServerStart = {
  platform: string | undefined
  pluginRoot: string
  dataDir: string
  port: number
}

// On Windows, `python3` is a .cmd shim that a direct process start cannot run.
export function pythonFor(platform: string | undefined): string {
  return platform === 'windows' ? 'python' : 'python3'
}

// $.process.run waits until the child closes its pipes. The --detach flag
// makes serve.py start its own copy with no pipes, in a new session or a
// detached process, and then exit at once. That form works the same on every
// platform, so no setsid or `cmd /c start` wrapper is needed.
export function serverArgv(start: ServerStart): string[] {
  const root = start.pluginRoot.replace(/[\\/]+$/, '')
  return [
    pythonFor(start.platform),
    `${root}/server/serve.py`,
    '--detach',
    '--data',
    start.dataDir,
    '--port',
    String(start.port),
  ]
}
