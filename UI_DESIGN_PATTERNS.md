# Podscape UI Design Patterns

Reference for all AI agents and contributors. Every new component must follow these patterns exactly — do not introduce new design tokens, class combinations, or layout structures that aren't already present here.

---

## Stack

- **Tailwind CSS** via `tailwind.config.js` — `darkMode: 'class'`
- **Custom CSS** at `src/renderer/index.css` — defines CSS variables and utility component classes
- **Font:** `Inter` → `-apple-system` → `BlinkMacSystemFont` → system sans-serif
- **Icons:** `lucide-react` exclusively
- **Theme toggle:** stored in Zustand (`theme: 'light' | 'dark'`); toggled by adding/removing `dark` class on `<html>`

---

## CSS Variables (from `index.css`)

```css
--primary:        hsl(221, 70%, 55%)    /* blue-ish */
--primary-muted:  hsla(221, 70%, 55%, 0.1)
--success:        hsl(142, 60%, 45%)    /* emerald */
--warning:        hsl(38, 80%, 50%)     /* amber */
--danger:         hsl(0, 70%, 60%)      /* red */
--info:           hsl(188, 60%, 41%)    /* cyan */

--bg-dark:        222, 20%, 6%          /* near-black, used as hsl() */
--bg-light:       210, 20%, 98%
--sidebar-dark:   222, 20%, 8%
--sidebar-light:  210, 20%, 97%
--border-dark:    217, 15%, 15%
--border-light:   214, 15%, 85%
```

Use these with `hsl(var(--bg-dark))` or the Tailwind counterparts listed below.

---

## Color Palette

### Semantic colors — always use these, never ad-hoc colors

| Meaning | Background | Text | Border | Glow shadow |
|---------|-----------|------|--------|-------------|
| **Success / Ready** | `bg-emerald-500/10` | `text-emerald-500` | `border-emerald-500/20` | `shadow-[0_0_8px_#10b981]` |
| **Warning / Pending** | `bg-amber-500/10` | `text-amber-500` | `border-amber-500/20` | `shadow-[0_0_8px_rgba(245,158,11,0.7)]` |
| **Danger / Error** | `bg-red-500/10` or `bg-rose-500/10` | `text-red-500` or `text-rose-500` | `border-red-500/20` | `shadow-[0_0_8px_#f43f5e]` |
| **Info / Active** | `bg-blue-500/10` | `text-blue-500` or `text-blue-400` | `border-blue-500/20` | `shadow-[0_0_8px_#3b82f6]` |
| **Neutral / Muted** | `bg-slate-500/10` or `bg-white/[0.03]` | `text-slate-400` or `text-slate-500` | `border-white/5` | — |

### Surfaces (dark mode)

| Layer | Class |
|-------|-------|
| Root background | `bg-[hsl(var(--bg-dark))]` or `dark:bg-slate-950` |
| Elevated surface (sidebar, panels) | `.surface-elevated` |
| Card background | `dark:bg-white/[0.02]` |
| Hover card | `dark:hover:bg-white/[0.04]` |
| Border | `dark:border-white/5` |
| Hover border | `dark:hover:border-white/[0.1]` |

### Surfaces (light mode)

| Layer | Class |
|-------|-------|
| Root background | `bg-white` |
| Card | `bg-white` with `border-slate-200` |
| Hover | `hover:bg-slate-50` or `hover:bg-slate-100` |
| Border | `border-slate-200` |

---

## Typography

**Rule:** Almost all UI text is `uppercase` with generous letter-spacing.

| Use | Classes |
|-----|---------|
| Page / section title | `text-2xl font-black uppercase tracking-tight text-slate-900 dark:text-white` |
| Section heading / label | `text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400` |
| Nav group label | `text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500` |
| Nav item | `text-[12px] font-semibold` |
| Table header cell | `text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500` |
| Table body cell | `text-xs font-semibold` or `text-[11px] font-medium` |
| Badge / status text | `text-[9px] font-black uppercase tracking-widest` |
| Subtitle / helper text | `text-[9px] text-slate-400 dark:text-slate-600` |
| Code / IDs / ports | `font-mono text-xs` or `font-mono text-[10px]` |
| Stat value | `text-3xl font-black tabular-nums leading-none tracking-tighter` |

