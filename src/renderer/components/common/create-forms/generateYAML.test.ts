import { describe, it, expect } from 'vitest'
import {
    generateDeploymentYAML,
    generateServiceYAML,
    generateConfigMapYAML,
    generateSecretYAML,
    generateNamespaceYAML,
    DNS_LABEL_RE,
} from './generateYAML'

describe('generateDeploymentYAML', () => {
    it('produces valid Deployment YAML', () => {
        const yaml = generateDeploymentYAML({
            name: 'my-api', namespace: 'default', image: 'nginx:latest',
            replicas: 2, port: '80', envVars: [{ key: 'ENV', value: 'prod' }],
            labels: [{ key: 'app', value: 'my-api' }],
        })
        expect(yaml).toContain('kind: Deployment')
        expect(yaml).toContain('name: my-api')
        expect(yaml).toContain('replicas: 2')
        expect(yaml).toContain('image: nginx:latest')
        expect(yaml).toContain('containerPort: 80')
        expect(yaml).toContain('name: ENV')
        expect(yaml).toContain('app: my-api')
    })

    it('omits port when empty', () => {
        const yaml = generateDeploymentYAML({
            name: 'x', namespace: 'default', image: 'busybox',
            replicas: 1, port: '', envVars: [], labels: [],
        })
        expect(yaml).not.toContain('ports:')
    })

    it('omits env when empty', () => {
        const yaml = generateDeploymentYAML({
            name: 'x', namespace: 'default', image: 'busybox',
            replicas: 1, port: '', envVars: [], labels: [],
        })
        expect(yaml).not.toContain('env:')
    })

    it('empty labels produce matchLabels: {} in YAML', () => {
        const yaml = generateDeploymentYAML({
            name: 'x', namespace: 'default', image: 'busybox',
            replicas: 1, port: '', envVars: [], labels: [],
        })
        expect(yaml).toContain('matchLabels: {}')
    })
})

describe('generateServiceYAML', () => {
    it('produces valid Service YAML', () => {
        const yaml = generateServiceYAML({
            name: 'my-svc', namespace: 'default', type: 'ClusterIP',
            selectorLabels: [{ key: 'app', value: 'my-api' }],
            ports: [{ protocol: 'TCP', port: '80', targetPort: '8080' }],
        })
        expect(yaml).toContain('kind: Service')
        expect(yaml).toContain('type: ClusterIP')
        expect(yaml).toContain('port: 80')
        expect(yaml).toContain('targetPort: 8080')
        expect(yaml).toContain('app: my-api')
    })

    it('targetPort falls back to port when targetPort is empty', () => {
        const yaml = generateServiceYAML({
            name: 'my-svc', namespace: 'default', type: 'ClusterIP',
            selectorLabels: [],
            ports: [{ protocol: 'TCP', port: '8080', targetPort: '' }],
        })
        // targetPort should fall back to port (8080)
        expect(yaml).toContain('targetPort: 8080')
        expect(yaml).toContain('port: 8080')
    })

    it('empty ports array produces ports: [] in YAML', () => {
        const yaml = generateServiceYAML({
            name: 'my-svc', namespace: 'default', type: 'ClusterIP',
            selectorLabels: [], ports: [],
        })
        expect(yaml).toContain('ports: []')
    })

    it('LoadBalancer type is serialized correctly', () => {
        const yaml = generateServiceYAML({
            name: 'my-svc', namespace: 'default', type: 'LoadBalancer',
            selectorLabels: [], ports: [],
        })
        expect(yaml).toContain('type: LoadBalancer')
    })
})

describe('generateConfigMapYAML', () => {
    it('produces valid ConfigMap YAML', () => {
        const yaml = generateConfigMapYAML({
            name: 'my-cm', namespace: 'default',
            data: [{ key: 'KEY', value: 'VALUE' }],
        })
        expect(yaml).toContain('kind: ConfigMap')
        expect(yaml).toContain('KEY: VALUE')
    })

    it('omits data key when entry has empty key', () => {
        const yaml = generateConfigMapYAML({
            name: 'my-cm', namespace: 'default',
            data: [{ key: '', value: 'ignored' }],
        })
        expect(yaml).not.toContain('ignored')
    })
})

describe('generateSecretYAML', () => {
    it('base64-encodes values for Opaque secrets', () => {
        const yaml = generateSecretYAML({
            name: 'my-secret', namespace: 'default', type: 'Opaque',
            data: [{ key: 'password', value: 'hunter2' }],
        })
        expect(yaml).toContain('kind: Secret')
        expect(yaml).toContain('type: Opaque')
        // btoa('hunter2') = 'aHVudGVyMg=='
        expect(yaml).toContain('aHVudGVyMg==')
    })

    it('base64-encodes empty string value', () => {
        const yaml = generateSecretYAML({
            name: 'my-secret', namespace: 'default', type: 'Opaque',
            data: [{ key: 'empty', value: '' }],
        })
        // btoa('') === ''
        expect(yaml).toContain('empty:')
    })

    it('serializes kubernetes.io/tls type correctly', () => {
        const yaml = generateSecretYAML({
            name: 'my-secret', namespace: 'default',
            type: 'kubernetes.io/tls',
            data: [],
        })
        expect(yaml).toContain('type: kubernetes.io/tls')
    })
})

describe('generateNamespaceYAML', () => {
    it('produces valid Namespace YAML', () => {
        const yaml = generateNamespaceYAML({
            name: 'my-ns',
            labels: [{ key: 'env', value: 'staging' }],
        })
        expect(yaml).toContain('kind: Namespace')
        expect(yaml).toContain('name: my-ns')
        expect(yaml).toContain('env: staging')
    })

    it('omits labels key when labels array is empty', () => {
        const yaml = generateNamespaceYAML({ name: 'my-ns', labels: [] })
        expect(yaml).not.toContain('labels:')
    })
})

describe('DNS_LABEL_RE', () => {
    it('accepts valid DNS labels', () => {
        expect(DNS_LABEL_RE.test('my-app')).toBe(true)
        expect(DNS_LABEL_RE.test('a')).toBe(true)
        expect(DNS_LABEL_RE.test('app123')).toBe(true)
    })

    it('rejects invalid DNS labels', () => {
        expect(DNS_LABEL_RE.test('-app')).toBe(false)
        expect(DNS_LABEL_RE.test('App')).toBe(false)
        expect(DNS_LABEL_RE.test('')).toBe(false)
    })
})
