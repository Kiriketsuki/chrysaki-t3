import { describe, expect, test } from 'claude-code/testing'

import { isServeOn, parsePort, resolveDataDir, sessionFile, sessionsDir } from '../hooks/paths'
import { pythonFor, serverArgv } from '../hooks/server'
import { shouldWriteAfterTool } from '../hooks/throttle'

describe('paths', () => {
  test('the option wins over HOME and USERPROFILE', () => {
    expect(resolveDataDir({ override: 'D:\\stats\\', home: '/h', userProfile: 'C:\\u' })).toBe('D:/stats')
  })

  test('HOME wins over USERPROFILE', () => {
    expect(resolveDataDir({ override: '', home: '/home/a', userProfile: 'C:\\Users\\a' })).toBe('/home/a/.cache/chrysaki-t3-stats')
    expect(resolveDataDir({ override: '', home: '', userProfile: 'C:\\Users\\a\\' })).toBe('C:/Users/a/.cache/chrysaki-t3-stats')
  })

  test('no folder at all gives null', () => {
    expect(resolveDataDir({ override: '', home: undefined, userProfile: undefined })).toBe(null)
  })

  test('the session file name rejects a path escape', () => {
    expect(sessionsDir('/d')).toBe('/d/sessions')
    expect(sessionFile('/d', 'abc-123_X')).toBe('/d/sessions/abc-123_X.json')
    expect(sessionFile('/d', '../evil')).toBe(null)
    expect(sessionFile('/d', 'a/b')).toBe(null)
    expect(sessionFile('/d', '')).toBe(null)
  })

  test('the port falls back to the default', () => {
    expect(parsePort('5000')).toBe(5000)
    expect(parsePort('80')).toBe(4517)
    expect(parsePort('abc')).toBe(4517)
    expect(parsePort('70000')).toBe(4517)
  })

  test('serve is on unless the option says off', () => {
    expect(isServeOn('on')).toBe(true)
    expect(isServeOn('')).toBe(true)
    expect(isServeOn('OFF')).toBe(false)
  })
})

describe('server start argv', () => {
  const base = { pluginRoot: '/p/mod/', dataDir: '/d', port: 4517 }

  test('Windows uses python', () => {
    expect(pythonFor('windows')).toBe('python')
    expect(serverArgv({ ...base, platform: 'windows', pluginRoot: 'C:\\mods\\x\\' })).toEqual([
      'python', 'C:\\mods\\x/server/serve.py', '--detach', '--data', '/d', '--port', '4517',
    ])
  })

  test('Linux, macOS, WSL and unknown use python3', () => {
    for (const platform of ['linux', 'macos', 'wsl', 'unknown', undefined]) {
      expect(serverArgv({ ...base, platform })[0]).toBe('python3')
    }
    expect(serverArgv({ ...base, platform: 'linux' })).toEqual([
      'python3', '/p/mod/server/serve.py', '--detach', '--data', '/d', '--port', '4517',
    ])
  })
})

describe('write throttle', () => {
  test('writes the first time and after the gap', () => {
    expect(shouldWriteAfterTool(null, 1000, 5000)).toBe(true)
    expect(shouldWriteAfterTool(1000, 5999, 5000)).toBe(false)
    expect(shouldWriteAfterTool(1000, 6000, 5000)).toBe(true)
  })

  test('writes when the clock moved back', () => {
    expect(shouldWriteAfterTool(9000, 1000, 5000)).toBe(true)
  })
})
