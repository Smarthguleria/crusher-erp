# Crusher ERP — Premium SaaS Redesign

A UI/UX modernization pass that lifts Crusher ERP toward the polish of Zoho Books,
ERPNext, SAP Fiori and QuickBooks — **without touching a single sidebar item, route,
calculation, or workflow.** All business logic (GST split, CFT math, ledger postings,
stock netting) is byte-for-byte unchanged; every change is presentational or a *purely
additive* audit log.

> Constraint compliance: no sidebar items renamed/added/removed, no functionality
> removed, no calculation changed. New code is additive (a `stock_movements` audit
> array + UI components). `npm run build` passes (28/28 routes).

---

## 1. Complete redesigned wireframe (global shell)

```
┌──────────┬──────────────────────────────────────────────────────────────┐
│  SIDEBAR │  TOPBAR (new)                                                  │
│ (un-     │  [🔍 Global search ⌘K]            [＋][🌓][🔔•][ AV ▾ ]        │
│  changed)├──────────────────────────────────────────────────────────────┤
│ 🪨 Crusher│  PAGE HEADER   Title + subtitle              [primary action]  │
│          │  ────────────────────────────────────────────────────────────│
│ Operations│  [ Date filter: Today 7D 30D Month Quarter Year Custom ]      │
│  Dashboard│                                                               │
│  Slip     │  KPI STRIP   ◻ ◻ ◻ ◻   ← modern tiles (icon · value · trend) │
│  Invoice  │  INSIGHTS    ◻ ◻ ◻ ◻   ← AI-style cards                       │
│ Finance   │  CONTENT     charts · cards · sticky/zebra tables             │
│  ...      │                                                               │
│ [biz pill]│                                                               │
└──────────┴──────────────────────────────────────────────────────────────┘
```

The shell became a **content column**: `Sidebar | (Topbar over scrolling Main)`. The
sidebar is byte-identical (`src/components/Sidebar.tsx`); only a sticky topbar was
layered above the scroll area.

**Top navigation bar** — `src/components/Topbar.tsx`:
- **Global search** (⌘K / `/`) — unified index over materials, parties, vehicles, slips
  & invoices; deep-links into the existing pages (read-only navigation aid).
- **Quick actions** (＋) — New Slip / Invoice / Ledger / Material / Purchase / Party.
- **Dark-mode toggle** (🌓).
- **Notifications** (🔔) — derived live: low-stock, receivables, doc-expiry.
- **Profile** — business name, settings link, sign-out.

---

## 2. Dashboard improvements  (`src/app/(app)/page.tsx`)

Added on top of the existing layout (nothing removed):
- **Smart Business Insights** row — week-over-week revenue trend, top-selling material,
  low-stock count, outstanding receivable.
- **Revenue Trend chart** — kept (last 7 days).
- **Material-wise Sales chart** — new horizontal bar, taxable revenue per material.
- **Top Customers widget** — avatar list ranked by period sales, with amount-due chips.
- **Outstanding Recovery** — retained via Paid/Pending/Debt cards + party-wise table.
- **Recent Activity** — retained (Recent Slips with quick-share).

---

## 3. Material Master wireframe  (`src/app/(app)/materials/page.tsx`)

```
Material Master                                            [＋ Add Material]
Inventory, rates & live stock — understand every material at a glance
[ Today | 7D | 30D | Month | Quarter | Year | Custom ]   ← scopes analytics+history
  └ note: current stock / value / health always show LIVE values

KPI STRIP   📥 Purchase Spend   💰 Sales Revenue   📈 Est. Profit   📦 Stock In Hand
INSIGHTS    🏆 top seller   📈 most profitable   ⏳ run-out risk   💰 outstanding

[🔍 Search materials… ]
┌── MATERIAL CARDS (responsive grid) ───────────────────────────────────────┐
│  ┌─────────────────────┐ ┌─────────────────────┐ ┌─────────────────────┐  │
│  │ 20mm        🟡 Low   │ │ 40mm     🟢 Healthy │ │ River Sand 🟢       │  │
│  │ HSN 251710 · GST 5%  │ │ ...                 │ │ ...                 │  │
│  │ Current   Available  │ │                     │ │                     │  │
│  │ 3.080 MT  2,950 CFT  │ │                     │ │                     │  │
│  │ Value     Profit     │ │                     │ │                     │  │
│  │ ₹2,06,960 ₹1,80,240  │ │                     │ │                     │  │
│  │ ▓▓▓▓▓▓░░░ 19%        │ │ ▓▓▓▓▓▓▓▓░ 72%       │ │                     │  │
│  │ 19% avail [Details→] │ │ ...      [Details→] │ │ ...      [Details→] │  │
│  └─────────────────────┘ └─────────────────────┘ └─────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
┌── 📜 STOCK MOVEMENT HISTORY ──────────────────────  [⬇ Excel] [⬇ PDF] ──┐
│ [🔍 search]  [material ▾]                                                │
│ Date │ Material │ Type │ Previous │ Added │ Current │ Rate │ Updated By  │
│ ...sticky header · zebra rows · paginated...                            │
└──────────────────────────────────────────────  N movements · page 1/3 ──┘
```

