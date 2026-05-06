# Crusher ERP — Next.js

Next.js 14 (App Router) port of the Crusher ERP single-file HTML app. Same look, same data, same workflow — now with file-based routing, React components, and TypeScript.

## Features

- **Dashboard** — revenue, outstanding, party-wise summary, 7-day trend chart, live stock bars
- **Generate Slip** — vehicle slip / M-Form tax invoice with CFT calculator (in/ft/cm/m or direct), GST split, party-specific rates, payment status
- **Generate Invoice** — convert any uninvoiced slip into a formal tax invoice (full A4 PDF-ready layout)
- **Ledger** — manual credit/debit entries, party-wise balances, automatic entries on slip/invoice creation, payment-received entries on `paid` status
- **Sales Analytics** — daily / weekly / monthly / yearly revenue and quantity charts
- **Stock Overview** — opening / sold / available, inventory value, comparison chart
- **All Slips & All Invoices** — filterable lists with search, payment-status filter, material filter, date filter, in-row Share panels
- **Materials** — master data, HSN, GST, opening stock, top-up stock entries
- **Parties** — name, phone, GSTIN, address, state, party-specific rates per material
- **CTF Calculator** — volume → CFT, rate × quantity → bill amount, truck load estimator, CFT ↔ MT converter
- **Settings** — business info, JSON export/import, full reset

Data is persisted to your own free **Supabase** Postgres project (auth + database in one). On first sign-in, any pre-existing `localStorage` data (key `crusher_erp_v6`) is automatically migrated into your account so nothing is lost.

## Getting started

### 1. Create a free Supabase project (2 minutes)

1. Go to https://supabase.com → **Start your project** → sign up (free, no credit card).
2. Click **New project**. Pick any name, set a database password, choose the closest region.
3. Wait ~1 minute for provisioning.
4. In the project dashboard, open **SQL Editor → New query**. Paste the contents of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**. This creates the `user_data` table and row-level-security policies.
5. Open **Project Settings → API**. Copy the **Project URL** and the **anon public** key.

### 2. Configure environment variables

```bash
cp .env.local.example .env.local
```

Then edit `.env.local` and paste in your two values:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
```

### 3. (Optional) Disable email confirmation for faster local testing

In Supabase: **Authentication → Providers → Email** → turn off **Confirm email**. This lets new sign-ups log in immediately instead of having to click a confirmation link.

### 4. Run

```bash
npm install
npm run dev
```

Open http://localhost:3000 — you'll be redirected to `/login`. Click **Create an account** to make your first user.

## Build

```bash
npm run build
npm start
```

## Stack

- Next.js 14 (App Router) + TypeScript
- React 18
- Chart.js 4 + react-chartjs-2 (revenue/material/stock charts)
- Supabase (Postgres + Auth, free tier)
- `@supabase/ssr` for cookie-based session handling in middleware + Server Components

## Project structure

```
supabase/
  schema.sql             – run this once in Supabase SQL editor
src/
  middleware.ts          – session refresh + route protection
  app/
    layout.tsx           – root providers (DB + Toast)
    globals.css          – all design tokens & component styles
    (app)/               – authenticated route group (sidebar layout)
      layout.tsx         – server-side auth guard + sidebar
      page.tsx           – dashboard
      slip/page.tsx
      invoice/page.tsx
      ledger/page.tsx
      analytics/page.tsx
      stock/page.tsx
      slips/page.tsx
      invoices/page.tsx
      materials/page.tsx
      parties/page.tsx
      ctf-calculator/page.tsx
      settings/page.tsx
    (auth)/              – public auth route group (no sidebar)
      layout.tsx
      login/page.tsx
      signup/page.tsx
    auth/
      callback/route.ts  – Supabase email-confirm callback
      logout/route.ts    – POST → sign out + redirect
  components/
    Sidebar.tsx          – nav + user pill + logout
    DateFilter.tsx
    PaymentSelector.tsx
    SharePanel.tsx
    Modal.tsx
  lib/
    types.ts             – DB / Slip / Invoice / Party shapes
    helpers.ts           – calcGST, fmt, share-message builders, date helpers
    supabase/
      browser.ts         – browser client
      server.ts          – Server Component client
      middleware.ts      – middleware client + session refresh
  store/
    DBContext.tsx        – DB state + Supabase JSONB persistence (debounced)
    ToastContext.tsx     – toast notifications
```
