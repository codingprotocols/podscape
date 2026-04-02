---
title: Troubleshooting
nav_order: 9
---

# Troubleshooting

This guide covers common issues, their root causes, and step-by-step fixes. Issues are grouped by area.

---

## Sidecar Issues

The Go sidecar (`podscape-core`) is the backend process that handles all Kubernetes API calls. Most connectivity and startup problems trace back to it.

### "Sidecar Connection Failed" dialog on launch

**Symptom:** A dialog box appears at startup reading "The Podscape backend (Go sidecar) failed to start" and the app quits.

**Cause:** One of three things happened before the sidecar became healthy:

- The binary is missing at the expected path.
- The sidecar process exited immediately (bad kubeconfig, missing Go binary, permissions issue).
- The sidecar failed to respond on its port within 90 seconds (180 polls × 500 ms).

**Fix:**

1. **Check the binary exists.** In development:
   ```bash
   ls go-core/podscape-core
   ```
   If it is missing, build it:
   ```bash
   cd go-core && go build ./cmd/podscape-core/
   ```
   In production, the binary is bundled at `resources/bin/podscape-core` inside the app package.

2. **Check executable permissions** (macOS/Linux). The app applies `chmod 755` automatically, but if you copied the binary manually it may lack execute permission:
   ```bash
   chmod +x go-core/podscape-core
   ```

