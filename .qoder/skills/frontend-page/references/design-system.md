# Design System Reference

Source: `ui-design-spec.md`. All values are implemented as Tailwind CSS custom theme tokens in `styles/index.css`.

> **状态标注**：`[已实现]` = CSS token / 模式已在 `styles/index.css` 或代码中；`[待实现]` = 需求已定义但尚未写入 CSS / 代码。

## Color Tokens

### Primary (主色) [已实现]
| Token | Hex | Tailwind class | Usage |
|-------|-----|----------------|-------|
| primary-deep | `#C45C26` | `bg-primary-deep` | Hover state on primary buttons |
| primary | `#E07B3A` | `bg-primary`, `text-primary` | Main buttons, active tab, links |
| primary-light | `#F5A76E` | `text-primary-light` | Active nav link highlight |

### Success (辅助色) [已实现]
| Token | Hex | Tailwind class | Usage |
|-------|-----|----------------|-------|
| success-deep | `#2D6A4F` | `text-success-deep` | — |
| success | `#40916C` | `text-success`, `bg-success` | Checked/reconciled status |
| success-light | `#74C69D` | `text-success-light` | — |
| success-bg | `#D4F5E0` | `bg-success-bg` | Checked row background |

### Functional (功能色) [已实现]
| Token | Hex | Tailwind class | Usage |
|-------|-----|----------------|-------|
| danger | `#C0392B` | `text-danger`, `bg-danger` | Error, disabled, limit exhausted |
| danger-bg | `#FADBD8` | `bg-danger-bg` | Error background, amount mismatch row |
| warning | `#E67E22` | `text-warning`, `bg-warning` | Limit warning, syncing status |
| warning-bg | `#FEF3E2` | `bg-warning-bg` | Warning background |
| info | `#3498DB` | `text-info` | Links, informational |

### Neutral (中性色) [已实现]
| Token | Hex | Tailwind class | Usage |
|-------|-----|----------------|-------|
| ink | `#1A1A1A` | `text-ink`, `bg-ink` | Primary text, dark backgrounds (top nav, status bar) |
| ink-secondary | `#666666` | `text-ink-secondary` | Secondary text, captions |
| bg | `#F5F5F0` | `bg-bg` | Page background |
| card | `#FFFFFF` | `bg-card` | Card/panel backgrounds |
| line | `#E8E8E3` | `border-line` | Borders, dividers |
| disabled | `#CCCCCC` | `bg-disabled` | Disabled button background |

### Special (特殊色) [已实现]
| Token | Hex | Tailwind class | Usage |
|-------|-----|----------------|-------|
| gold | `#D4AF37` | `text-gold` | VIP emphasis, important totals |
| gold-light | `#FFF8E7` | `bg-gold-light` | Gold background accent |

### Semantic Color Mappings (语义色) [待实现]

> 需求目标：在 `@theme` 中添加语义层 CSS 变量，代码用语义 class 而非原始色 class。
> 当前代码直接使用原始 token（如 `bg-bg`、`text-ink`），功能等价。

| Semantic Token | Maps To | Usage |
|----------------|---------|-------|
| `--color-bg-page` | `#F5F5F0` | Page background |
| `--color-bg-card` | `#FFFFFF` | Card background |
| `--color-bg-sidebar` | `#FFFFFF` | Sidebar background |
| `--color-bg-navbar` | `#1A1A1A` | Top nav bar background |
| `--color-text-primary` | `#1A1A1A` | Primary text |
| `--color-text-secondary` | `#666666` | Secondary text |
| `--color-text-inverse` | `#FFFFFF` | Text on dark backgrounds |
| `--color-border-default` | `#E8E8E3` | Default borders |
| `--color-border-focus` | `#E07B3A` | Focus borders |

## Typography

### Font Stack [已实现]
Defined as `--font-sans` in @theme, applied to `html` in base layer:
```
'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', -apple-system, BlinkMacSystemFont, sans-serif
```