### Material detail drawer (right-side, opens on a card)
```
20mm                                                                  [✕]
HSN 251710 · GST 5% · Buy ₹9/CFT · Sell ₹22/CFT
─────────────────────────────────────────────────────────────────────────
PRIMARY KPIs   📦 Current Stock   ✅ Available   💵 Stock Value   📈 Profit
STOCK HEALTH   🟡 Low Stock · 19%   ▓▓▓▓▓▓░░░   Min alert 1,000 CFT
🔄 LATEST UPDATE   Previous 2,080 → Added +1,000 → Current 3,080 CFT
                   19-Jun-2026 · 11:35 AM · by Admin
📊 ANALYTICS (period)   Purchased · Sold · Avg Buy · Profit Margin
🧾 RECENT MOVEMENTS   mini audit table (last 6)
─────────────────────────────────────────────────────────────────────────
[＋ Add Stock]                                            [Edit] [Delete]
```

---

## 4. Material card design

Compact card showing **only primary metrics** (resolves "too many metrics together"):
- Name + HSN/GST line + **stock-health pill** (🟢 Healthy / 🟡 Low Stock / 🔴 Critical).
- 2×2 metric grid: **Current Stock · Available · Stock Value · Est. Profit**.
- **Health bar** (color-coded) + "% available" + **View Details →**.
- Soft shadow, 12px radius, hover lift. CSS: `.mcard`, `.health`, `.hbar` in
  `globals.css`. Full detail moves into the drawer — the 3-second-comprehension goal.

---

## 5. Stock movement history design

Dedicated table (Section 6 spec) with columns **Date · Material · Previous · Added ·
Current · Purchase Rate · Updated By** + a `Type` badge (opening / topup / adjustment):
- **Search** (material / user / note), **material filter**, **pagination** (8/page).
- **Sticky header** (`.tbl-sticky`) + **zebra rows** + hover highlight.
- **Export Excel** (CSV download) and **Export PDF** (print-formatted window) — both
  client-side, no new dependencies.
- A per-material "Recent Movements" mini-table also appears in the drawer.

---

## 6. Inventory audit trail design

Every stock change writes an **append-only** `StockMovement` row capturing the
before/after snapshot:

```
previous_stock  ──(+added_qty @ rate)──▶  current_stock     by Admin · timestamp · note
```

- Written on **Add Stock** (`type:'topup'`) and on material creation with opening
  stock (`type:'opening'`).
- **It is a pure audit log** — `materials[].stock_tons` remains the single source of
  truth; no calculation reads from it, so stock math is unchanged. Deleting a material
  cascades its movements.

---

## 7. Database schema for stock history

This app stores the whole DB as **one JSONB document per user** (`public.user_data`),
so no SQL migration is required — the new array is added to the TypeScript shape and
back-filled by `migrate()` for existing rows.

```ts
// src/lib/types.ts
export interface StockMovement {
  movement_id: number;
  material_id: number;
  date: string;            // ISO datetime
  type: 'topup' | 'opening' | 'adjustment';
  previous_stock: number;  // CFT before
  added_qty: number;       // signed CFT delta
  current_stock: number;   // CFT after
  rate?: number;           // ₹/CFT at the time
  value?: number;          // ₹ value added
  updated_by: string;      // actor label
  note?: string;
}
// DBShape gains:  stock_movements: StockMovement[];  counters.movement: number
```

If you later normalize to relational tables, the equivalent is:

```sql
create table stock_movements (
  movement_id    bigserial primary key,
  user_id        uuid not null references auth.users(id) on delete cascade,
  material_id    bigint not null,
  occurred_at    timestamptz not null default now(),
  type           text not null check (type in ('topup','opening','adjustment')),
  previous_stock numeric not null,
  added_qty      numeric not null,
  current_stock  numeric not null,
  rate           numeric,
  value          numeric,
  updated_by     text not null,
  note           text
);
create index on stock_movements (user_id, material_id, occurred_at desc);
```

