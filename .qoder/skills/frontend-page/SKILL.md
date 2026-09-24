---
name: frontend-page
description: GiftRegistry frontend page development agent. Use when building React components, pages, Zustand stores, API client calls, or UI styling in web/src/. Covers all pages (login, dashboard, collect, guestbook, people, accounts, stats, settings, records), responsive layout (mobile/tablet/desktop), design system tokens, and PWA features. Enforces TypeScript strict mode, Tailwind-only styling with design tokens, amounts in cents, and pnpm package management.
---

# Frontend Page Agent — 随礼记账本

Develop and maintain the React frontend for GiftRegistry. All work lives under `web/src/`.

## Tech Stack

- React 19.3, TypeScript 6.0 (strict), Vite 8, Tailwind CSS 4, Zustand 5, TanStack Router, dayjs, vite-plugin-pwa 1.0+
- Package manager: **pnpm 12+** (not npm/yarn)
- HTTP client: custom `api` wrapper around `fetch` (see `lib/api.ts`)

## Hard Constraints

1. **TypeScript strict** — No `any` escapes. All API responses must have type definitions in `types/index.ts`.
2. **Tailwind only** — All styling via Tailwind utility classes + custom design tokens. No inline `style={}` except for dynamic values. No separate CSS files beyond `styles/index.css`.
3. **Amounts in cents** — All money fields are integers (unit: 分). Display with `(amount / 100).toFixed(2)`. Parse input with `Math.round(parseFloat(value) * 100)`.
4. **Design tokens** — Use theme tokens (`bg-primary`, `text-ink`, `rounded-card`, `shadow-card`, etc.) from `styles/index.css`. Never hardcode color values like `#E07B3A` — use `bg-primary` instead.
5. **State layering** — Local UI state → `useState`. Cross-component/session state → Zustand `appStore`. Auth/token → `localStorage` via `lib/auth.ts`.
6. **Responsive breakpoints** — Mobile-first. `< 1280px` = mobile/tablet layout (bottom tab bar). `≥ 1280px` (`xl:`) = desktop layout (top nav + sidebar 280px).
7. **PWA compatible** — Critical data should degrade gracefully offline. Use `syncStatus` from store for connectivity indicators.
8. **Accessibility** — Touch targets ≥ 48px. Font sizes ≥ 16px for body text. Amount display ≥ 32px (use `text-amount` utility class for 40px).

## Development Flow

```
Requirement → Identify affected pages/components → Update types if needed → Build UI with Tailwind tokens → Wire API calls via api-client → Test in browser
```

## Code Patterns

### Page Component

```tsx
import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import PageScaffold from '../components/PageScaffold'
import Toast, { useToast } from '../components/Toast'
import type { SomeType } from '../types'
import { fetchSomething } from '../lib/api-client'

export default function SomePage() {
  const { id } = useParams<{ id: string }>()
  const { toast, showToast } = useToast()
  const [data, setData] = useState<SomeType | null>(null)
  const [loading, setLoading] = useState(false)

  const reload = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const result = await fetchSomething(Number(id))
      setData(result)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { reload() }, [reload])

  return (
    <PageScaffold title="页面标题">
      {/* Content using design tokens */}
      <div className="rounded-card bg-card p-5 shadow-card">
        <p className="text-amount">¥{((data?.amount ?? 0) / 100).toFixed(2)}</p>
      </div>
      <Toast message={toast} onClose={() => showToast(null)} />
    </PageScaffold>
  )
}
```

### API Client Function

```tsx
// In lib/api-client.ts
import type { SomeType } from '../types'
import { api } from './api'

export async function fetchSomething(id: number): Promise<SomeType> {
  return api.get<SomeType>(`/some-endpoint/${id}`)
}

export async function createSomething(input: Omit<SomeType, 'id' | 'created_at'>): Promise<number> {
  const res = await api.post<{ id: number }>('/some-endpoint/', input)
  return res.id
}
```

### Zustand Store Slice

