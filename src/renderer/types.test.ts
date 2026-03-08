import { describe, it, expect } from 'vitest'
import { formatAge, podPhaseBg, parseCpuMillicores, parseMemoryMiB } from './types'

describe('formatAge', () => {
  it('returns human-readable age for past timestamp', () => {
    const past = new Date(Date.now() - 65 * 1000)
    expect(formatAge(past.toISOString())).toMatch(/\d+m/)
  })

  it('returns 0s for very recent timestamp', () => {
    const now = new Date()
    expect(formatAge(now.toISOString())).toMatch(/0s|\d+s/)
  })
})

describe('podPhaseBg', () => {
  it('returns tailwind class for Running', () => {
    expect(podPhaseBg('Running')).toContain('green')
  })
  it('returns tailwind class for Pending', () => {
    expect(podPhaseBg('Pending')).toContain('yellow')
  })
  it('returns tailwind class for Failed', () => {
    expect(podPhaseBg('Failed')).toContain('red')
  })
})

describe('parseCpuMillicores', () => {
  it('parses millicores with m suffix', () => {
    expect(parseCpuMillicores('100m')).toBe(100)
  })
  it('parses nanocores string', () => {
    expect(parseCpuMillicores('100000000n')).toBe(100)
  })
})

describe('parseMemoryMiB', () => {
  it('parses Ki string', () => {
    expect(parseMemoryMiB('1024Ki')).toBe(1)
  })
  it('parses Mi string', () => {
    expect(parseMemoryMiB('512Mi')).toBe(512)
  })
})