### Size Scale (custom utility classes) [已实现]
| Class | Size | Weight | Line-height | Usage |
|-------|------|--------|-------------|-------|
| `text-amount` | 40px | Bold (700) | 1.1 | Amount display (collect page) |
| `text-page-title` | 24px | Bold (700) | 1.3 | Page titles, guestbook names |
| `text-section-title` | 20px | Semibold (600) | 1.4 | Section headers, card titles |
| (body, default) | 16px | Regular (400) | 1.5 | Record lists, body text |
| `text-caption` | 14px | Regular (400) | 1.5 | Timestamps, secondary info |
| `text-label` | 12px | Medium (500) | 1.4 | Status badges, labels |

> **Note:** `text-amount` also sets `font-variant-numeric: tabular-nums` for aligned digit columns in amount displays.

## Spacing Tokens [已实现]

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

## Border Radius [已实现]

| Token | Value | Tailwind class | Usage |
|-------|-------|----------------|-------|
| radius-btn | 12px | `rounded-btn` | Primary buttons, inputs |
| radius-card | 16px | `rounded-card` | Cards, panels |
| radius-modal | 20px | `rounded-modal` | Modal dialogs |

> **Note:** ui-design-spec §5.1 定义次要按钮圆角为 8px，但当前设计系统统一使用 `rounded-btn`（12px）。后续如需区分可添加 `radius-btn-sm: 8px`。

## Shadows

| Token | Value | Tailwind class | Status | Usage |
|-------|-------|----------------|--------|-------|
| shadow-card | `0 2px 8px rgb(0 0 0 / 0.06)` | `shadow-card` | ✅ | Cards, panels |
| shadow-input-focus | `0 0 0 3px rgb(224 123 58 / 0.2)` | `shadow-input-focus` | 🎯 | Input focus ring |
| shadow-modal | `0 8px 24px rgb(0 0 0 / 0.12)` | `shadow-modal` | ✅ | Modal dialogs |
| shadow-qrcode | `0 4px 12px rgb(0 0 0 / 0.08)` | `shadow-qrcode` | ✅ | QR code container |

## Animation & Duration Tokens [待实现]

> 需求目标：在 `@theme` 中添加动画时长 token。当前代码未使用这些 token，过渡效果用 Tailwind 默认值。

| Token | Value | Tailwind class | Usage |
|-------|-------|----------------|-------|
| duration-fast | 150ms | `duration-fast` | Micro-interactions: hover/active state changes |
| duration-normal | 250ms | `duration-normal` | In-page transitions: tab switch, dropdown expand |
| duration-slow | 300ms | `duration-slow` | Page transitions, larger animations |
| duration-modal | 300ms | `duration-modal` | Modal entry/exit animations |

### Animation Patterns [待实现]
- Tab switch: `transition-all duration-normal` on background/color
- Toast: auto-dismiss (2.5s via `useToast`), positioned at top center (`fixed top-4`), fade-in/out
- QR code swap: `duration-slow` fade between accounts (old fade out 150ms, new fade in 150ms)
- New record insert: fade-in from top + slight slide down (WebSocket push)
- Modal entry: `@starting-style` + `transition-behavior` for first-render animation; mobile = bottom slide-in, desktop = center scale
- Lock screen: backdrop blur + content fade-in (`duration-modal`)
- Page transitions: `transition-all duration-slow` on route change containers
- Submit button click: scale to 0.96, release bounce back

## Modern CSS Features [待实现]

> 需求目标：利用 Tailwind CSS 4 / 现代浏览器特性增强交互反馈。当前代码未使用这些特性。

