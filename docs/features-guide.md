---
title: Features Guide
nav_order: 6
---

# Features Guide

This guide covers features that go beyond basic resource browsing. Each section explains what the feature does, when to use it, and how to operate it.

---

## Command Palette

The Command Palette gives you instant access to every section and every loaded resource in your cluster without touching the sidebar.

### Opening and closing

| Platform | Shortcut |
|----------|----------|
| macOS | `⌘K` |
| Windows / Linux | `Ctrl+K` |

Press the same shortcut again, or press `Escape`, to dismiss the palette.

### How to use it

Start typing as soon as the palette opens. Results appear in two groups:

- **Sections** — up to 5 matching navigation destinations (Dashboard, Pods, Security Hub, Connectivity, etc.)
- **Resources** — up to 12 matching Kubernetes objects by name, drawn from all 27+ resource types that are currently loaded in the store

Use `↑` and `↓` to move between results, then press `↵` to navigate. Selecting a resource result navigates directly to that resource's detail view, automatically switching the namespace and section for you.

### What is searchable

The palette searches across:

- All section names and their aliases (e.g. searching `"batch"` surfaces Jobs and CronJobs; `"rbac"` surfaces Roles, ClusterRoles, RoleBindings, and ClusterRoleBindings)
- The `section` identifier itself (e.g. `"unifiedlogs"`)
- The `.metadata.name` field of every loaded resource across all 27 resource types

### Example queries

| Query | What it finds |
|-------|--------------|
| `nginx-api` | Any pod, deployment, or service whose name contains `nginx-api` |
| `batch` | Navigates to Jobs or CronJobs sections |
| `scan` | Navigates to Security Hub |
| `cert` | Navigates to TLS Certificates |
| `ping` | Navigates to Connectivity Tester |
| `my-postgres` | Opens the detail view for the `my-postgres` StatefulSet (or pod, or service) directly |

### When to use it

The Command Palette is most useful when you already know the name of the resource you want to inspect, or when you need to jump between sections quickly without scrolling the sidebar. It is the fastest path from any screen to any resource.

---

## Production Context Protection

Accidentally running a destructive operation against a production cluster is a serious risk. Production Context Protection adds a persistent visual warning whenever you are connected to a cluster you have marked as production.

### What it looks like

When the active context is a production context, Podscape shows two simultaneous indicators:

1. A **red "PRODUCTION CONTEXT ACTIVE" banner** drops down from the top-center of the window.
2. A **4px red inset ring** appears around the entire application frame, making it visually unmistakable even when the banner is outside your line of sight.

Both indicators are active for the entire session — they do not auto-dismiss.

### How to configure it

1. Open **Settings** (sidebar, bottom of the left navigation, or search `"settings"` in the Command Palette).
2. Find the **Production Contexts** field.
3. Enter the names of your production kubeconfig contexts, one per line or comma-separated.
4. Save. The setting is stored in `~/.podscape/settings.json` under the `prodContexts` key and persists across restarts.

The check is performed whenever you switch contexts. If the newly selected context is in your `prodContexts` list, the indicators activate immediately and stay active until you switch to a non-production context.

### Why it is useful

The visual indicators serve as a last line of defence before you scale a deployment down to zero, delete a namespace, or drain a node. Unlike role-based access controls that live in the cluster, this protection is client-side and requires no cluster permissions to configure.

---

## Unified Log Streaming

Unified Log Streaming lets you watch the live output of multiple pods side by side in a single, color-coded terminal view. It is the fastest way to correlate log lines across replicas or co-dependent services.

### Opening the panel

Navigate to **Unified Logs** in the sidebar, or search `"unified"` in the Command Palette (`⌘K` / `Ctrl+K`).

### Adding pods to the stream

1. Type a pod name or namespace into the **"Add pods to stream..."** search field in the top-right of the panel. The field autocompletes against all Running pods in your selected namespace.
2. Click a pod in the dropdown to add it to the active stream list. You can add as many pods as you need.
3. Added pods appear as dismissible pills in the **Streams** row below the toolbar.

Only Running pods are shown in the picker. Pods that terminate while streaming are automatically removed from the selection.

