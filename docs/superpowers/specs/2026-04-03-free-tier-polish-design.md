# Podscape Free Tier Polish — Design Spec

**Date:** 2026-04-03

## Goal

Four targeted polish improvements to the free tier that increase retention and daily usability without touching monetization code.

---

## Feature 1: Post-Connection Tour

**What:** A one-time tooltip/step overlay shown the first time a user successfully connects to a cluster. 5 steps that highlight: Dashboard → Pods → Logs → Port Forwards → Settings. Dismissed manually or auto-dismissed after all steps.

**Trigger:** After `init()` resolves successfully in the renderer AND `settings.tourCompleted` is `false` (or absent).

**Storage:** Add `tourCompleted: boolean` to `PodscapeSettings` in `src/main/settings/settings_storage.ts` (default `false`). Set to `true` via `window.settings.set(...)` when tour is dismissed or completed. Persists across app restarts.

**Implementation:**
- New component: `src/renderer/components/core/TourOverlay.tsx`
- Renders a floating card anchored near the highlighted sidebar section
- State: `step: number` (0–4), controlled locally
- Mounted from `App.tsx` when `tourCompleted === false` and cluster is connected
- Each step: highlight target section in sidebar (CSS outline), show tooltip card with title + description + Next/Skip buttons
- On final step or Skip: call `window.settings.set({ ...currentSettings, tourCompleted: true })`, unmount

**Steps:**
| Step | Target | Message |
|------|--------|---------|
| 0 | Dashboard | "Your cluster at a glance — health, events, and metrics" |
| 1 | Pods | "Browse all workloads. Right-click any row for quick actions." |
| 2 | Unified Logs | "Stream logs from multiple pods simultaneously." |
| 3 | Port Forwards | "Forward ports without touching the terminal." |
| 4 | Settings | "Configure kubectl path, shell, and theme here." |

---

## Feature 2: Warning Event Banner on Dashboard

**What:** A collapsible amber banner at the top of `Dashboard.tsx` that appears when there are 1+ Warning events in the current event list. Shows count + "View Events →" link. Dismissed per-session (collapses, doesn't re-appear until app restart or new warnings arrive).

**Logic:**
- `warningCount = events.filter(e => e.type === 'Warning').length`
- Banner renders when `warningCount > 0 && !dismissed`
- Local `useState<boolean>` for `dismissed`; resets when context changes (new cluster)
- "View Events →" calls `store.setSection('events')`
- No persistence — banner reappears on next launch if warnings still present

**Placement:** Above the stats row in `Dashboard.tsx`, below the header bar.

**Component:** Inline in `Dashboard.tsx` — not a separate file (it's 10–15 lines).

---

## Feature 3: Copy-to-Clipboard in Detail Components

**What:** A small copy icon button next to values in detail panels. Clicking copies the value and briefly shows a ✓ checkmark (1.5s), then reverts.

**Shared utility:** New `src/renderer/components/common/CopyButton.tsx` — accepts `value: string`, renders a `Copy` (lucide) icon button that switches to `Check` for 1500ms after click. Uses `navigator.clipboard.writeText(value)`.

**Apply to:**
1. `ConfigMapDetail.tsx` — each key's value
2. `SecretDetail.tsx` — each revealed secret value
3. `PodDetail.tsx` — each env var value and each label/annotation value

**Not applied to:** YAML viewer (already has copy), port-forward panel (already has copy).

---

## Feature 4: Restart Count Badge in Pod List

**What:** Replace the plain restart count text in `PodRow` with a coloured pill badge. Three states based on count:
- `0` → grey pill, text `0`
- `1–4` → amber pill, text `{n}`
- `5+` → red pill with subtle pulse, text `{n}`

Clicking the badge when count > 0 navigates to the `debugpod` or restart analyzer section.

**Implementation:** Modify `PodRow` in `src/renderer/components/core/ResourceList.tsx`. Replace the existing `<span>` with a `<RestartBadge>` sub-component defined in the same file (not a separate file — it's 15 lines).

```
count === 0  → bg-slate-100 dark:bg-slate-800 text-slate-400
count 1–4   → bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400
count >= 5  → bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 + animate-pulse
```

Clicking when count > 0: calls `useAppStore.getState().setSection('debugpod')` (confirmed section name in `App.tsx`).

---

## Files Changed

| File | Action |
|------|--------|
| `src/main/settings/settings_storage.ts` | Add `tourCompleted: boolean` to interface + defaults |
| `src/renderer/components/core/TourOverlay.tsx` | Create — tour component |
| `src/renderer/App.tsx` | Mount `TourOverlay` when connected + not toured |
| `src/renderer/components/core/Dashboard.tsx` | Add warning banner |
| `src/renderer/components/common/CopyButton.tsx` | Create — shared copy button |
| `src/renderer/components/resource-details/config/ConfigMapDetail.tsx` | Add `CopyButton` per value |
| `src/renderer/components/resource-details/config/SecretDetail.tsx` | Add `CopyButton` per revealed value |
| `src/renderer/components/resource-details/workloads/PodDetail.tsx` | Add `CopyButton` to env vars + labels |
| `src/renderer/components/core/ResourceList.tsx` | Replace restart span with `RestartBadge` |

---

## Out of Scope

- Multi-cluster tabs (Month 2)
- License/monetization infrastructure
- Changes to Go sidecar
- Any new IPC channels