```tsx
// Extend appStore.ts interface
interface AppState {
  // ... existing fields
  newData: SomeType[]
  setNewData: (data: SomeType[]) => void
}

export const useAppStore = create<AppState>((set) => ({
  // ... existing state
  newData: [],
  setNewData: (newData) => set({ newData }),
}))
```

### Type Definition

```tsx
// In types/index.ts
export interface SomeType {
  id?: number
  name: string
  amount: number  // cents (分)
  created_at: string
}
```

## Routing

| Path | Component | Notes |
|------|-----------|-------|
| `/login` | LoginPage | Login page (no auth required) |
| `/` | DashboardPage | Home dashboard |
| `/records` | RecordsListPage | Daily records list |
| `/records/new` | RecordFormPage | New daily record |
| `/guestbooks` | GuestbookListPage | Guestbook list |
| `/guestbooks/new` | GuestbookNewPage | Create guestbook |
| `/guestbooks/:id` | GuestbookDetailPage | Guestbook detail + tabs |
| `/guestbooks/:id/collect` | CollectPage | Core: on-site gift collection |
| `/accounts` | AccountsPage | Payment account management |
| `/people` | PeoplePage | Person management |
| `/stats` | StatsPage | Statistics & reports |
| `/settings` | SettingsPage | App settings |
| `/join` | PlaceholderPage | Collaboration (TBD) |

All routes except `/login` are rendered inside `<AppLayout />` wrapped by `ProtectedRoute` (checks `isAuthenticated()`, redirects to `/login` if not authenticated).

## Key Components

| Component | Path | Purpose |
|-----------|------|---------|
| AppLayout | `components/layout/AppLayout.tsx` | Responsive frame: mobile bottom tabs vs desktop sidebar |
| PageScaffold | `components/PageScaffold.tsx` | Page wrapper with title, description, actions slot |
| Toast | `components/Toast.tsx` | Toast notification + `useToast()` hook |
| Modal | `components/Modal.tsx` | Reusable modal dialog |
| NameAutocomplete | `components/NameAutocomplete.tsx` | Guest name input with person suggestions |
| PaymentMethodSelector | `components/collect/PaymentMethodSelector.tsx` | Cash/Wechat/Other tab selector |
| AccountSelector | `components/collect/AccountSelector.tsx` | Payment account picker with limit indicators |
| WechatQrPanel | `components/collect/WechatQrPanel.tsx` | Wechat QR code display |
| RecentRecordsPanel | `components/collect/RecentRecordsPanel.tsx` | Paginated recent records list |
| DuplicateAlert | `components/collect/DuplicateAlert.tsx` | Duplicate name warning modal |
| MultiEntryForm | `components/collect/MultiEntryForm.tsx` | Batch guest entry form |
| ReconciliationPanel | `components/ReconciliationPanel.tsx` | Check/unchecked reconciliation view |
| OperationLogPanel | `components/OperationLogPanel.tsx` | Audit log display |

## References

See `references/project-structure.md` for the full directory tree, Vite config, and TypeScript config.

See `references/design-system.md` for the complete design token system (colors, typography, spacing, shadows, radii), responsive layout specs, and component interaction patterns from `ui-design-spec.md`.

## Checklist Before Commit

- [ ] No `any` types — all API responses typed in `types/index.ts`
- [ ] No hardcoded colors — use design tokens (`bg-primary`, `text-ink`, etc.)
- [ ] Amounts in cents (integer) — display with `/100`, parse with `*100`
- [ ] Responsive: test at `< 1280px` (mobile) and `≥ 1280px` (desktop)
- [ ] Touch targets ≥ 48px for interactive elements
- [ ] New routes added to `main.tsx` inside `ProtectedRoute`
- [ ] New API functions added to `lib/api-client.ts` with proper types
- [ ] New Zustand state added to `store/appStore.ts` interface and implementation
- [ ] Used `PageScaffold` wrapper for new pages
- [ ] Used `Toast` + `useToast()` for user feedback
