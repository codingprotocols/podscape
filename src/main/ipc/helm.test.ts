import { describe, it, expect } from 'vitest'
import { transformRelease } from './helm'

describe('transformRelease', () => {
  it('maps camelCase keys (sidecar format)', () => {
    const raw = {
      name: 'my-release',
      namespace: 'production',
      version: 3,
      info: { last_deployed: '2024-01-01T00:00:00Z', status: 'deployed', description: 'Install complete' },
      chart: { metadata: { name: 'nginx', version: '1.2.3', appVersion: '1.25' } },
    }
    expect(transformRelease(raw)).toEqual({
      name: 'my-release',
      namespace: 'production',
      revision: '3',
      updated: '2024-01-01T00:00:00Z',
      status: 'deployed',
      chart: 'nginx-1.2.3',
      chart_name: 'nginx',
      chart_version: '1.2.3',
      app_version: '1.25',
      description: 'Install complete',
    })
  })

  it('maps PascalCase keys (alternate sidecar format)', () => {
    const raw = {
      Name: 'my-release',
      Namespace: 'staging',
      Version: 2,
      Info: { LastDeployed: '2024-06-01T00:00:00Z', Status: 'superseded', Description: 'Upgrade' },
      Chart: { Metadata: { name: 'redis', version: '7.0.0', AppVersion: '7.0' } },
    }
    const result = transformRelease(raw)
    expect(result.name).toBe('my-release')
    expect(result.namespace).toBe('staging')
    expect(result.revision).toBe('2')
    expect(result.status).toBe('superseded')
    expect(result.chart).toBe('redis-7.0.0')
    expect(result.app_version).toBe('7.0')
  })

  it('returns safe defaults when all fields are missing', () => {
    const result = transformRelease({})
    expect(result).toEqual({
      name: '',
      namespace: '',
      revision: '0',
      updated: '',
      status: 'unknown',
      chart: 'unknown',
      chart_name: '',
      chart_version: '',
      app_version: '',
      description: '',
    })
  })

  it('sets chart to "unknown" when metadata.name is absent', () => {
    const raw = { chart: { metadata: {} } }
    expect(transformRelease(raw).chart).toBe('unknown')
  })

  it('builds chart string with trailing dash when version is absent', () => {
    // Documents current behavior: name present but version absent → 'myapp-'
    const raw = { chart: { metadata: { name: 'myapp' } } }
    expect(transformRelease(raw).chart).toBe('myapp-')
  })

  it('converts numeric version to string', () => {
    const raw = { version: 10 }
    expect(transformRelease(raw).revision).toBe('10')
  })
})