### Starting and stopping

Click **Start Stream** to begin streaming. Podscape opens a live WebSocket log stream for the first container in each selected pod simultaneously. The button changes to **Stop All** while streaming is active.

You cannot add or remove pods while a stream is running. Stop the stream first, adjust the selection, then restart.

### Color coding

Each pod is assigned a distinct color from a fixed palette (blue, green, rose, amber, purple, cyan, orange, pink). The pod name column in the log output uses this color, making it easy to visually separate log lines from different sources at a glance.

### Searching and filtering

A **Filter Log Output** bar sits at the bottom of the terminal area. Type any string to filter the displayed log lines in real time — only lines whose message or pod name contains the search term are shown. Matching text is highlighted inline with a blue background. The filter does not affect the underlying stream; remove the search term to see all lines again.

The panel retains at most **1,000 log lines** in memory. Older lines are discarded as new ones arrive.

### Auto-scroll

The **Auto** toggle button in the toolbar controls whether the log view automatically scrolls to the bottom as new lines arrive. Auto-scroll is on by default. Click the button to pause at your current scroll position (useful when reviewing older output); click it again to resume following the live tail.

Use the **trash icon** button to clear all buffered log lines without stopping the stream.

### Context switching

Switching to a different kubeconfig context automatically stops all active streams and clears the pod selection and log buffer. This prevents stale log data from a previous cluster appearing after a context switch.

---

## Connectivity Tester

The Connectivity Tester lets you verify network reachability between pods inside your cluster without leaving Podscape. It runs diagnostic commands inside a source pod using `kubectl exec`, so no external tooling is required.

Navigate to **Connectivity** in the sidebar (under the **Tools** group), or search `"connectivity"` in the Command Palette.

### Two modes

| Mode | When to use |
|------|-------------|
| **Diagnose** | Automated step-by-step DNS → TCP → HTTP test between a source pod and a target service or pod |
| **Manual** | Run a single arbitrary command (`curl`, `nc`, or `ping`) from a source pod to any target |

Switch between modes using the **Diagnose** / **Manual** toggle at the top of the panel.

### Diagnose mode

Diagnose mode walks through three steps in sequence:

1. **DNS Resolution** — runs `nslookup` against the target hostname inside the source pod to verify the cluster DNS can resolve the name.
2. **TCP Port Check** — runs `nc -zv` to confirm the target's TCP port is reachable.
3. **HTTP Response** — runs `curl` with a 10-second timeout and reports the HTTP status code and total response time.

If the DNS step fails, the TCP and HTTP steps are automatically skipped (they would fail for the same reason). Each step reports its result and duration in milliseconds, and you can expand an **Output** section to see the raw command output.

**Failure Analysis** — if any step fails, an "Investigate Failure" button appears. Clicking it fetches the relevant NetworkPolicies and Endpoint objects from the cluster and displays:

- **Ingress NetworkPolicies** in the target namespace — including which pods they select and whether they are a deny-all policy.
- **Egress NetworkPolicies** on the source pod — to identify outbound traffic restrictions.
- **Endpoint readiness** for the target service — showing how many pods are ready and their names.

This analysis saves the manual work of cross-referencing `kubectl get netpol` output with endpoint state when tracking down connectivity failures.

**Example diagnostic workflow:**

1. Select **Source pod**: `frontend-abc123` (namespace: `prod`)
2. Set **Target**: `api-service.prod.svc.cluster.local`, port `8080`, path `/health`
3. Click **Run Diagnosis**
4. Step 1 (DNS) passes in 12ms. Step 2 (TCP) fails after 5000ms.
5. Click **Investigate Failure** — the analysis shows a NetworkPolicy `deny-external-ingress` in the `prod` namespace that selects all pods and denies all ingress with no rules defined. This is the cause of the TCP failure.

### Manual mode

Manual mode gives you direct access to three commands:

| Command | Use case |
|---------|----------|
| `curl` | Test HTTP/HTTPS endpoints, check response codes, inspect headers |
| `nc` | Check raw TCP port reachability |
| `ping` | Verify basic IP-level connectivity and measure round-trip time |

