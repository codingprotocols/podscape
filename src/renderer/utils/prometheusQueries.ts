// Typed PromQL builder functions for common Podscape metrics.
// All CPU values are in millicores (m); memory in MiB.

export interface QuerySpec {
  query: string
  label: string
}

// ── Pod metrics ───────────────────────────────────────────────────────────────

/** CPU usage in millicores for a single pod. */
export function podCpuQuery(pod: string, namespace: string): QuerySpec {
  return {
    query: `sum(rate(container_cpu_usage_seconds_total{pod="${pod}",namespace="${namespace}",container!="",container!="POD"}[5m])) * 1000`,
    label: 'CPU (m)',
  }
}

/** Memory working set in MiB for a single pod. */
export function podMemoryQuery(pod: string, namespace: string): QuerySpec {
  return {
    query: `sum(container_memory_working_set_bytes{pod="${pod}",namespace="${namespace}",container!="",container!="POD"}) / (1024*1024)`,
    label: 'Memory (MiB)',
  }
}

/** Network receive throughput in KiB/s for a single pod. */
export function podNetworkRxQuery(pod: string, namespace: string): QuerySpec {
  return {
    query: `sum(rate(container_network_receive_bytes_total{pod="${pod}",namespace="${namespace}"}[5m])) / 1024`,
    label: 'RX (KiB/s)',
  }
}

/** Network transmit throughput in KiB/s for a single pod. */
export function podNetworkTxQuery(pod: string, namespace: string): QuerySpec {
  return {
    query: `sum(rate(container_network_transmit_bytes_total{pod="${pod}",namespace="${namespace}"}[5m])) / 1024`,
    label: 'TX (KiB/s)',
  }
}

// ── Cluster-wide metrics ──────────────────────────────────────────────────────

/** Total cluster CPU usage in millicores across all containers. */
export function clusterCpuQuery(): QuerySpec {
  return {
    query: `sum(rate(container_cpu_usage_seconds_total{container!="",container!="POD"}[5m])) * 1000`,
    label: 'CPU (m)',
  }
}

/** Total cluster memory usage in GiB across all containers. */
export function clusterMemoryQuery(): QuerySpec {
  return {
    query: `sum(container_memory_working_set_bytes{container!="",container!="POD"}) / (1024*1024*1024)`,
    label: 'Memory (GiB)',
  }
}

// ── Node metrics ──────────────────────────────────────────────────────────────

/** CPU utilisation percentage for a node. */
export function nodeCpuQuery(node: string): QuerySpec {
  return {
    query: `(1 - avg(rate(node_cpu_seconds_total{mode="idle",node="${node}"}[5m]))) * 100`,
    label: 'CPU (%)',
  }
}

/** Memory utilisation percentage for a node. */
export function nodeMemoryQuery(node: string): QuerySpec {
  return {
    query: `(1 - (node_memory_MemAvailable_bytes{node="${node}"} / node_memory_MemTotal_bytes{node="${node}"})) * 100`,
    label: 'Memory (%)',
  }
}

// ── Deployment / workload metrics ─────────────────────────────────────────────

/** Aggregate CPU usage in millicores for all pods owned by a deployment. */
export function deploymentCpuQuery(deployment: string, namespace: string): QuerySpec {
  return {
    query: `sum(rate(container_cpu_usage_seconds_total{namespace="${namespace}",pod=~"${deployment}-[a-z0-9]+-[a-z0-9]+",container!="",container!="POD"}[5m])) * 1000`,
    label: 'CPU (m)',
  }
}

/** Aggregate memory in MiB for all pods owned by a deployment. */
export function deploymentMemoryQuery(deployment: string, namespace: string): QuerySpec {
  return {
    query: `sum(container_memory_working_set_bytes{namespace="${namespace}",pod=~"${deployment}-[a-z0-9]+-[a-z0-9]+",container!="",container!="POD"}) / (1024*1024)`,
    label: 'Memory (MiB)',
  }
}

// ── Time range helpers ────────────────────────────────────────────────────────

export type TimeRangePreset = '1h' | '6h' | '24h' | '7d'

export function presetToSeconds(preset: TimeRangePreset): number {
  switch (preset) {
    case '1h':  return 3600
    case '6h':  return 6 * 3600
    case '24h': return 24 * 3600
    case '7d':  return 7 * 24 * 3600
  }
}

export function defaultTimeRange(): { start: number; end: number } {
  const end = Math.floor(Date.now() / 1000)
  return { start: end - 3600, end }
}