**Font weight usage:**
- `font-black` (900) — titles, labels, badges, active states
- `font-bold` (700) — headings, field names
- `font-semibold` (600) — body, table cells
- `font-medium` (500) — secondary descriptions
- `font-mono` — any code, IP, port, name, ID value

---

## Glass Effect Classes (from `index.css`)

These are the only glass classes. Do not compose `backdrop-blur` manually.

| Class | Use |
|-------|-----|
| `.glass-light` | Subtle overlays, tooltips |
| `.glass-medium` / `.glass-panel` | Default panels, headers, nav sections |
| `.glass-heavy` | Side drawers, large overlays, modals |
| `.glass-card` | Cards with hover shadow: `glass-medium shadow-lg rounded-2xl hover:shadow-xl` |
| `.card-solid` | Opaque card (no transparency) |
| `.surface-elevated` | Sidebar, nav rail |

---

## Custom Utility Classes

| Class | Produces |
|-------|---------|
| `.premium-gradient` | `linear-gradient(135deg, --primary, darker blue)` — use only for primary CTA buttons |
| `.active-glow` | `box-shadow: 0 0 15px hsla(brand, 0.3)` — active sidebar nav item |
| `.resize-handle-v` | Vertical drag-resize handle (cursor + hover color) |
| `.scrollbar-hide` | Hides scrollbar visually |
| `.animate-orbit` | 3s clockwise rotation (logo animation) |
| `.animate-orbit-reverse` | 5s counter-clockwise rotation |
| `.animate-float` | Gentle float up/down (3s) |

---

## Spacing

| Use | Classes |
|-----|---------|
| Page body padding | `px-8 py-8` |
| Page header | `pl-8 pr-6 py-7` |
| Card padding | `p-6` (standard), `p-8` (large) |
| Dense panel | `px-4 py-3` or `px-6 py-5` |
| Form input | `px-4 py-3` |
| Button | `px-5 py-2.5` (primary), `px-4 py-2` (secondary), `px-3 py-1.5` (small) |
| Badge / tag | `px-2.5 py-1` |
| Table header cell | `px-6 py-4` |
| Table body cell | `px-6 py-3` |
| Gap between action buttons | `gap-4` |
| Gap between icon + label | `gap-2` or `gap-2.5` |
| Section item spacing | `space-y-0.5` (nav), `gap-6` (cards grid) |

---

## Border Radius

| Size | Class | Use |
|------|-------|-----|
| Small (inputs, badges) | `rounded-xl` | Inputs, small buttons, tags |
| Medium (cards, modals) | `rounded-2xl` | Cards, modal containers |
| Large (hero cards) | `rounded-3xl` | Stat cards, dashboard tiles |
| Extra large (empty states) | `rounded-[32px]` or `rounded-[40px]` | Empty state containers |
| Full (dots, avatars) | `rounded-full` | Dot indicators, cluster avatars, progress tracks |

---

## Buttons

### Primary (destructive action or key CTA)
```tsx
className="flex items-center gap-2 px-5 py-2.5
           text-[11px] font-black uppercase tracking-[0.1em] text-white
           premium-gradient rounded-xl
           shadow-lg shadow-blue-500/20
           transition-all active:scale-95"
```

### Secondary
```tsx
className="flex items-center gap-2 px-5 py-2.5
           text-[11px] font-black uppercase tracking-wider
           text-slate-600 dark:text-slate-300
           glass-panel hover:bg-white/10 dark:hover:bg-white/5 rounded-xl shadow-sm
           disabled:opacity-50 active:scale-95 transition-all"
```

### Ghost / minimal
```tsx
className="text-[11px] font-bold px-4 py-1.5 rounded-xl
           bg-white/5 text-slate-600 dark:text-slate-300
           border border-slate-100 dark:border-white/5
           hover:bg-white/10 transition-all disabled:opacity-50"
```

### Danger
```tsx
className="flex items-center gap-2 px-4 py-3
           text-[10px] font-black uppercase tracking-widest text-white
           bg-red-600 hover:bg-red-700 rounded-xl
           transition-all shadow-lg shadow-red-500/20 disabled:opacity-40"
```

