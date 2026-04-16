import { describe, it, expect, vi, beforeEach } from 'vitest'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

vi.mock('fs', () => ({ existsSync: vi.fn() }))
vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))

// Import after mocks
const { detectKrew } = await import('./krew')

describe('detectKrew', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns true when kubectl-krew binary exists', () => {
    vi.mocked(existsSync).mockReturnValue(true)
    expect(detectKrew()).toBe(true)
    expect(existsSync).toHaveBeenCalledWith(
      join(homedir(), '.krew', 'bin', 'kubectl-krew')
    )
  })

  it('returns false when kubectl-krew binary is absent', () => {
    vi.mocked(existsSync).mockReturnValue(false)
    expect(detectKrew()).toBe(false)
  })

  it('returns false on Windows regardless of file existence', () => {
    const originalPlatform = process.platform
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
    vi.mocked(existsSync).mockReturnValue(true)
    expect(detectKrew()).toBe(false)
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
  })
})
