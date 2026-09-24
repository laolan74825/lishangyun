# Project Structure Reference

## Directory Tree

```
web/
├── index.html                  # Vite entry HTML
├── package.json                # pnpm dependencies
├── vite.config.ts              # Vite + React + Tailwind + PWA config, /api proxy → :8001
├── tsconfig.json               # Strict TS, ES2022, react-jsx, noEmit
│
├── src/
│   ├── main.tsx                # React root, BrowserRouter, route definitions, ProtectedRoute
│   │
│   ├── components/             # Reusable UI components
│   │   ├── layout/
│   │   │   └── AppLayout.tsx   # Responsive frame: MobileLayout (< xl) + DesktopLayout (≥ xl)
│   │   ├── collect/            # CollectPage sub-components
│   │   │   ├── AccountSelector.tsx
│   │   │   ├── DuplicateAlert.tsx
│   │   │   ├── MultiEntryForm.tsx
│   │   │   ├── PaymentMethodSelector.tsx
│   │   │   ├── RecentRecordsPanel.tsx
│   │   │   └── WechatQrPanel.tsx
│   │   ├── Modal.tsx
│   │   ├── NameAutocomplete.tsx
│   │   ├── OperationLogPanel.tsx
│   │   ├── PageScaffold.tsx    # Page wrapper: title + description + actions + children
│   │   ├── ReconciliationPanel.tsx
│   │   └── Toast.tsx           # Toast notification + useToast() hook
│   │
│   ├── pages/                  # Route-level page components
│   │   ├── AccountsPage.tsx    # Payment account CRUD
│   │   ├── CollectPage.tsx     # Core: on-site gift collection (single + multi entry)
│   │   ├── DashboardPage.tsx   # Home dashboard with summary cards
│   │   ├── GuestbookDetailPage.tsx  # Guestbook detail with tabs (records/reconcile/stats)
│   │   ├── GuestbookPage.tsx   # GuestbookListPage + GuestbookNewPage (named exports)
│   │   ├── LoginPage.tsx       # Auth login
│   │   ├── PeoplePage.tsx      # Person management CRUD
│   │   ├── RecordFormPage.tsx  # New daily record form
│   │   ├── RecordsListPage.tsx # Daily records list with filters
│   │   ├── SettingsPage.tsx    # App settings
│   │   └── StatsPage.tsx       # Statistics & reports
│   │
│   ├── store/
│   │   └── appStore.ts         # Zustand global store: sync status, current guestbook, records, terminal settings, wechat limits, toast
│   │
│   ├── lib/                    # Utility modules
│   │   ├── api.ts              # HTTP client: fetch wrapper with JWT auth, 401 redirect, ApiError class
│   │   ├── api-client.ts       # All API functions organized by domain (guestbooks, records, persons, accounts, stats, etc.)
│   │   ├── auth.ts             # JWT token + user info in localStorage (gr.access_token, gr.current_user)
│   │   └── client.ts           # Client ID (gr.client_id) + UUID generator + nowIso()
│   │
│   ├── styles/
│   │   └── index.css           # Tailwind @import + @theme design tokens + custom text utilities
│   │
│   └── types/
│       └── index.ts            # Domain types: Person, PaymentAccount, Guestbook, GbRecord, DailyRecord, OperationLog, TerminalSettings + limitLevel()
```

## Key Entry Points

| File | Purpose |
|------|---------|
| `main.tsx` | Route definitions, ProtectedRoute auth gate, app bootstrap |
| `components/layout/AppLayout.tsx` | Responsive layout switch: mobile bottom tabs vs desktop sidebar |
| `lib/api.ts` | Base HTTP client (fetch wrapper with JWT, error handling) |
| `lib/api-client.ts` | All domain API functions (one file, organized by section comments) |
| `store/appStore.ts` | Zustand global state (session, terminal settings, wechat limits) |
| `types/index.ts` | All TypeScript interfaces and type aliases |
| `styles/index.css` | Design tokens via Tailwind @theme directive |

## Vite Config

- Proxy: `/api` → `http://localhost:8001` (backend)
- PWA: autoUpdate, theme_color `#E07B3A`, background `#F5F5F0`, display standalone
- Plugins: `@vitejs/plugin-react`, `@tailwindcss/vite`, `vite-plugin-pwa`

## TypeScript Config

- Target: ES2022, Module: ESNext (bundler resolution)
- Strict mode enabled, `noUnusedLocals`, `noUnusedParameters`, `isolatedModules`
- `verbatimModuleSyntax` — use `import type` for type-only imports
- No emit (Vite handles bundling)

## Auth Flow

1. `LoginPage` calls `api.post('/auth/login', ...)` → receives JWT token
2. Token stored in `localStorage` as `gr.access_token`
3. User info stored as `gr.current_user` (JSON: `{ id, username, role }`)
4. `ProtectedRoute` checks `isAuthenticated()` (token exists) before rendering
5. `api.ts` attaches `Authorization: Bearer <token>` to every request
6. 401 response → `clearToken()` + redirect to `/login`

## localStorage Keys

| Key | Content |
|-----|---------|
| `gr.access_token` | JWT token string |
| `gr.current_user` | JSON `{ id, username, role, email? }` |
| `gr.client_id` | Stable UUID for this terminal/client |
| `gr_operator_name` | Operator name preference |