3. **Check port 5050.** See [Port 5050 Already In Use](#port-5050-already-in-use) below.

4. **Check your kubeconfig.** The sidecar reads kubeconfig at startup. If the file references a cluster that no longer exists, the process may exit before becoming healthy. Verify with:
   ```bash
   kubectl config view
   ```

{: .note }
The error dialog includes the last 30 lines of sidecar stderr. Read them carefully — they will usually name the specific failure.

---

### Sidecar crash banner during use ("Reconnect" button)

**Symptom:** A red banner appears at the top of the window: "Connection to cluster lost — the backend process exited unexpectedly." A **Reconnect** button is shown.

**Cause:** The `podscape-core` process exited after startup completed. This can happen due to an unhandled panic in the Go process, an OOM kill, or a forceful termination by the OS.

**Fix:**

1. Click **Reconnect**. This calls `sidecar:restart` over IPC, which relaunches the binary and reloads the renderer once the sidecar is healthy again.
2. If the sidecar keeps crashing, open the system console (macOS: Console.app, Linux: `journalctl`) and look for crash reports from `podscape-core`.
3. In development, sidecar logs are printed directly to the terminal running `npm run dev`. Check there for a Go stack trace.

{: .note }
The crash banner only appears when the sidecar exits **after** startup completed. If it exits during the startup health-check window, the "Sidecar Connection Failed" dialog appears instead.

---

### Sidecar unresponsive / requests timing out

**Symptom:** The app loads but resource lists spin indefinitely, or operations (scale, delete, etc.) hang without returning.

**Cause:** The sidecar process is running but not responding to HTTP requests. This can happen if the cluster API server is very slow, the sidecar is blocked on a large informer cache sync, or there is a network issue between the machine and the cluster.

**How the retry logic works:** Every IPC call to the sidecar goes through `sidecarFetch()`, which retries up to **20 times** with **500 ms** delays on `ECONNREFUSED`, `UND_ERR_SOCKET`, and socket hang-up errors. That means up to 10 seconds of retrying before an error surfaces.

**Fix:**

1. Open the **Metrics** section to confirm the cluster API server is reachable at all.
2. Check your VPN connection if the cluster is remote.
3. Try switching to a different context and back — this triggers a full context switch which re-initialises the sidecar's clientset and informers.
4. If the sidecar is stuck on informer sync for a very large cluster, wait up to 90 seconds after launch for it to finish the initial cache warm-up.
5. Restart Podscape entirely to get a fresh sidecar process.

---

### Port 5050 already in use

**Symptom:** Sidecar fails to start with an error message mentioning port 5050 or `bind: address already in use`.

**Cause:** Another process is occupying TCP port 5050 on `127.0.0.1`.

**How Podscape handles this:** The sidecar startup code probes port 5050 with a test TCP bind. If it is occupied, it falls back to a random ephemeral port chosen by the OS and logs: `Port 5050 in use — using port <N>`. The renderer automatically uses the port that was actually bound.

**Fix:** If you see the error despite the fallback logic, the sidecar process itself failed to bind. Find and stop the conflicting process:

```bash
# macOS / Linux
lsof -i :5050
kill <PID>

# Windows
netstat -ano | findstr :5050
taskkill /PID <PID> /F
```

Then relaunch Podscape.

---

## Kubeconfig and Context Issues

### No kubeconfig found on first launch

**Symptom:** The app shows the onboarding screen ("KubeConfig Onboarding") instead of the normal sidebar and resource panels.

**Cause:** Podscape could not find a kubeconfig file at any of the default search paths (`~/.kube/config`, `KUBECONFIG` environment variable, or any path previously saved in settings).

**Fix:**

1. Ensure `~/.kube/config` exists and is readable:
   ```bash
   cat ~/.kube/config
   ```
2. If your kubeconfig is at a non-standard path, set the `KUBECONFIG` environment variable before launching:
   ```bash
   KUBECONFIG=/path/to/my/kubeconfig open /Applications/Podscape.app
   ```
3. Use the onboarding screen's file picker to browse to your kubeconfig.
4. In **Settings**, the kubeconfig path can be set explicitly and persisted to `~/.podscape/settings.json`.

---

### Context switch fails or hangs

**Symptom:** Clicking a context in the sidebar shows "Connecting…" or "Loading namespaces…" indefinitely, or the UI resets to the previous context with an error toast.

**Cause:** Context switches have a **15-second timeout** applied to both the `switchContext` and `getNamespaces` calls. If either exceeds 15 seconds, the switch is rolled back: the sidecar and the renderer both revert to the previous context.

Common causes: cluster API server unreachable, expired credentials, VPN not connected, or an EKS/GKE token that requires re-authentication.

**Fix:**

1. Check that the cluster API endpoint is reachable from your machine:
   ```bash
   kubectl --context=<context-name> cluster-info
   ```
2. Refresh credentials if using short-lived tokens (EKS, GKE, OIDC):
   ```bash
   # EKS
   aws eks update-kubeconfig --name <cluster> --region <region>
   # GKE
   gcloud container clusters get-credentials <cluster> --zone <zone>
   ```
3. Check VPN status for private clusters.
4. If the timeout is consistently too short for a slow cluster, see [Sidecar Unresponsive](#sidecar-unresponsive--requests-timing-out) for general connectivity advice.

The error toast in the UI will include either `timed out after 15s` or the raw error message from the Kubernetes client, which helps pinpoint the problem.

---

### Cluster unreachable after switching

**Symptom:** Context switch completes but all resource lists show errors or empty state. The dashboard shows no nodes.

**Cause:** The `getNamespaces` connectivity check passed (so the switch completed), but subsequent resource fetches are failing. This often means the cluster's API server is intermittently unavailable or the authenticated user lacks read access to most resources.

**Fix:**

1. Verify with kubectl directly:
   ```bash
   kubectl --context=<context-name> get nodes
   ```
2. Check the RBAC section below if lists show the amber "Access denied" banner instead of errors.
3. Use the **Sync** button to retry the current section manually.

---

## RBAC / Access Denied

### Sections show an amber "Access denied" banner

**Symptom:** Navigating to a resource section (e.g. Secrets, ClusterRoles) shows an amber badge reading "Access denied — your RBAC role does not allow listing this resource."

**Cause:** The sidecar detected that your Kubernetes user does not have `list` and `watch` permissions for that resource type. The sidecar returns a `200` response with an empty array and the header `X-Podscape-Denied: true`. The main process throws a typed `RBACDeniedError`, and the renderer adds the section to `deniedSections`. The amber banner is rendered instead of the empty-list state.

This is by design — denied sections are surfaced clearly rather than silently showing empty tables.

---

### How the RBAC probe works

On every successful context switch, the Go sidecar runs a concurrent `SelfSubjectAccessReview` (SAR) probe against all 28 resource types it manages. The probe checks both the `list` and `watch` verbs for each resource. All 56 SAR requests are issued concurrently (bounded to 8 goroutines) and typically complete in under one second.

Three outcomes are possible:

| Outcome | Behaviour |
|---|---|
| SAR API unavailable (error) | All informers start unconditionally (pre-RBAC permissive mode) |
| Resource explicitly denied | Informer skipped; handler returns `200 []` + `X-Podscape-Denied: true` |
| Resource allowed | Informer starts normally; data is served |

`deniedSections` is cleared on every context switch, so permissions are always re-evaluated when you change clusters.

---

### You have permissions but still see "Access denied"

**Symptom:** You know your user has access (you can `kubectl get secrets` fine), but the Secrets section in Podscape shows the denied banner.

**Cause:** The SAR probe checks the `list` and `watch` verbs. If your RBAC role only grants `get` or uses a very narrow resource name restriction (e.g. only a specific secret name), the SAR will return `Allowed: false` for `list`.

**Fix:**

1. Verify the exact verbs your role grants:
   ```bash
   kubectl auth can-i list secrets --as=<your-serviceaccount-or-user>
   kubectl auth can-i watch secrets --as=<your-serviceaccount-or-user>
   ```
2. Both must return `yes` for Podscape to serve the section.
3. If the SAR probe itself failed (network error during the probe), the sidecar falls back to permissive mode and all sections should load. If this is happening, check the sidecar logs for `[RBAC] probe` messages.
4. Switch context and switch back to re-run the RBAC probe after any role changes take effect.

{: .note }
Aggregated ClusterRoles can make `kubectl auth can-i` return `yes` while a direct SelfSubjectAccessReview returns `Allowed: false` in some edge cases. If this affects you, re-bind roles directly rather than through aggregation.

---

## Build and Development Issues

See [Development Guide](development.md) for full build setup instructions.

### `window.kubectl.*` methods appear as `undefined`

**Symptom:** At runtime the renderer throws errors like `window.kubectl.getPods is not a function` or `Cannot read properties of undefined (reading 'getPods')`.

**Cause:** The preload script (`src/preload/index.js`) is stale. Vite's hot-module replacement updates renderer files but does not always trigger a full preload rebuild. The renderer is then running against an old version of the preload bundle that does not expose the expected API.

**Fix:**

Stop and fully restart the dev server:
```bash
# Stop with Ctrl+C, then:
npm run dev
```

A hard restart forces electron-vite to rebuild all three processes (main, preload, renderer) from scratch.

---

### node-pty spawn-helper lacks execute permission

**Symptom:** Opening a terminal tab or exec-into-container session fails immediately. You may see errors like `spawn EACCES` or the terminal window opens but immediately closes.

**Cause:** On macOS, the prebuilt `spawn-helper` binary inside `node-pty` ships without execute permission (`-rw-r--r--` instead of `-rwxr-xr-x`). This binary is required for PTY session creation.

**Fix (automatic):** The `postinstall` script in `package.json` applies `chmod +x` automatically when you run `npm install`. If it worked, you should not see this issue.

**Fix (manual):** Run the fix yourself:
```bash
chmod +x node_modules/node-pty/prebuilds/darwin-*/spawn-helper
```

If you are on an M-series Mac and see `darwin-arm64`:
```bash
chmod +x node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper
```

After applying the fix, restart `npm run dev` — the running Electron process caches the binary load.

---

### Go binary not found in dev mode

**Symptom:** On first launch in development, the startup dialog reports `Sidecar binary not found at: <path>/go-core/podscape-core`.

**Cause:** The Go sidecar binary must be compiled separately before starting the dev server. It is not built by `npm run dev`.

**Fix:**

```bash
cd go-core && go build ./cmd/podscape-core/
cd ..
npm run dev
```

After the initial build, you only need to rebuild the binary when you change Go source files under `go-core/`.

{: .note }
In production builds, `npm run build` compiles the Go binary as part of the full build sequence. The binary is then bundled into the app at `resources/bin/podscape-core` via `extraResources` in `package.json`.

---

## Auto-Updater Issues

The auto-updater only runs in production builds (not in `npm run dev`). It checks for updates 5 seconds after launch.

### Update download fails

**Symptom:** The update banner appears but clicking **Download** produces an error, or the download progress stalls.

**Cause:** The updater fetches the release artifact from GitHub Releases. Download failures are typically network-related: a firewall, proxy, or a transient GitHub outage.

**Fix:**

1. Check your internet connection and any proxy settings.
2. Wait a few minutes and use **Check for Updates** in Settings to retry.
3. As a fallback, download the installer directly from the [GitHub Releases page](https://github.com/codingprotocols/podscape/releases) and install manually.

---

### Update banner persists after install

**Symptom:** You clicked **Install & Restart**, but the update banner reappears after the app restarts, showing the same version.

**Cause:** `electron-updater` is configured with `autoInstallOnAppQuit = true`. Calling `quitAndInstall(false, true)` triggers a quit-and-relaunch sequence. If the installation step fails silently (e.g., due to a permissions issue with the app bundle), the app relaunches at the old version.

**Fix:**

1. Download the latest installer from [GitHub Releases](https://github.com/codingprotocols/podscape/releases) and run it directly. This bypasses the in-app updater entirely.
2. On macOS, if the app is in a read-only location (e.g., mounted DMG), move it to `/Applications` before installing the update.

---

### How to check the current version

Open **Settings** (gear icon in the sidebar) and look at the version number displayed at the bottom of the settings panel. You can also check **About Podscape** from the macOS app menu.

---

## Performance Issues

### Large clusters with many resources

**Symptom:** Switching sections is slow, the UI freezes briefly after a context switch, or the sidecar takes a long time to start on large clusters.

**Cause:** The Go sidecar uses Kubernetes shared informers to cache resources in memory. On clusters with thousands of pods, nodes, or events, the initial informer sync can take 10–30 seconds. The health check polls every 500 ms for up to 90 seconds, so Podscape will wait for this sync to complete before showing the main window.

**Mitigations:**

1. Use the namespace filter — switching from "All Namespaces" to a specific namespace dramatically reduces the number of resources loaded into the renderer.
2. Avoid navigating to high-cardinality sections (Events, Pods across all namespaces) on very large clusters. Use the search filter to narrow results before selecting a resource.
3. The informer cache is shared across all sections, so the cost is paid once at startup, not on every section switch.

---

### Log streaming slowdowns

**Symptom:** Viewing logs in the Pod detail panel becomes slow or the terminal lags when streaming high-volume logs.

**Cause:** High log throughput from a very chatty container floods the WebSocket connection and xterm.js rendering buffer.

**Fix:**

1. Use the container filter in the pod detail panel to stream only the relevant container rather than all containers simultaneously.
2. Open a terminal session (Multi-Terminal section) and use `kubectl logs --since=1m -f <pod>` with `grep` to filter server-side before the output reaches the UI.
3. Consider reducing the log verbosity of the container if it is under your control.

---

### Security scan taking too long

**Symptom:** The Security Hub scan runs for a long time or appears to hang.

**Cause:** The security scan pulls image vulnerability data from Trivy, which fetches and caches vulnerability databases on first run. The first scan per image can take 30–60 seconds on a slow connection. Scanning clusters with many unique images multiplies this cost.

**Fix:**

1. Ensure Trivy is installed and its database is up to date:
   ```bash
   trivy image --download-db-only
   ```
2. Run the scan in a namespace with fewer workloads first to verify Trivy is working correctly before scanning the whole cluster.
3. If Trivy is not installed, Security Hub's static policy checks (privilege escalation, host network, missing resource limits) still run immediately without it — only the CVE scan requires Trivy.