| Feature | Usage | Implementation |
|---------|-------|----------------|
| Container queries (`@container`) | Card/component internal responsive | Component adapts to container width, not viewport. Use `@container` on parent, `@md:` / `@lg:` on children |
| `:has()` selector | Form validation, parent state | Parent adapts to child state: `has-[input:invalid]:border-danger`, `has-[input:focus]:ring-primary` |
| CSS Layers (`@layer`) | Style priority management | Tailwind 4 built-in layers: `@layer theme, base, components, utilities` |
| `color-mix()` | Hover/disabled state colors | `color-mix(in srgb, var(--color-primary), black 15%)` for derived colors |
| `@starting-style` | Entry animation start state | Combined with `transition-behavior` for element first-render animations |

### Container Query Example
```html
<div class="@container">
  <div class="grid grid-cols-1 @md:grid-cols-2 @lg:grid-cols-3 gap-4">
    <!-- Items auto-adjust columns based on container width -->
  </div>
</div>
```

### :has() Selector Example
```html
<form class="has-[input:invalid]:border-danger">
  <input type="number" required />
</form>
```

## Responsive Layout

### Breakpoints

> ui-design-spec 定义 6 个断点区间。当前代码主要使用 `< 1280px` / `≥ 1280px` 二档切换。

| Range | Device | Layout | Tailwind | Status |
|-------|--------|--------|----------|--------|
| `< 640px` | Phone portrait | Single column, bottom fixed bar 64px | default | ✅ |
| `640–1023px` | Tablet portrait | Single column, 1.1x scaling | `sm:` | 🎯 |
| `1024–1279px` | Tablet landscape | Left-right split | `md:` | 🎯 |
| `1280–1439px` | Small desktop | Top nav + sidebar 260px + main | `lg:` | ✅ (合并到 xl) |
| `1440–1919px` | Standard desktop | Top nav + sidebar 280px + main, high density | `xl:` | ✅ |
| `≥ 1920px` | Large/ultrawide | Sidebar 320px + main max 1600px centered | `2xl:` | 🎯 |

### Mobile Layout (`< 1280px`, `xl:hidden`) [已实现]
- Top bar: 56px, white bg, border-bottom, back arrow + page title + sync badge + settings gear
- Content: `px-4 pb-24 pt-4` (bottom padding for tab bar)
- Bottom tab bar: fixed, 64px height, 6 tabs (首页/明细/礼簿/人员/统计/设置)
- Active tab: `text-primary` + filled icon; inactive: `text-ink-secondary` + outline icon
- Notification bell: in top bar right side (when applicable) [待实现]
- Safe area: `pb-[env(safe-area-inset-bottom)]`

### Desktop Layout — Normal User (`≥ 1280px`, `hidden xl:block`) [待实现]

> 当前 DesktopLayout 内联在 AppLayout.tsx 中，基本结构已有，但通知铃铛、用户菜单下拉等细节待完善。

- Top nav: 64px, `bg-ink` (dark), white text. Contents: Logo + nav links (礼簿管理/日常记账/人员管理/统计报表/家庭管理/授权码) + notification bell + user avatar/menu
- Sidebar: 280px, `bg-card`, right border `border-line`. Contents: quick actions (记一笔/新建礼簿/加入协作) + recent visits + personal settings link
- Main content: `p-8`, `min-w-0 flex-1`, max-width 1600px centered
- Bottom status bar: 32px, `bg-ink`, version + sync status + keyboard shortcut hints
- Nav items conditional: 「家庭管理」always visible; 「授权码」always visible; 「管理后台」only for `super_admin`/`admin`

### Desktop Layout — Admin (`super_admin` / `admin`) [待实现]
- Top nav switches to admin navigation: Logo + 返回前台 + 管理后台 + 用户管理 + 审计日志 + 系统配置 + 公告管理 + 回收站 + notification bell + admin avatar
- Admin sidebar: 管理后台 sub-navigation (仪表盘/用户管理/审计日志/系统配置/公告管理/回收站) + quick actions
- Same sidebar width (280px) and main content rules as normal user layout

