// @vitest-environment jsdom
import React from 'react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import * as matchers from '@testing-library/jest-dom/matchers'
import TourOverlay from './TourOverlay'

expect.extend(matchers)

beforeEach(() => {
  ;(window as any).settings = {
    get: vi.fn().mockResolvedValue({ tourCompleted: false }),
    set: vi.fn().mockResolvedValue(undefined),
  }
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('TourOverlay', () => {
  it('renders the first step title', async () => {
    render(<TourOverlay onDone={vi.fn()} />)
    expect(await screen.findByText(/your cluster at a glance/i)).toBeInTheDocument()
  })

  it('advances to next step on Next click', async () => {
    render(<TourOverlay onDone={vi.fn()} />)
    await screen.findByText(/your cluster at a glance/i)
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    expect(screen.getByText(/browse all workloads/i)).toBeInTheDocument()
  })

  it('calls onDone when Skip is clicked', async () => {
    const onDone = vi.fn()
    render(<TourOverlay onDone={onDone} />)
    await screen.findByText(/your cluster at a glance/i)
    fireEvent.click(screen.getByRole('button', { name: /skip/i }))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('calls onDone on final step Done click', async () => {
    const onDone = vi.fn()
    render(<TourOverlay onDone={onDone} />)
    // advance through all 5 steps
    for (let i = 0; i < 4; i++) {
      await screen.findByRole('button', { name: /next/i })
      fireEvent.click(screen.getByRole('button', { name: /next/i }))
    }
    fireEvent.click(screen.getByRole('button', { name: /done/i }))
    expect(onDone).toHaveBeenCalledTimes(1)
  })
})