### Toggle / tab button
```tsx
className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg
            transition-all border-2
  ${active
    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
    : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'
  }`}
```

### Icon-only button
```tsx
className="w-8 h-8 flex items-center justify-center rounded-xl
           hover:bg-white/10 text-slate-500 hover:text-white
           transition-colors"
```

**Rules:**
- All buttons use `active:scale-95`
- Disabled state: `disabled:opacity-50`
- Loading state: swap icon to `<Loader2 className="animate-spin" />`

---

## Form Inputs

### Text input
```tsx
className="w-full bg-white/[0.03] text-slate-900 dark:text-slate-100
           text-xs font-mono rounded-xl px-4 py-3
           border border-white/5
           focus:outline-none focus:ring-2 focus:ring-blue-500/40
           hover:bg-white/[0.05] transition-all"
```

### Select dropdown
```tsx
// Wrapper (for custom arrow)
className="relative"

// Select element
className="w-full bg-white/[0.06] text-slate-300
           text-[11px] font-medium
           rounded-lg px-2.5 py-1.5 pr-6
           border border-white/[0.08]
           focus:outline-none focus:ring-1 focus:ring-blue-500/40 focus:border-blue-500/40
           appearance-none cursor-pointer transition-colors
           hover:bg-white/[0.09] hover:border-white/[0.12]"

// Arrow icon overlay
className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500"
```

### Search input (with leading icon)
```tsx
<div className="relative group">
  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5
                     text-slate-400 group-focus-within:text-blue-500 transition-colors" />
  <input
    className="pl-9 pr-4 py-2 text-[11px] font-bold
               bg-white dark:bg-slate-900
               border border-slate-200 dark:border-slate-800 rounded-xl
               focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500
               transition-all w-48"
  />
</div>
```

### Label
```tsx
<label className="text-[11px] font-black uppercase tracking-widest
                  text-slate-500 dark:text-slate-400">
  Field Name
</label>
```

---

## Status Badges

### Standard status badge (pods, deployments, helm releases)
```tsx
className={`inline-flex items-center gap-1.5 px-2.5 py-1
            rounded-xl text-[9px] font-black uppercase tracking-widest
            border
  ${status === 'Running' || status === 'Ready' || status === 'deployed'
    ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
    : status === 'Pending' || status === 'starting'
    ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
    : 'bg-red-500/10 text-red-500 border-red-500/20'
  }`}
>
  <span className={`w-1.5 h-1.5 rounded-full
    ${status === 'Running' ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : '...'}`} />
  {status}
</badge>
```

### Dot-only indicator
```tsx
<span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981] shrink-0" />
```

### Count / number badge
```tsx
className="inline-flex items-center justify-center px-2 py-0.5 rounded-lg
           bg-blue-500/10 text-blue-500
           text-[10px] font-black tracking-tighter
           border border-blue-500/10"
```

### Animated dot (live/active)
```tsx
<span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
```

---

## Page Header

Always use the `PageHeader` component (`src/renderer/components/PageHeader.tsx`):

```tsx
<PageHeader title="Deployments" subtitle="12 resources · default">
  {/* action buttons go here */}
</PageHeader>
```

The component renders:
- `text-2xl font-black uppercase tracking-tight` title
- Subtitle with animated blue dot: `w-1 h-1 rounded-full bg-blue-500 shadow-[0_0_8px_#3b82f6]`
- `sticky top-0 z-30` with `backdrop-blur-md bg-white/5 border-b border-slate-200 dark:border-white/5`

---

## Tables

```tsx
{/* Container */}
<div className="overflow-auto">
  <table className="w-full border-collapse">

    {/* Header */}
    <thead className="sticky top-0 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md z-10">
      <tr className="border-b border-slate-100 dark:border-slate-800">
        <th className="text-left px-6 py-4
                       text-[10px] font-bold uppercase tracking-widest
                       text-slate-400 dark:text-slate-500">
          Name
        </th>
      </tr>
    </thead>

    {/* Body */}
    <tbody>
      <tr className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors
        ${selected ? 'bg-blue-600/10 border-l-[3px] border-blue-500 shadow-[inset_4px_0_12px_-4px_rgba(59,130,246,0.3)]' : ''}`}>
        <td className="px-6 py-3 font-mono text-xs font-semibold">value</td>
      </tr>
    </tbody>

  </table>
