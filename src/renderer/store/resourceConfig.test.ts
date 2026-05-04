import { describe, it, expect } from 'vitest'
import { SECTION_CONFIG } from './resourceConfig'

// Minimal ObjectMeta helper — only fields required by BaseObjectMeta
function meta(name: string, namespace?: string, labels?: Record<string, string>) {
    return { name, namespace, uid: 'uid-1', creationTimestamp: '2024-01-01T00:00:00Z', labels }
}

describe('SECTION_CONFIG searchFields', () => {
    describe('pods', () => {
        const fn = SECTION_CONFIG.pods!.searchFields

        it('matches pod name', () => {
            const pod = { metadata: meta('nginx-abc', 'default'), spec: { containers: [] }, status: { phase: 'Running' } }
            expect(fn(pod)).toContain('nginx-abc')
        })

        it('matches container image', () => {
            const pod = {
                metadata: meta('web', 'default'),
                spec: { containers: [{ name: 'app', image: 'nginx:1.24' }] },
                status: { phase: 'Running' },
            }
            expect(fn(pod)).toContain('nginx:1.24')
        })

        it('matches pod IP', () => {
            const pod = {
                metadata: meta('web', 'default'),
                spec: { containers: [] },
                status: { phase: 'Running', podIP: '10.0.0.5' },
            }
            expect(fn(pod)).toContain('10.0.0.5')
        })

        it('matches node name', () => {
            const pod = {
                metadata: meta('web', 'default'),
                spec: { containers: [], nodeName: 'worker-1' },
                status: { phase: 'Running' },
            }
            expect(fn(pod)).toContain('worker-1')
        })

        it('matches label key=value string', () => {
            const pod = {
                metadata: meta('web', 'default', { app: 'frontend' }),
                spec: { containers: [] },
                status: { phase: 'Running' },
            }
            expect(fn(pod)).toContain('app=frontend')
        })

        it('matches status phase', () => {
            const pod = {
                metadata: meta('web', 'default'),
                spec: { containers: [] },
                status: { phase: 'CrashLoopBackOff' },
            }
            expect(fn(pod)).toContain('CrashLoopBackOff')
        })

        it('handles missing spec gracefully', () => {
            const pod = { metadata: meta('web', 'default'), spec: { containers: [] }, status: {} }
            expect(() => fn(pod)).not.toThrow()
        })
    })

    describe('services', () => {
        const fn = SECTION_CONFIG.services!.searchFields

        it('matches service name', () => {
            const svc = { metadata: meta('my-svc', 'default'), spec: {}, status: {} }
            expect(fn(svc)).toContain('my-svc')
        })

        it('matches cluster IP', () => {
            const svc = { metadata: meta('svc', 'default'), spec: { clusterIP: '10.96.0.1' }, status: {} }
            expect(fn(svc)).toContain('10.96.0.1')
        })

        it('matches service type', () => {
            const svc = { metadata: meta('svc', 'default'), spec: { type: 'LoadBalancer' }, status: {} }
            expect(fn(svc)).toContain('LoadBalancer')
        })

        it('matches load balancer ingress IP', () => {
            const svc = {
                metadata: meta('svc', 'default'),
                spec: {},
                status: { loadBalancer: { ingress: [{ ip: '34.1.2.3' }] } },
            }
            expect(fn(svc)).toContain('34.1.2.3')
        })

        it('matches selector label', () => {
            const svc = {
                metadata: meta('svc', 'default'),
                spec: { selector: { app: 'backend' } },
                status: {},
            }
            expect(fn(svc)).toContain('app=backend')
        })
    })

    describe('nodes', () => {
        const fn = SECTION_CONFIG.nodes!.searchFields

        it('matches node name', () => {
            const node = { metadata: meta('node-1'), spec: {}, status: {} }
            expect(fn(node)).toContain('node-1')
        })

        it('matches internal IP', () => {
            const node = {
                metadata: meta('node-1'),
                spec: {},
                status: { addresses: [{ type: 'InternalIP', address: '192.168.1.5' }] },
            }
            expect(fn(node)).toContain('192.168.1.5')
        })

        it('matches kubelet version', () => {
            const node = {
                metadata: meta('node-1'),
                spec: {},
                status: { nodeInfo: { kubeletVersion: 'v1.29.0', osImage: '', containerRuntimeVersion: '', architecture: '', operatingSystem: '', machineID: '', kernelVersion: '' } },
            }
            expect(fn(node)).toContain('v1.29.0')
        })

        it('extracts node role from label', () => {
            const node = {
                metadata: meta('node-1', undefined, { 'node-role.kubernetes.io/control-plane': '' }),
                spec: {},
                status: {},
            }
            expect(fn(node)).toContain('control-plane')
        })
    })

    describe('secrets', () => {
        const fn = SECTION_CONFIG.secrets!.searchFields

        it('matches secret name', () => {
            const secret = { metadata: meta('my-tls', 'default'), type: 'kubernetes.io/tls', data: {} }
            expect(fn(secret)).toContain('my-tls')
        })

        it('matches secret type', () => {
            const secret = { metadata: meta('sa-token', 'default'), type: 'kubernetes.io/service-account-token', data: {} }
            expect(fn(secret)).toContain('kubernetes.io/service-account-token')
        })
    })

    describe('configmaps', () => {
        const fn = SECTION_CONFIG.configmaps!.searchFields

        it('matches configmap name', () => {
            const cm = { metadata: meta('app-config', 'default'), data: { key: 'value' } }
            expect(fn(cm)).toContain('app-config')
        })

        it('matches data keys', () => {
            const cm = { metadata: meta('app-config', 'default'), data: { DATABASE_URL: 'postgres://...' } }
            expect(fn(cm)).toContain('DATABASE_URL')
        })
    })

    describe('deployments', () => {
        const fn = SECTION_CONFIG.deployments!.searchFields

        it('matches deployment name', () => {
            const dep = { metadata: meta('api', 'default'), spec: { selector: {}, template: { spec: { containers: [] } } }, status: {} }
            expect(fn(dep)).toContain('api')
        })

        it('matches pod template image', () => {
            const dep = {
                metadata: meta('api', 'default'),
                spec: {
                    selector: {},
                    template: { spec: { containers: [{ name: 'api', image: 'myapp:v2' }] } },
                },
                status: {},
            }
            expect(fn(dep)).toContain('myapp:v2')
        })
    })

    describe('ingresses', () => {
        const fn = SECTION_CONFIG.ingresses!.searchFields

        it('matches ingress host', () => {
            const ing = {
                metadata: meta('web', 'default'),
                spec: { rules: [{ host: 'app.example.com' }] },
                status: {},
            }
            expect(fn(ing)).toContain('app.example.com')
        })

        it('matches TLS host', () => {
            const ing = {
                metadata: meta('web', 'default'),
                spec: { tls: [{ hosts: ['secure.example.com'] }] },
                status: {},
            }
            expect(fn(ing)).toContain('secure.example.com')
        })
    })

    describe('roles', () => {
        const fn = SECTION_CONFIG.roles!.searchFields

        it('matches role name', () => {
            const role = { metadata: meta('pod-reader', 'default'), rules: [] }
            expect(fn(role)).toContain('pod-reader')
        })

        it('matches resource names in rules', () => {
            const role = {
                metadata: meta('pod-reader', 'default'),
                rules: [{ verbs: ['get', 'list'], resources: ['pods'] }],
            }
            expect(fn(role)).toContain('pods')
        })

        it('matches verbs in rules', () => {
            const role = {
                metadata: meta('pod-reader', 'default'),
                rules: [{ verbs: ['get', 'list'], resources: ['pods'] }],
            }
            expect(fn(role)).toContain('get')
            expect(fn(role)).toContain('list')
        })
    })

    describe('crds', () => {
        const fn = SECTION_CONFIG.crds!.searchFields

        it('matches CRD name', () => {
            const crd = {
                metadata: meta('virtualservices.networking.istio.io'),
                spec: { group: 'networking.istio.io', names: { kind: 'VirtualService', plural: 'virtualservices', singular: 'virtualservice' }, scope: 'Namespaced', versions: [] },
            }
            expect(fn(crd)).toContain('virtualservices.networking.istio.io')
        })

        it('matches CRD group', () => {
            const crd = {
                metadata: meta('vs.networking.istio.io'),
                spec: { group: 'networking.istio.io', names: { kind: 'VirtualService', plural: 'virtualservices', singular: 'virtualservice' }, scope: 'Namespaced', versions: [] },
            }
            expect(fn(crd)).toContain('networking.istio.io')
        })

        it('matches CRD kind', () => {
            const crd = {
                metadata: meta('vs.networking.istio.io'),
                spec: { group: 'networking.istio.io', names: { kind: 'VirtualService', plural: 'virtualservices', singular: 'virtualservice' }, scope: 'Namespaced', versions: [] },
            }
            expect(fn(crd)).toContain('VirtualService')
        })
    })

    describe('all sections have searchFields defined', () => {
        const sections = [
            'pods', 'deployments', 'daemonsets', 'statefulsets', 'replicasets',
            'jobs', 'cronjobs', 'hpas', 'pdbs', 'services', 'ingresses',
            'networkpolicies', 'endpoints', 'configmaps', 'secrets', 'pvcs',
            'serviceaccounts', 'roles', 'rolebindings', 'events',
            'nodes', 'namespaces', 'crds', 'ingressclasses', 'pvs',
            'storageclasses', 'clusterroles', 'clusterrolebindings',
        ] as const

        for (const section of sections) {
            it(`${section} has searchFields`, () => {
                expect(SECTION_CONFIG[section]?.searchFields).toBeDefined()
                expect(typeof SECTION_CONFIG[section]?.searchFields).toBe('function')
            })
        }
    })

    // Registry integrity: if you add a new section here, update the count below.
    // This catches the class of bug where a resource is added to SECTION_CONFIG
    // but the developer forgets to add a sidecar route (Go AllResourceDefs).
    it('SECTION_CONFIG has exactly 30 entries', () => {
        expect(Object.keys(SECTION_CONFIG).length).toBe(30)
    })

    // ── cronjob suspend logic ─────────────────────────────────────────────────
    describe('cronjobs suspend indexing', () => {
        const fn = SECTION_CONFIG.cronjobs!.searchFields

        it('indexes "suspended" when suspend=true', () => {
            const cj = { metadata: meta('nightly', 'default'), spec: { schedule: '0 0 * * *', suspend: true }, status: {} }
            expect(fn(cj)).toContain('suspended')
        })

        it('does not index "active" for non-suspended cronjob', () => {
            const cj = { metadata: meta('nightly', 'default'), spec: { schedule: '0 0 * * *', suspend: false }, status: {} }
            expect(fn(cj)).not.toContain('active')
        })

        it('does not index "active" when suspend is absent', () => {
            const cj = { metadata: meta('nightly', 'default'), spec: { schedule: '0 0 * * *' }, status: {} }
            expect(fn(cj)).not.toContain('active')
        })
    })

    // ── null-safety: bare-minimum resources with no spec/status ──────────────
    describe('null-safety: searchFields does not throw on missing spec/status', () => {
        const bare = (name: string, ns?: string) => ({ metadata: meta(name, ns) })

        it('pods — no spec/status', () => {
            expect(() => SECTION_CONFIG.pods!.searchFields(bare('p', 'default'))).not.toThrow()
            expect(SECTION_CONFIG.pods!.searchFields(bare('p', 'default'))).toContain('p')
        })

        it('services — no spec/status', () => {
            expect(() => SECTION_CONFIG.services!.searchFields(bare('s', 'default'))).not.toThrow()
        })

        it('roles — no rules', () => {
            expect(() => SECTION_CONFIG.roles!.searchFields(bare('r', 'default'))).not.toThrow()
        })

        it('clusterroles — no rules', () => {
            expect(() => SECTION_CONFIG.clusterroles!.searchFields(bare('cr'))).not.toThrow()
        })

        it('ingresses — no spec', () => {
            expect(() => SECTION_CONFIG.ingresses!.searchFields(bare('ing', 'default'))).not.toThrow()
        })

        it('nodes — no status', () => {
            expect(() => SECTION_CONFIG.nodes!.searchFields(bare('node-1'))).not.toThrow()
        })

        it('pvs — no spec/status', () => {
            expect(() => SECTION_CONFIG.pvs!.searchFields(bare('pv-1'))).not.toThrow()
        })

        it('deployments — no spec', () => {
            expect(() => SECTION_CONFIG.deployments!.searchFields(bare('d', 'default'))).not.toThrow()
        })

        it('statefulsets — no spec', () => {
            expect(() => SECTION_CONFIG.statefulsets!.searchFields(bare('ss', 'default'))).not.toThrow()
        })

        it('daemonsets — no spec', () => {
            expect(() => SECTION_CONFIG.daemonsets!.searchFields(bare('ds', 'default'))).not.toThrow()
        })

        it('replicasets — no spec', () => {
            expect(() => SECTION_CONFIG.replicasets!.searchFields(bare('rs', 'default'))).not.toThrow()
        })

        it('jobs — no spec', () => {
            expect(() => SECTION_CONFIG.jobs!.searchFields(bare('j', 'default'))).not.toThrow()
        })

        it('hpas — no spec', () => {
            expect(() => SECTION_CONFIG.hpas!.searchFields(bare('h', 'default'))).not.toThrow()
        })

        it('pdbs — no spec', () => {
            expect(() => SECTION_CONFIG.pdbs!.searchFields(bare('pdb', 'default'))).not.toThrow()
        })

        it('networkpolicies — no spec', () => {
            expect(() => SECTION_CONFIG.networkpolicies!.searchFields(bare('np', 'default'))).not.toThrow()
        })

        it('endpoints — no subsets', () => {
            expect(() => SECTION_CONFIG.endpoints!.searchFields(bare('ep', 'default'))).not.toThrow()
        })

        it('configmaps — no data', () => {
            expect(() => SECTION_CONFIG.configmaps!.searchFields(bare('cm', 'default'))).not.toThrow()
        })

        it('pvcs — no spec/status', () => {
            expect(() => SECTION_CONFIG.pvcs!.searchFields(bare('pvc', 'default'))).not.toThrow()
        })

        it('serviceaccounts — no secrets', () => {
            expect(() => SECTION_CONFIG.serviceaccounts!.searchFields(bare('sa', 'default'))).not.toThrow()
        })

        it('rolebindings — no subjects', () => {
            expect(() => SECTION_CONFIG.rolebindings!.searchFields(bare('rb', 'default'))).not.toThrow()
        })

        it('clusterrolebindings — no subjects', () => {
            expect(() => SECTION_CONFIG.clusterrolebindings!.searchFields({ metadata: meta('crb'), roleRef: { apiGroup: '', kind: 'ClusterRole', name: 'x' } })).not.toThrow()
        })

        it('events — no involvedObject fields', () => {
            expect(() => SECTION_CONFIG.events!.searchFields({ metadata: meta('ev', 'default'), involvedObject: { kind: 'Pod', name: 'p' } })).not.toThrow()
        })

        it('namespaces — no status', () => {
            expect(() => SECTION_CONFIG.namespaces!.searchFields(bare('ns-1'))).not.toThrow()
        })

        it('crds — no spec', () => {
            expect(() => SECTION_CONFIG.crds!.searchFields(bare('foo.example.com'))).not.toThrow()
        })

        it('ingressclasses — no spec', () => {
            expect(() => SECTION_CONFIG.ingressclasses!.searchFields(bare('nginx'))).not.toThrow()
        })

        it('storageclasses — bare (provisioner required by k8s but may be absent at runtime)', () => {
            expect(() => SECTION_CONFIG.storageclasses!.searchFields(bare('fast'))).not.toThrow()
        })

        it('secrets — no type', () => {
            expect(() => SECTION_CONFIG.secrets!.searchFields(bare('sec', 'default'))).not.toThrow()
        })
    })
})
