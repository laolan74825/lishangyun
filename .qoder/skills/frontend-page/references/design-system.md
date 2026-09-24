# Design System Reference

Source: `ui-design-spec.md`. All values are implemented as Tailwind CSS custom theme tokens in `styles/index.css`.

## Color Tokens

### Primary (主色)
| Token | Hex | Tailwind class | Usage |
|-------|-----|----------------|-------|
| primary-deep | `#C45C26` | `bg-primary-deep` | Hover state on primary buttons |
| primary | `#E07B3A` | `bg-primary`, `text-primary` | Main buttons, active tab, links |
| primary-light | `#F5A76E` | `text-primary-light` | Active nav link highlight |

### Success (辅助色)
| Token | Hex | Tailwind class | Usage |
|-------|-----|----------------|-------|
| success-deep | `#2D6A4F` | `text-success-deep` | — |
| success | `#40916C` | `text-success`, `bg-success` | Checked/reconciled status |
| success-light | `#74C69D` | `text-success-light` | — |
| success-bg | `#D4F5E0` | `bg-success-bg` | Checked row background |

### Functional (功能色)
| Token | Hex | Tailwind class | Usage |
|-------|-----|----------------|-------|
| danger | `#C0392B` | `text-danger`, `bg-danger` | Error, disabled, limit exhausted |
| danger-bg | `#FADBD8` | `bg-danger-bg` | Error background |
| warning | `#E67E22` | `text-warning`, `bg-warning` | Limit warning, syncing status |
| warning-bg | `#FEF3E2` | `bg-warning-bg` | Warning background |
| info | `#3498DB` | `text-info` | Links, informational |

### Neutral (中性色)
| Token | Hex | Tailwind class | Usage |
|-------|-----|----------------|-------|
| ink | `#1A1A1A` | `text-ink`, `bg-ink` | Primary text, dark backgrounds |
| ink-secondary | `#666666` | `text-ink-secondary` | Secondary text, captions |
| bg | `#F5F5F0` | `bg-bg` | Page background |
| card | `#FFFFFF` | `bg-card` | Card/panel backgrounds |
| line | `#E8E8E3` | `border-line` | Borders, dividers |
| disabled | `#CCCCCC` | `bg-disabled` | Disabled button background |

### Special (特殊色)
| Token | Hex | Tailwind class | Usage |
|-------|-----|----------------|-------|
| gold | `#D4AF37` | `text-gold` | VIP emphasis, important totals |
| gold-light | `#FFF8E7` | `bg-gold-light` | Gold background accent |

## Typography

### Font Stack
Defined as `--font-sans` in @theme, applied to `html` in base layer:
```
'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', -apple-system, BlinkMacSystemFont, sans-serif
```

### Size Scale (custom utility classes)
| Class | Size | Weight | Line-height | Usage |
|-------|------|--------|-------------|-------|
| `text-amount` | 40px | Bold (700) | 1.1 | Amount display (collect page) |
| `text-page-title` | 24px | Bold (700) | 1.3 | Page titles, guestbook names |
| `text-section-title` | 20px | Semibold (600) | 1.4 | Section headers, card titles |
| (body, default) | 16px | Regular (400) | 1.5 | Record lists, body text |
| `text-caption` | 14px | Regular (400) | 1.5 | Timestamps, secondary info |
| `text-label` | 12px | Medium (500) | 1.4 | Status badges, labels |

> **Note:** `text-amount` also sets `font-variant-numeric: tabular-nums` for aligned digit columns in amount displays.

## Spacing Tokens

Custom tokens defined as `--space-*` in @theme (available as Tailwind utilities like `gap-xs`, `p-md`, etc., but **codebase primarily uses Tailwind default spacing scale**).

| Token | Value | Tailwind class | Actual usage |
|-------|-------|----------------|-------|
| space-xs | 4px | `gap-1` / `gap-xs` | Icon-text gap, tight inline |
| space-sm | 8px | `gap-2` / `gap-sm` | Form element internal padding |
| space-md | 16px | `gap-4` / `gap-md` | Card internal padding, element gaps |
| space-lg | 24px | `gap-6` / `gap-lg` | Module gaps, card outer spacing |
| space-xl | 32px | `gap-8` / `gap-xl` | Page margins, large section gaps |
| space-2xl | 48px | `gap-12` / `gap-2xl` | Bottom bar safe area |

> **Note:** Codebase uses Tailwind default spacing classes (`gap-2`, `p-4`, `p-5`, `gap-3` etc.) rather than custom `gap-xs`/`p-md` classes. Both produce correct values; prefer the default scale for consistency with existing code.

## Border Radius

| Token | Value | Tailwind class | Usage |
|-------|-------|----------------|-------|
| radius-btn | 12px | `rounded-btn` | Buttons, inputs |
| radius-card | 16px | `rounded-card` | Cards, panels |
| radius-modal | 20px | `rounded-modal` | Modal dialogs |

## Shadows

