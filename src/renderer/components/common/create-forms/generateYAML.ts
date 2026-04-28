import yaml from 'js-yaml'

export const DNS_LABEL_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/

export interface KVPair { key: string; value: string }

// ─── Deployment ──────────────────────────────────────────────────────────────

export interface DeploymentFormState {
    name: string
    namespace: string
    image: string
    replicas: number
    port: string
    envVars: KVPair[]
    labels: KVPair[]
}

export function generateDeploymentYAML(s: DeploymentFormState): string {
    const labelMap = Object.fromEntries(s.labels.filter(l => l.key).map(l => [l.key, l.value]))
    const envList = s.envVars.filter(e => e.key).map(e => ({ name: e.key, value: e.value }))
    const container: Record<string, unknown> = {
        name: s.name || 'app',
        image: s.image,
    }
    if (s.port) container.ports = [{ containerPort: parseInt(s.port, 10) }]
    if (envList.length > 0) container.env = envList

    return yaml.dump({
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: { name: s.name, namespace: s.namespace, labels: labelMap },
        spec: {
            replicas: s.replicas,
            selector: { matchLabels: labelMap },
            template: {
                metadata: { labels: labelMap },
                spec: { containers: [container] },
            },
        },
    }, { noRefs: true, lineWidth: -1 })
}

// ─── Service ─────────────────────────────────────────────────────────────────

export interface ServiceFormState {
    name: string
    namespace: string
    type: 'ClusterIP' | 'NodePort' | 'LoadBalancer'
    selectorLabels: KVPair[]
    ports: { protocol: 'TCP' | 'UDP'; port: string; targetPort: string }[]
}

export function generateServiceYAML(s: ServiceFormState): string {
    const selector = Object.fromEntries(s.selectorLabels.filter(l => l.key).map(l => [l.key, l.value]))
    const ports = s.ports.filter(p => p.port).map(p => ({
        protocol: p.protocol,
        port: parseInt(p.port, 10),
        targetPort: parseInt(p.targetPort, 10) || parseInt(p.port, 10),
    }))
    return yaml.dump({
        apiVersion: 'v1',
        kind: 'Service',
        metadata: { name: s.name, namespace: s.namespace },
        spec: { type: s.type, selector, ports },
    }, { noRefs: true, lineWidth: -1 })
}

// ─── ConfigMap ───────────────────────────────────────────────────────────────

export interface ConfigMapFormState {
    name: string
    namespace: string
    data: KVPair[]
}

export function generateConfigMapYAML(s: ConfigMapFormState): string {
    const data = Object.fromEntries(s.data.filter(d => d.key).map(d => [d.key, d.value]))
    return yaml.dump({
        apiVersion: 'v1',
        kind: 'ConfigMap',
        metadata: { name: s.name, namespace: s.namespace },
        data,
    }, { noRefs: true, lineWidth: -1 })
}

// ─── Secret ──────────────────────────────────────────────────────────────────

export interface SecretFormState {
    name: string
    namespace: string
    type: 'Opaque' | 'kubernetes.io/dockerconfigjson' | 'kubernetes.io/tls'
    data: KVPair[]
}

export function generateSecretYAML(s: SecretFormState): string {
    const data = Object.fromEntries(
        s.data.filter(d => d.key).map(d => [d.key, btoa(d.value)])
    )
    return yaml.dump({
        apiVersion: 'v1',
        kind: 'Secret',
        metadata: { name: s.name, namespace: s.namespace },
        type: s.type,
        data,
    }, { noRefs: true, lineWidth: -1 })
}

// ─── Namespace ───────────────────────────────────────────────────────────────

export interface NamespaceFormState {
    name: string
    labels: KVPair[]
}

export function generateNamespaceYAML(s: NamespaceFormState): string {
    const labels = Object.fromEntries(s.labels.filter(l => l.key).map(l => [l.key, l.value]))
    const meta: Record<string, unknown> = { name: s.name }
    if (Object.keys(labels).length > 0) meta.labels = labels
    return yaml.dump({
        apiVersion: 'v1',
        kind: 'Namespace',
        metadata: meta,
    }, { noRefs: true, lineWidth: -1 })
}