Select the source pod, enter the host, port, and optional path, choose a protocol, and click **Run**. The raw output and exit code are displayed inline. The run history is preserved in the panel so you can compare results across multiple tests.

### How targets are specified

- **Service DNS names** are auto-completed from the list of services in your cluster. Selecting a service fills in the canonical cluster DNS name (e.g. `my-svc.my-namespace.svc.cluster.local`).
- **Pod DNS names** are derived from the pod's IP address using the stable pod DNS format (`<ip-dashes>.<namespace>.pod.cluster.local`).
- You can also type any hostname or IP address manually.

---

## Pod Diagnostics

Pod Diagnostics provides automated crash analysis and a chronological event timeline directly inside the Pod detail panel. Open any pod from the Pods section, then select the **Diagnostics** tab.

### Restart Analyzer

The Restart Analyzer inspects the pod's container statuses and correlated events to produce a human-readable diagnostic summary. It checks for:

| Condition | What it means |
|-----------|--------------|
| **OOMKilled** | The container was terminated by the Linux kernel because it exceeded its configured memory limit. The analyzer flags this with a red "Memory Limit Exceeded" card and recommends increasing resource limits. |
| **Non-zero exit code** | The application process crashed. The analyzer shows a "Application Crash" warning card with the exit code and advises checking application logs for stack traces. |
| **Unhealthy probe events** | Liveness or readiness probe failures that caused a restart. The analyzer surfaces the probe failure message from the cluster event stream. |
| **CrashLoopBackOff** | The pod is restarting repeatedly and Kubernetes is applying exponential backoff. Shown as a red error card. |

If none of these conditions are found, the analyzer shows a green "Everything looks stable!" indicator.

Below the diagnostic summary, the **Last Termination States** section shows a per-container breakdown of the last recorded termination: reason, exit code, timestamp, and any termination message from the container runtime.

### Lifecycle Timeline

The Lifecycle Timeline renders a chronological vertical timeline of every significant event in the pod's life, from creation to the current moment. Each entry includes:

- A color-coded dot: green (success), amber (warning), red (error), blue (info)
- The event title and a human-readable message
- A relative timestamp ("3m ago")
- A repeat count badge if the same event occurred multiple times
- A pulsing **LIVE** badge on the current state when the pod is still active

The timeline combines data from the pod's own status conditions (Scheduled, Initialized, ContainersReady, Ready) with events fetched from the Kubernetes event stream for that pod. This gives you the complete picture of what happened during a pod's startup sequence or after a failure — without running `kubectl describe pod`.

### When to use Pod Diagnostics

- A pod is restarting repeatedly and you need to determine whether it is OOM, a probe failure, or an application crash.
- A pod is stuck in `Pending` or `CrashLoopBackOff` and you want to understand the sequence of events that led to the current state.
- You are reviewing the startup sequence of a newly deployed pod to confirm all readiness gates passed in the expected order.

---

## Auto-Updater

Podscape checks for new releases automatically in the background using the built-in Electron auto-updater. No manual download or re-installation is required.

### How update checks work

On startup, Podscape queries the GitHub Releases feed for the repository. If a newer version is available, a banner appears at the very top of the application window. The check runs once per launch; there is no periodic polling during the session.

### The UpdateBanner flow

The banner progresses through three states:

**1. Available (blue banner)**

> Podscape `<version>` is available. [Download] [×]

A **Download** button starts the background download immediately. You can dismiss the banner with the `×` button and continue working; the download does not happen unless you explicitly click Download.

**2. Downloading (blue banner with progress bar)**

> Downloading update… 47%

A progress bar fills as the update package downloads. The banner cannot be dismissed during this state.

**3. Ready to install (green banner)**

> Podscape `<version>` is ready to install. [Restart & Install]

Click **Restart & Install** to quit Podscape, apply the update, and relaunch. If you dismissed the "available" notice earlier, the banner re-appears automatically when the download completes — you will always see this final prompt before the install.

If the update check or download fails, an amber error banner appears with the failure reason. You can dismiss it and continue using the current version.

### Supported platforms

Automatic updates are supported on macOS and Windows. Linux users receive a notification but must download and install the new package manually from the GitHub Releases page.