| Token | Value | Tailwind class | Usage |
|-------|-------|----------------|-------|
| shadow-card | `0 2px 8px rgb(0 0 0 / 0.06)` | `shadow-card` | Cards, panels |
| shadow-modal | `0 8px 24px rgb(0 0 0 / 0.12)` | `shadow-modal` | Modal dialogs |
| shadow-qrcode | `0 4px 12px rgb(0 0 0 / 0.08)` | `shadow-qrcode` | QR code container |

## Responsive Layout

### Breakpoints
| Range | Device | Layout | Tailwind |
|-------|--------|--------|----------|
| `< 640px` | Phone portrait | Single column, bottom tab bar 64px | default |
| `640–1024px` | Tablet | Single column (portrait) / split (landscape) | `sm:`, `md:` |
| `≥ 1280px` | Desktop | Top nav 64px + sidebar 280px + main content | `xl:` |

### Mobile Layout (`< 1280px`, `xl:hidden`)
- Top bar: 56px, white bg, border-bottom
- Content: `px-4 pb-24 pt-4` (bottom padding for tab bar)
- Bottom tab bar: fixed, 64px height, 6 tabs (首页/明细/礼簿/人员/统计/设置)
- Safe area: `pb-[env(safe-area-inset-bottom)]`

### Desktop Layout (`≥ 1280px`, `hidden xl:block`)
- Top nav: 64px, `bg-ink` (dark), logo + nav links + sync badge + user menu
- Sidebar: 280px, `bg-card`, border-right, quick actions (记一笔/新建礼簿/加入协作)
- Main content: `p-8`, `min-w-0 flex-1`, max-width 1600px centered
- Bottom status bar: 32px, `bg-ink`, version + keyboard shortcut hints

### Collect Page Responsive
- Mobile: single column form
- Desktop (`xl:grid-cols-[1fr_380px]`): left form + right recent records panel

## Component Interaction Patterns

### Buttons
- **Primary**: `bg-primary text-white rounded-btn h-14` — hover: `bg-primary-deep`, disabled: `bg-disabled`
- **Secondary**: `border border-primary text-primary rounded-btn` — hover: `border-primary text-primary`
- **Ghost**: `text-ink-secondary hover:text-primary` — minimal visual weight
- **Tab**: `rounded-btn py-2.5` — active: `bg-white text-primary shadow-sm`, inactive: `text-ink-secondary`
- Min touch target: 48px height for mobile

### Inputs
- Height: `h-12` (48px) for main inputs, `h-11` for modal inputs, `h-9` for compact
- Border: `border border-line rounded-btn px-4`
- Focus: `focus:border-2 focus:border-primary` (or `outline-none focus:border-primary`)
- Placeholder: muted text via browser default

### Cards
- `rounded-card bg-card p-5 shadow-card`
- Section dividers within cards: use `gap-4` between child elements

### Modals
- Backdrop: `fixed inset-0 z-50 bg-black/50 p-4`
- Content: `rounded-card bg-card p-6 shadow-xl max-w-[24rem]`
- Button row: `flex gap-3` with cancel (border) + confirm (primary)

### Status Labels
- Reconciled: `text-success` with ✓ icon (e.g. `✓ 已对账`)
- Pending: `text-warning`
- Error/Disabled: `text-danger`

### Wechat Limit Indicators
- Normal: no special styling
- Warning (< ¥2000 remaining): `⚠️` emoji suffix in `<option>` text
- Exhausted (≤ ¥200): `— 已限额` text suffix, `<option disabled>` (account unselectable)

## Animation & Transition
- Tab switch: `transition-all` on background/color
- Toast: auto-dismiss (2.5s via `useToast`), positioned at top center (`fixed top-4`)
- QR code swap: 300ms fade — **planned, not yet implemented**
- New record insert: fade-in at top of recent records list — **planned, not yet implemented**

## Gesture Operations (Mobile) — **planned, not yet implemented**
- Swipe left on record row: reveal "待核实" mark button
- Long press on record: enter multi-select mode
- Swipe left on person card in multi-entry: reveal delete button
- Pull-down to refresh

## Special States

### Empty State
- Centered icon + text: `flex flex-col items-center justify-center gap-4 py-20 text-ink-secondary`
- Pattern: large emoji/icon + title + description

### Loading State
- Inline: `保存中…` text in button, button disabled
- Page level: skeleton or spinner (not yet standardized)

### Error State
- Toast notification for transient errors
- Inline error text in `text-danger` below the offending input

## Design Principles (from ui-design-spec.md)

1. **大字优先** — Titles 20px+, body 16px+, amounts 32px+ (40px on collect page)
2. **三步完成** — Core collect flow (name → amount → submit) in ≤ 3 steps
3. **防错优先** — No default payment method (force selection), duplicate name alert, confirm dialogs
4. **实时反馈** — Real-time totals, sync status badge, recent records auto-refresh
5. **单手操作** — Bottom fixed action bar, large touch targets ≥ 48px, thumb-friendly layout
