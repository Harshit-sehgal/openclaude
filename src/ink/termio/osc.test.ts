import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

const originalEnv = { ...process.env }
const originalPlatform = process.platform

const execFileNoThrowMock = mock(
  async () => ({ code: 0, stdout: '', stderr: '' }),
)

mock.module('../../utils/execFileNoThrow.js', () => ({
  execFileNoThrow: execFileNoThrowMock,
}))

async function importFreshOscModule() {
  return import(`./osc.ts?ts=${Date.now()}-${Math.random()}`)
}

describe('Windows clipboard fallback', () => {
  beforeEach(() => {
    execFileNoThrowMock.mockClear()
    process.env = { ...originalEnv }
    delete process.env['SSH_CONNECTION']
    delete process.env['TMUX']
    Object.defineProperty(process, 'platform', { value: 'win32' })
  })

  afterEach(() => {
    mock.restore()
    process.env = { ...originalEnv }
    Object.defineProperty(process, 'platform', { value: originalPlatform })
  })

  test('uses PowerShell instead of clip.exe for local Windows copy', async () => {
    const { setClipboard } = await importFreshOscModule()

    await setClipboard('Привет мир')

    expect(execFileNoThrowMock.mock.calls.some(([cmd]) => cmd === 'clip')).toBe(
      false,
    )
    expect(
      execFileNoThrowMock.mock.calls.some(([cmd]) => cmd === 'powershell'),
    ).toBe(true)
  })

  test('passes the original Unicode text to the Windows copy command', async () => {
    const { setClipboard } = await importFreshOscModule()

    await setClipboard('Привет мир')

    const windowsCall = execFileNoThrowMock.mock.calls.find(
      ([cmd]) => cmd === 'powershell',
    )

    expect(windowsCall?.[2]).toMatchObject({ input: 'Привет мир' })
  })
})

describe('clipboard path behavior remains stable', () => {
  beforeEach(() => {
    execFileNoThrowMock.mockClear()
    process.env = { ...originalEnv }
    delete process.env['SSH_CONNECTION']
    delete process.env['TMUX']
  })

  afterEach(() => {
    mock.restore()
    process.env = { ...originalEnv }
    Object.defineProperty(process, 'platform', { value: originalPlatform })
  })

  test('getClipboardPath stays native on local macOS', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' })
    const { getClipboardPath } = await importFreshOscModule()

    expect(getClipboardPath()).toBe('native')
  })

  test('getClipboardPath stays tmux-buffer when TMUX is set', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' })
    process.env['TMUX'] = '/tmp/tmux-1000/default,123,0'
    const { getClipboardPath } = await importFreshOscModule()

    expect(getClipboardPath()).toBe('tmux-buffer')
  })

  test('Windows clipboard fallback is skipped over SSH', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' })
    process.env['SSH_CONNECTION'] = '1 2 3 4'
    const { setClipboard } = await importFreshOscModule()

    await setClipboard('Привет мир')

    expect(execFileNoThrowMock.mock.calls.some(([cmd]) => cmd === 'powershell')).toBe(
      false,
    )
  })

  test('local macOS clipboard fallback still uses pbcopy', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' })
    const { setClipboard } = await importFreshOscModule()

    await setClipboard('hello')

    expect(execFileNoThrowMock.mock.calls.some(([cmd]) => cmd === 'pbcopy')).toBe(
      true,
    )
  })
})