### Collect Page Responsive
- Mobile: single column form, bottom fixed submit bar [已实现]
- Desktop (`xl:grid-cols-[1fr_380px]`): left form + right panel (QR code + recent records table + account stats + collaboration status) [待实现]
- Desktop QR code: 200×200px (enlarged for distance scanning) [待实现]
- Desktop records: table format (姓名/金额/方式/收银人/时间) with pagination [待实现]

### Tablet Landscape Split [待实现]
- Left: entry form (400px); Right: record list / guest viewing
- Used for proxy gift recording and guest self-check

## Component Interaction Patterns

### Buttons [已实现]
- **Primary**: `bg-primary text-white rounded-btn h-14` — hover: `bg-primary-deep`, disabled: `bg-disabled`
- **Secondary**: `border border-primary text-primary rounded-btn` — hover: `border-primary-deep text-primary-deep`
- **Ghost**: `text-ink-secondary hover:text-primary` — minimal visual weight
- **Tab**: `rounded-btn py-2.5` — active: `bg-white text-primary shadow-sm`, inactive: `text-ink-secondary`
- **Danger**: `bg-danger text-white rounded-btn` — for destructive actions (delete, revoke)
- **Desktop submit**: `h-14` (56px) for collect page, full-width
- Min touch target: 48px height for mobile

### Inputs [已实现]
- Height: `h-12` (48px) for main inputs, `h-11` for modal inputs, `h-9` for compact
- Border: `border border-line rounded-btn px-4`
- Focus: `focus:border-2 focus:border-primary` (or `outline-none focus:border-primary`)
- Amount input: `text-amount` class (40px bold, tabular-nums)
- Placeholder: muted text via browser default

### Cards [已实现]
- `rounded-card bg-card p-5 shadow-card`
- Section dividers within cards: use `gap-4` between child elements
- Dashboard summary cards: `rounded-card bg-card p-6 shadow-card` with large amount (`text-amount`) + label (`text-caption text-ink-secondary`)

### Modals [已实现]
- Backdrop: `fixed inset-0 z-50 bg-black/50 p-4`
- Content: `rounded-modal bg-card p-6 shadow-modal max-w-[24rem]` (mobile) / `max-w-lg` (desktop)
- Button row: `flex gap-3` with cancel (border) + confirm (primary)
- Entry animation: `duration-modal` fade + slight scale [待实现]

### Status Labels & Badges

| Label | Style | Status |
|-------|-------|--------|
| Reconciled (已对账) | `text-success` with ✓ icon | ✅ |
| Pending/Unchecked | `text-warning` | ✅ |
| Error/Disabled | `text-danger` | ✅ |
| Disputed (待核实) | `text-warning` with ⚠️ icon | 🎯 |
| Guestbook: 收礼中 | `bg-success text-white` | 🎯 (三态待实现) |
| Guestbook: 收尾中 | `bg-warning text-white` | 🎯 |
| Guestbook: 已归档 | `bg-disabled text-ink-secondary` | 🎯 |
| Sync: 已同步 | `text-success` | 🎯 |
| Sync: 同步中 | `text-warning` | 🎯 |
| Sync: 离线 | `text-danger` | 🎯 |
| Notification count badge | `bg-danger text-white text-label rounded-full min-w-[20px] h-5` absolute | 🎯 |

### Wechat Limit Indicators [已实现]
- Normal: no special styling
- Warning (< ¥2000 remaining): `⚠️` emoji suffix in `<option>` text
- Exhausted (≤ ¥200): `— 已限额` text suffix, `<option disabled>` (account unselectable)

### Data Tables (Desktop) [待实现]
- Header: `bg-bg text-ink-secondary text-caption font-medium`
- Row: `border-b border-line hover:bg-bg` on hover
- Selected row: `bg-primary/5` with checkbox column
- Amount mismatch row: `bg-danger-bg` (light red background)
- Checked row: `bg-success-bg` (light green background)
- Pagination: `flex items-center justify-between` with page numbers + prev/next

