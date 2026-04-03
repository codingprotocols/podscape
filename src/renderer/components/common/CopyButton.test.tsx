// @vitest-environment jsdom
import React from 'react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import * as matchers from '@testing-library/jest-dom/matchers'
import CopyButton from './CopyButton'

expect.extend(matchers)

beforeEach(() => {
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('CopyButton', () => {
  it('renders a copy button', () => {
    render(<CopyButton value="hello" />)
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('calls clipboard.writeText with the value on click', async () => {
    render(<CopyButton value="my-value" />)
    await act(async () => { fireEvent.click(screen.getByRole('button')) })
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('my-value')
  })

  it('shows check icon briefly after click then reverts', async () => {
    vi.useFakeTimers()
    render(<CopyButton value="test" />)
    const btn = screen.getByRole('button')

    await act(async () => { fireEvent.click(btn) })
    expect(btn).toHaveAttribute('data-copied', 'true')

    await act(async () => { vi.advanceTimersByTime(2000) })
    expect(btn).toHaveAttribute('data-copied', 'false')

    vi.useRealTimers()
  })
})
