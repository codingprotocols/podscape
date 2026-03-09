export interface KubeProvider {
    getContexts(): Promise<unknown[]>;
    getCurrentContext(): Promise<string>;
    switchContext(context: string): Promise<void>;
    getNamespaces(context: string): Promise<unknown[]>;
    getResources(context: string, namespace: string | null, kind: string): Promise<unknown[]>;
    getPodMetrics(context: string, namespace: string | null): Promise<unknown[]>;
    getNodeMetrics(context: string): Promise<unknown[]>;
    getSecretValue(context: string, namespace: string, name: string, key: string): Promise<string>;
    scaleResource(context: string, namespace: string, kind: string, name: string, replicas: number): Promise<string>;
    rolloutRestart(context: string, namespace: string, kind: string, name: string): Promise<string>;
    rolloutHistory(context: string, namespace: string, kind: string, name: string): Promise<string>;
    rolloutUndo(context: string, namespace: string, kind: string, name: string, revision?: number): Promise<string>;
    getResourceEvents(context: string, namespace: string, kind: string, name: string): Promise<unknown[]>;
    deleteResource(context: string, namespace: string | null, kind: string, name: string): Promise<string>;
    getYAML(context: string, namespace: string | null, kind: string, name: string): Promise<string>;
    applyYAML(context: string, yamlContent: string): Promise<string>;
    // Streaming methods
    spawnLogs(context: string, namespace: string, pod: string, container?: string): any; // child process
    spawnPortForward(context: string, namespace: string, type: string, name: string, localPort: number, remotePort: number): any;
}