---

## 8. Date-filter placement & logic (Section 7)

Placed directly under the page header on both Dashboard and Material Master.
`materialAnalytics(db, mid, from, to)` now takes an optional range that scopes
**purchased qty, sold qty, revenue, profit, stock history, analytics**. It deliberately
keeps **current stock, available, stock value and health live** (cost basis = full
purchase history so profit never zeroes out in an empty window). A hint under the filter
states this explicitly.

---

## 9. Mobile layout (Section 11)

- **Desktop** → 4-column KPI grid (`.g4`), card grid auto-fills.
- **Tablet** (≤900px) → `.g4`/`.g3` collapse to 2 columns.
- **Mobile** (≤600px) → single column; sidebar collapses to a 54px icon rail; topbar
  search goes full-width; the detail drawer becomes full-screen; filters stay sticky at
  the top of the scroll area.

---

## 10. Modern SaaS UI recommendations (applied)

- **Inter** typography (loaded alongside the existing fonts), 8px spacing grid,
  consistent radii (8/12/16px), soft layered shadows.
- **Dark mode** via `html[data-theme="dark"]` token overrides + no-flash boot script
  (`src/store/ThemeContext.tsx`); persisted to `localStorage`, respects OS preference.
- **Palette** mapped to your spec — primary `#166534`-family greens, success/warn/danger
  semantic tokens, `#F8FAFC`-style canvas, white cards, slate text.
- Modern **KPI tiles** with icon chips + trend pills (`.kpi`, `.trend-up/-down`).
- Tables: **sticky headers, zebra striping, hover highlight, status badges, quick
  actions**.

---

## 11. UX improvements with examples

| Problem (before) | Fix (after) |
|---|---|
| Too many metrics crammed per material | Card shows 4 primary metrics; rest in a **drawer** |
| No previous stock / no movement visibility | **Latest Update** strip: `prev → +added → current` |
| No audit trail / history | Append-only **Stock Movement History** with export |
| Financial + inventory metrics mixed | KPIs grouped: **live inventory** vs **period analytics** |
| Hard to compare materials | Uniform **card grid** + color-coded health at a glance |
| No at-a-glance health | 🟢/🟡/🔴 pill + bar (>50 / 20–50 / <20%) + min-stock alert |
| No proactive signals | **Smart insights** (run-out risk, top seller, receivables) |
| No global navigation/search | **Topbar** with ⌘K search, quick actions, notifications |

---

## 12. Component hierarchy & page structure

```
RootLayout (ThemeProvider › ToastProvider › DBProvider)
└── (app)/layout  [shell]
    ├── Sidebar                         ← unchanged
    └── content-col
        ├── Topbar                      ← NEW (search · quick · theme · notif · profile)
        └── main → WorkspaceGate → page

Material Master page
├── PageHeader + DateFilter
├── KPI strip            → KpiTile ×4
├── Insights row         → insight cards ×≤4
├── Search + Card grid   → mcard ×n (health pill · 2×2 metrics · hbar)
├── StockMovementHistory → sticky/zebra table · search · material filter · pager · export
└── MaterialDrawer (on select)
    ├── Primary KPIs (KpiTile ×4)
    ├── Stock Health (hbar + pill + min alert)
    ├── Latest Update (UpdateChip prev→added→current)
    ├── Analytics (MiniStat ×4)
    ├── Recent Movements (mini table)
    └── Footer: Add Stock · Edit · Delete
    + Modals: Edit Material · Add Stock · Confirm Delete   ← logic preserved
```

### Files touched
| File | Change |
|---|---|
| `src/app/globals.css` | Dark tokens, Inter, KPI tiles, topbar, drawer, insights, sticky/zebra tables, material cards, health bars |
| `src/app/layout.tsx` | Inter font, theme boot script, ThemeProvider |
| `src/app/(app)/layout.tsx` | Content column + Topbar |
| `src/components/Topbar.tsx` | **New** top navigation bar |
| `src/store/ThemeContext.tsx` | **New** light/dark provider |
| `src/lib/types.ts` | `StockMovement` + `DBShape.stock_movements` + `counters.movement` |
| `src/store/DBContext.tsx` | Default + migrate back-fill |
| `src/lib/helpers.ts` | Date-scoped `materialAnalytics`, `stockHealth` |
| `src/app/(app)/materials/page.tsx` | Full Material Master redesign |
| `src/app/(app)/page.tsx` | Insights, material-wise sales, top customers |
```
```
