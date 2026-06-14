import { describe, it, expect, vi } from 'vitest'
import { confirmIfProduction } from './productionGuard'

describe('confirmIfProduction', () => {
  it('shows the confirmation and does NOT act when production', () => {
    const showConfirm = vi.fn()
    const performAction = vi.fn()

    confirmIfProduction(true, showConfirm, performAction)

    expect(showConfirm).toHaveBeenCalledTimes(1)
    expect(performAction).not.toHaveBeenCalled()
  })

  it('acts immediately and does NOT confirm when not production', () => {
    const showConfirm = vi.fn()
    const performAction = vi.fn()

    confirmIfProduction(false, showConfirm, performAction)

    expect(performAction).toHaveBeenCalledTimes(1)
    expect(showConfirm).not.toHaveBeenCalled()
  })

  it('invokes exactly one branch (mutually exclusive) for each value', () => {
    for (const isProduction of [true, false]) {
      const showConfirm = vi.fn()
      const performAction = vi.fn()

      confirmIfProduction(isProduction, showConfirm, performAction)

      expect(showConfirm.mock.calls.length + performAction.mock.calls.length).toBe(1)
    }
  })

  it('does not swallow errors thrown by the chosen branch', () => {
    const boom = () => {
      throw new Error('action failed')
    }
    expect(() => confirmIfProduction(false, vi.fn(), boom)).toThrow('action failed')
    expect(() => confirmIfProduction(true, boom, vi.fn())).toThrow('action failed')
  })
})