### Guestbook Cards (3-State Lifecycle) [待实现]
- Active (收礼中): green status badge, prominent "进入收礼" action button
- Closing (收尾中): orange status badge, "查看" + "归档" actions
- Archived (已归档): gray status badge, read-only "查看" action, lock icon

### Lock Screen Overlay [待实现]
- Full viewport: `fixed inset-0 z-[100]`
- Background: `backdrop-blur-xl bg-ink/80` (blurs current page content)
- Content centered: lock icon + masked username (`张*明`) + password input + unlock button
- "忘记密码？" link → security email verification flow

### Notification Bell [待实现]
- Position: top nav right side, before user avatar
- Unread badge: red circle with count, `absolute -top-1 -right-1`
- Dropdown: `absolute right-0 top-full mt-2 w-80 rounded-card bg-card shadow-modal`
- Notification types: approval_approved, approval_rejected, approval_expired, family_member_joined, merge_suggested

### Password Strength Bar (Register Page) [待实现]
- 4 segments with exact colors from ui-design-spec §5.6:
  - 弱: `#C0392B` (danger/red)
  - 中: `#E67E22` (warning/orange)
  - 强: `#2D6A4F` (success-deep/green)
  - 极强: `#1A535C` (deep teal)
- Real-time update as user types
- Container: `flex gap-1 h-1` with each segment `flex-1 rounded-full bg-line` (inactive) or colored (active)
- Bar height: 4px

## Keyboard Shortcuts (Desktop) [待实现]

| Shortcut | Action | Page |
|----------|--------|------|
| `Enter` | Submit form | Collect page |
| `Tab` / `Shift+Tab` | Navigate form fields | Collect page |
| `1` / `2` / `3` | Select cash / wechat / other | Collect page |
| `Ctrl/Cmd + N` | Quick new record | Global |
| `Ctrl/Cmd + F` | Focus search box | Global |
| `Ctrl/Cmd + E` | Export current data | Guestbook detail / stats |
| `↑` / `↓` | Navigate recent records list | Collect page |
| `Space` | Toggle record checkbox | Reconciliation |
| `Ctrl/Cmd + A` | Select all on page | Reconciliation |
| `Esc` | Close modal / go back | Global |

> ui-design-spec 还定义了礼簿详情 Tab 切换快捷键（`1`-`4`）、`/` 聚焦搜索、`Ctrl+Enter` 保存表单等，待实现时参考。

## Gesture Operations (Mobile) — [待实现]
- Swipe left on record row: reveal "待核实" mark button
- Long press on record: enter multi-select mode
- Swipe left on person card in multi-entry: reveal delete button
- Pull-down to refresh

## Special States

### Empty State [已实现]
- Centered icon + text: `flex flex-col items-center justify-center gap-4 py-20 text-ink-secondary`
- Pattern: large emoji/icon + title + description

### Loading State [已实现]
- Inline: `保存中…` text in button, button disabled
- Page level: skeleton or spinner (not yet standardized)
- TanStack Query [待实现]: `isLoading` → skeleton, `isFetching` → subtle spinner overlay

### Error State [已实现]
- Toast notification for transient errors
- Inline error text in `text-danger` below the offending input
- Form-level: `text-danger` summary at top of form [待实现]

### Offline State [待实现]
- SyncStatusBadge shows "离线" in `text-danger`
- Data operations continue (write to IndexedDB), queued for sync
- Banner at top: `bg-warning text-white text-center py-1` "当前离线，数据将在恢复连接后同步"

## Design Principles (from ui-design-spec.md)

1. **大字优先** — Titles 20px+, body 16px+, amounts 32px+ (40px on collect page)
2. **三步完成** — Core collect flow (name → amount → submit) in ≤ 3 steps
3. **防错优先** — No default payment method (force selection), duplicate name alert, confirm dialogs for destructive actions
4. **实时反馈** — Real-time totals, sync status badge, WebSocket push for collaboration, recent records auto-refresh
5. **单手操作** — Bottom fixed action bar, large touch targets ≥ 48px, thumb-friendly layout