</div>
```

---

## Cards (Stat / Dashboard)

```tsx
<div className="flex flex-col gap-4 p-6 rounded-3xl
               bg-white/[0.02] border border-white/[0.06]
               shadow-xl group
               hover:bg-white/[0.04] hover:border-white/[0.1]
               transition-all duration-300 relative overflow-hidden">

  {/* Icon box */}
  <div className="w-9 h-9 rounded-xl flex items-center justify-center
                  border transition-transform group-hover:scale-110">
    <Icon size={16} />
  </div>

  {/* Value */}
  <p className="text-3xl font-black tabular-nums leading-none tracking-tighter text-white">
    42
  </p>

  {/* Label */}
  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
    Pods Running
  </p>

</div>
```

---

## Modal Dialogs

```tsx
{/* Overlay */}
<div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm
               flex items-center justify-center p-8
               animate-in fade-in duration-150">

  {/* Container */}
  <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl
                  border border-slate-200 dark:border-slate-800
                  w-full max-w-md overflow-hidden">

    {/* Header */}
    <div className="flex items-center justify-between px-6 py-4
                    border-b border-slate-100 dark:border-slate-800">
      <h3 className="text-sm font-bold uppercase tracking-widest
                     text-slate-900 dark:text-white">
        Dialog Title
      </h3>
      <button onClick={onClose} className="w-6 h-6 flex items-center justify-center
                                           rounded-md hover:bg-white/10
                                           text-slate-500 hover:text-white transition-colors">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>

    {/* Body */}
    <div className="px-6 py-5 space-y-4">
      {/* content */}
    </div>

    {/* Footer */}
    <div className="flex gap-3 px-6 py-4
                    border-t border-slate-100 dark:border-slate-800">
      {/* buttons */}
    </div>

  </div>
</div>
```

---

## Detail / Side Panels

```tsx
{/* Split view wrapper — right panel */}
<div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden
               border-l border-slate-200 dark:border-white/5">

  {/* Close strip */}
  <div className="flex items-center justify-end px-3 py-1.5 shrink-0
                  border-b border-slate-100 dark:border-white/5">
    <button onClick={() => selectResource(null)}
            className="w-6 h-6 flex items-center justify-center rounded-md
                       hover:bg-white/10 text-slate-500 hover:text-white transition-colors"
            title="Close (Esc)">
      <X className="w-3.5 h-3.5" />
    </button>
  </div>

  {/* Scrollable content */}
  <div className="flex-1 min-h-0 overflow-auto">
    {/* detail component */}
  </div>

</div>
```

---

## Empty States

```tsx
<div className="flex flex-col items-center justify-center py-24
               bg-white dark:bg-white/[0.01]
               border border-dashed border-slate-200 dark:border-white/10
               rounded-[40px] gap-5">

  {/* Icon container */}
  <div className="w-16 h-16 rounded-[24px]
                  bg-slate-50 dark:bg-white/[0.03]
                  flex items-center justify-center
                  text-slate-200 dark:text-slate-800 shadow-inner">
    <Icon size={28} />
  </div>

  {/* Message */}
  <p className="text-[11px] font-black uppercase tracking-[0.4em]
                text-slate-400 dark:text-slate-700">
    No Resources Found
  </p>

</div>
```

---

## Loading States

### Full-panel spinner
```tsx
<div className="flex items-center justify-center h-32">
  <div className="w-8 h-8 border-2 border-slate-700 border-t-blue-500
                  rounded-full animate-spin" />
</div>
```

### Inline button spinner
```tsx
<Loader2 size={14} className="animate-spin" />
```

### Skeleton (if needed)
```tsx
<div className="h-4 w-32 rounded-xl bg-white/5 animate-pulse" />
```

---

## Progress / Usage Bars

```tsx
{/* Track */}
<div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800/50 overflow-hidden shadow-inner">
  {/* Fill — color based on percentage */}
  <div className={`h-full rounded-full transition-all duration-700
    ${pct >= 85 ? 'bg-red-500' : pct >= 65 ? 'bg-orange-500' : pct >= 45 ? 'bg-yellow-500' : 'bg-blue-500'}`}
       style={{ width: `${pct}%` }} />
