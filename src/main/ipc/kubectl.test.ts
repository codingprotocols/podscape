import { vi, describe, it, expect, beforeEach } from 'vitest'

// Mock sidecar dependencies before importing the module under test
vi.mock('../sidecar/api', () => ({
  sidecarFetch: vi.fn(),
  checkedSidecarFetch: vi.fn(),
}))
vi.mock('../sidecar/runtime', () => ({ activeSidecarPort: 5050 }))
vi.mock('../sidecar/auth', () => ({ sidecarToken: 'test-token' }))
vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))
vi.mock('../../common/constants', () => ({
  SIDECAR_HOST: '127.0.0.1',
  SIDECAR_PORT: 5050,
  SIDECAR_BASE_URL: 'http://127.0.0.1:5050',
  SIDECAR_WS_URL: 'ws://127.0.0.1:5050',
}))

import { KubectlProvider, RBACDeniedError } from './kubectl'
import { sidecarFetch, checkedSidecarFetch } from '../sidecar/api'

const mockSidecarFetch = sidecarFetch as ReturnType<typeof vi.fn>
const mockCheckedFetch = checkedSidecarFetch as ReturnType<typeof vi.fn>

function makeJsonResponse(data: any, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

describe('KubectlProvider.getResources', () => {
  let provider: KubectlProvider

  beforeEach(() => {
    provider = new KubectlProvider()
    vi.clearAllMocks()
  })

  it('routes known kind to sidecar path with namespace', async () => {
    mockSidecarFetch.mockResolvedValueOnce(makeJsonResponse([{ kind: 'Pod' }]))
    const result = await provider.getResources('ctx', 'default', 'pods')
    expect(mockSidecarFetch).toHaveBeenCalledWith('/pods?namespace=default')
    expect(result).toHaveLength(1)
  })

  it('routes known kind without namespace (cluster-scoped)', async () => {
    mockSidecarFetch.mockResolvedValueOnce(makeJsonResponse([]))
    await provider.getResources('ctx', undefined, 'nodes')
    expect(mockSidecarFetch).toHaveBeenCalledWith('/nodes')
  })

  it('routes unknown kind to /customresource?crd=...', async () => {
    mockSidecarFetch.mockResolvedValueOnce(makeJsonResponse([]))
    await provider.getResources('ctx', 'default', 'virtualservices.networking.istio.io')
    expect(mockSidecarFetch).toHaveBeenCalledWith(
      '/customresource?crd=virtualservices.networking.istio.io&namespace=default'
    )
  })

  it('throws RBACDeniedError when X-Podscape-Denied header is true', async () => {
    mockSidecarFetch.mockResolvedValueOnce(
      makeJsonResponse([], { 'X-Podscape-Denied': 'true' })
    )
    await expect(provider.getResources('ctx', 'default', 'pods')).rejects.toBeInstanceOf(RBACDeniedError)
  })

  it('returns empty array when sidecar returns non-OK for known kind', async () => {
    mockSidecarFetch.mockResolvedValueOnce(new Response('', { status: 503 }))
    const result = await provider.getResources('ctx', 'default', 'pods')
    expect(result).toEqual([])
  })

  it('throws Error for non-OK sidecar response for custom resource (non-404)', async () => {
    mockSidecarFetch.mockResolvedValueOnce(
      new Response('operator not running', { status: 500 })
    )
    await expect(
      provider.getResources('ctx', 'default', 'ingressroutes.traefik.io')
    ).rejects.toThrow('Failed to load ingressroutes.traefik.io')
  })

  it('returns empty array for 404 on custom resource (operator offline)', async () => {
    mockSidecarFetch.mockResolvedValueOnce(new Response('', { status: 404 }))
    const result = await provider.getResources('ctx', 'default', 'ingressroutes.traefik.io')
    expect(result).toEqual([])
  })
})

describe('KubectlProvider.scaleResource', () => {
  let provider: KubectlProvider

  beforeEach(() => {
    provider = new KubectlProvider()
    vi.clearAllMocks()
  })

  it('calls /scale with correct query params', async () => {
    mockCheckedFetch.mockResolvedValueOnce(new Response('ok', { status: 200 }))
    await provider.scaleResource('ctx', 'default', 'deployment', 'web', 5)
    expect(mockCheckedFetch).toHaveBeenCalledWith(
      '/scale?namespace=default&kind=deployment&name=web&replicas=5'
    )
  })

  it('returns success message', async () => {
    mockCheckedFetch.mockResolvedValueOnce(new Response('ok', { status: 200 }))
    const result = await provider.scaleResource('ctx', 'default', 'deployment', 'web', 3)
    expect(result).toBe('Scaled successfully')
  })
})

describe('KubectlProvider.rolloutRestart', () => {
  let provider: KubectlProvider

  beforeEach(() => {
    provider = new KubectlProvider()
    vi.clearAllMocks()
  })

  it('calls /rollout/restart with correct query params', async () => {
    mockCheckedFetch.mockResolvedValueOnce(new Response('ok', { status: 200 }))
    await provider.rolloutRestart('ctx', 'default', 'deployment', 'web')
    expect(mockCheckedFetch).toHaveBeenCalledWith(
      '/rollout/restart?namespace=default&kind=deployment&name=web'
    )
  })
})

describe('KubectlProvider.deleteResource', () => {
  let provider: KubectlProvider

  beforeEach(() => {
    provider = new KubectlProvider()
    vi.clearAllMocks()
  })

  it('calls /delete with correct query params', async () => {
    mockCheckedFetch.mockResolvedValueOnce(new Response('ok', { status: 200 }))
    await provider.deleteResource('ctx', 'default', 'pod', 'web-abc')
    expect(mockCheckedFetch).toHaveBeenCalledWith(
      '/delete?namespace=default&kind=pod&name=web-abc'
    )
  })

  it('handles null namespace (cluster-scoped)', async () => {
    mockCheckedFetch.mockResolvedValueOnce(new Response('ok', { status: 200 }))
    await provider.deleteResource('ctx', null, 'node', 'worker-1')
    expect(mockCheckedFetch).toHaveBeenCalledWith('/delete?namespace=&kind=node&name=worker-1')
  })
})

describe('KubectlProvider.rolloutHistory', () => {
  let provider: KubectlProvider

  beforeEach(() => {
    provider = new KubectlProvider()
    vi.clearAllMocks()
  })

  it('calls /rollout/history and returns parsed JSON', async () => {
    const revisions = [{ revision: 3, current: true, age: '1d', images: ['nginx:v3'], desired: 3, ready: 3 }]
    mockCheckedFetch.mockResolvedValueOnce(makeJsonResponse(revisions))
    const result = await provider.rolloutHistory('ctx', 'default', 'deployment', 'web')
    expect(result).toEqual(revisions)
    expect(mockCheckedFetch).toHaveBeenCalledWith(
      '/rollout/history?namespace=default&kind=deployment&name=web'
    )
  })
})

describe('KubectlProvider.rolloutUndo', () => {
  let provider: KubectlProvider

  beforeEach(() => {
    provider = new KubectlProvider()
    vi.clearAllMocks()
  })

  it('calls /rollout/undo with revision', async () => {
    mockCheckedFetch.mockResolvedValueOnce(new Response('ok', { status: 200 }))
    await provider.rolloutUndo('ctx', 'default', 'deployment', 'web', 2)
    expect(mockCheckedFetch).toHaveBeenCalledWith(
      '/rollout/undo?namespace=default&kind=deployment&name=web&revision=2'
    )
  })

  it('calls /rollout/undo without revision when omitted', async () => {
    mockCheckedFetch.mockResolvedValueOnce(new Response('ok', { status: 200 }))
    await provider.rolloutUndo('ctx', 'default', 'deployment', 'web')
    expect(mockCheckedFetch).toHaveBeenCalledWith(
      '/rollout/undo?namespace=default&kind=deployment&name=web'
    )
  })
})

describe('KubectlProvider.getPodMetrics', () => {
  let provider: KubectlProvider

  beforeEach(() => {
    provider = new KubectlProvider()
    vi.clearAllMocks()
  })

  it('returns items from data.items when response is not an array', async () => {
    mockSidecarFetch.mockResolvedValueOnce(makeJsonResponse({ items: [{ name: 'pod-1' }] }))
    const result = await provider.getPodMetrics('ctx', 'default')
    expect(result).toEqual([{ name: 'pod-1' }])
  })

  it('returns empty array on non-OK response', async () => {
    mockSidecarFetch.mockResolvedValueOnce(new Response('', { status: 503 }))
    const result = await provider.getPodMetrics('ctx', 'default')
    expect(result).toEqual([])
  })
})

describe('RBACDeniedError', () => {
  it('has correct name and message', () => {
    const err = new RBACDeniedError('pods')
    expect(err.name).toBe('RBACDeniedError')
    expect(err.message).toBe('RBAC_DENIED:pods')
    expect(err.kind).toBe('pods')
    expect(err).toBeInstanceOf(Error)
  })
})