</div>
```

### Ring chart (SVG donut)
- `size=68`, `stroke=7`
- Color thresholds: `≥85%` → red, `≥65%` → orange, `≥45%` → yellow, `<45%` → blue
- Label below: `text-[9px] font-black uppercase tracking-[0.15em]`

---

## Icons

Use `lucide-react` only. Size conventions:

| Context | Size |
|---------|------|
| Badge / tight label | `size={12}` or `w-3 h-3` |
| Nav item, inline text | `size={14}` or `w-3.5 h-3.5` |
| Buttons, form inputs | `size={14}–16` or `w-4 h-4` |
| Card icon box | `size={16}` |
| Section / panel header | `size={18}` |
| Empty state icon box | `size={28}–32` |

Color convention:
```tsx
className="text-slate-400"           // default neutral
className="text-blue-500"            // active / info
className="text-emerald-500"         // success
className="text-amber-500"           // warning
className="text-red-500"             // danger
className="text-slate-500 group-hover:text-slate-300 transition-colors"  // interactive neutral
```

---

## Animations & Transitions

| Class | Use |
|-------|-----|
| `transition-all duration-200` | Default — hover states, show/hide |
| `transition-all duration-300` | Cards, panels |
| `transition-colors` | Color-only changes |
| `transition-all duration-700` | Slow metric updates |
| `active:scale-95` | Button press feedback |
| `hover:scale-[1.02]` | Subtle card lift |
| `group-hover:scale-110` | Icon inside hovered card |
| `animate-spin` | Loading spinner |
| `animate-spin-slow` | 2s slow spin (Tailwind extension) |
| `animate-pulse` | Pulsing dot indicator |
| `animate-in fade-in duration-150` | Modal entrance |
| `animate-in fade-in zoom-in-95` | Panel/card entrance |
| `animate-orbit` | 3s continuous rotation |
| `animate-float` | Gentle float (3s ease-in-out) |

---

## Scrollbars

Global scrollbar style (from `index.css`):
- Width: `5px`
- Track: transparent
- Thumb: `bg-slate-300/50` (light) / `bg-slate-800/50` (dark), `rounded-full`
- Hover: `bg-slate-400/50` / `bg-slate-700/50`

To hide entirely: add `.scrollbar-hide` class.

---

## Layout Conventions

### App shell
```
[Icon Rail 72px] [Nav Sidebar ~280px resizable] [Main Content flex-1] [Detail Panel ~520px optional]
```

### Main content area
- Flex column, fills remaining space
- `PageHeader` sticky at top
- Body: `px-8 py-8` with `overflow-auto`

### Common grid patterns
```tsx
grid grid-cols-2 md:grid-cols-2 lg:grid-cols-5 gap-6   // stat cards
grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6   // resource cards
grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6   // node cards
```

### Split-view (list + detail)
```tsx
<div className="flex flex-1 min-h-0 overflow-hidden">
  <div className="flex-1 min-w-0 overflow-auto">{/* ResourceList */}</div>
  {selectedResource && <DetailPanel />}   {/* ~520px, border-l */}
</div>
```

---

## Anti-patterns — Never Do These

- Do not use arbitrary opacity values not already in use (e.g. `/15`, `/25`, `/35` — stick to `/5`, `/10`, `/20`, `/30`)
- Do not use colors outside the palette (no `teal`, `fuchsia`, `lime` — only the semantic set)
- Do not use `rounded-lg` for cards (use `rounded-xl` minimum)
- Do not add `font-normal` or `font-light` — the lightest used is `font-medium`
- Do not use `text-sm` for labels or badges — use `text-[10px]` or `text-[11px]` with `font-black`
- Do not compose `backdrop-blur` manually — use `.glass-light`, `.glass-medium`, `.glass-heavy`
- Do not add `text-transform: none` to UI text — everything is uppercase
- Do not use `padding: 0` on interactive elements — minimum `py-1`
- Do not introduce new custom CSS classes without adding them to `index.css` `@layer components`
