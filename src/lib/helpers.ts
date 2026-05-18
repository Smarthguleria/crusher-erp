import type { DBShape, Party, Slip, Invoice, PaymentStatus, PaymentMode } from './types';

export const fmt = (n: number) =>
  Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
export const fmt2 = (n: number) =>
  Number(n || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
export const fmtMT = (n: number) =>
  (Number(n || 0) / 1000).toLocaleString('en-IN', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }) + ' MT';

export const today = () => new Date().toISOString().split('T')[0];

// Local HH:MM in 24-hour format (matches HTML <input type="time"> value format).
export const nowTime = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// Format an ISO datetime string as "DD-MM-YYYY · HH:MM AM/PM" in the user's local time.
// Used by Purchase entries (and anywhere else we need a printed timestamp with AM/PM).
export function fmtDateTime12(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = d.getFullYear();
  let h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  const mins = String(d.getMinutes()).padStart(2, '0');
  return `${dd}-${mm}-${yy} · ${String(h).padStart(2, '0')}:${mins} ${ampm}`;
}

// Extract the HH:MM portion of an ISO datetime in the user's local time for re-editing.
export function extractLocalTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function calcGST(qty: number, rate: number, gstPct: number, partyState: string, gstEnabled = true) {
  const base = parseFloat((qty * rate).toFixed(2));
  // gst_enabled = false → no tax at all; total = subtotal.
  if (!gstEnabled) {
    return { base, gstAmt: 0, final: base, cgst: 0, sgst: 0, igst: 0, isPunjab: partyState === 'Punjab', gstEnabled: false };
  }
  const gstAmt = parseFloat((base * gstPct / 100).toFixed(2));
  const final = parseFloat((base + gstAmt).toFixed(2));
  const isPunjab = partyState === 'Punjab';
  return {
    base, gstAmt, final,
    cgst: isPunjab ? parseFloat((gstAmt / 2).toFixed(2)) : 0,
    sgst: isPunjab ? parseFloat((gstAmt / 2).toFixed(2)) : 0,
    igst: isPunjab ? 0 : gstAmt,
    isPunjab,
    gstEnabled: true,
  };
}

export const partyBalance = (db: DBShape, pid: number) => {
  let b = 0;
  db.ledger.filter(e => e.party_id === pid).forEach(e => {
    b += e.type === 'credit' ? e.amount : -e.amount;
  });
  return b;
};

export const totalBalance = (db: DBShape) => {
  let b = 0;
  db.ledger.forEach(e => {
    b += e.type === 'credit' ? e.amount : -e.amount;
  });
  return b;
};

export const stockSold = (db: DBShape, mid: number) =>
  db.slips.filter(s => s.material_id === mid).reduce((a, s) => a + s.quantity, 0);

export const stockRemaining = (db: DBShape, mid: number) => {
  const m = db.materials.find(x => x.id === mid);
  return Math.max(0, (m ? m.stock_tons : 0) - stockSold(db, mid));
};

// Sales / inventory analytics for a single material. Used by the Materials page
// summary strip and per-row breakdown.
//   purchased_qty / purchased_value — sum from Purchases module entries.
//   sold_qty / sold_value           — sum from Invoices (taxable base, no GST).
//   avg_purchase_rate               — weighted average from purchase entries.
//   current_stock_value             — remaining qty × avg purchase rate.
//   est_profit                      — sold_value − (sold_qty × avg_purchase_rate).
export function materialAnalytics(db: DBShape, mid: number) {
  const purchases = db.purchases.filter(p => p.material_id === mid);
  const purchasedQty = purchases.reduce((a, p) => a + p.quantity, 0);
  const purchasedValue = purchases.reduce((a, p) => a + p.total_amount, 0);
  const avgPurchaseRate = purchasedQty > 0 ? purchasedValue / purchasedQty : 0;

  // Sold qty comes from invoices (post-billing); falls back to slip totals for any
  // sale that hasn't been formally invoiced yet. We dedupe by slip_id because every
  // invoice is linked to a slip and we want each sale counted once.
  const invoicedSlipIds = new Set(db.invoices.map(i => i.slip_id));
  const soldFromInvoices = db.invoices
    .filter(i => i.material_id === mid)
    .reduce((acc, i) => ({ qty: acc.qty + i.quantity, value: acc.value + i.base_amount }), { qty: 0, value: 0 });
  const soldFromUninvoicedSlips = db.slips
    .filter(s => s.material_id === mid && !invoicedSlipIds.has(s.slip_id))
    .reduce((acc, s) => ({ qty: acc.qty + s.quantity, value: acc.value + s.base_amount }), { qty: 0, value: 0 });
  const soldQty = soldFromInvoices.qty + soldFromUninvoicedSlips.qty;
  const soldValue = soldFromInvoices.value + soldFromUninvoicedSlips.value;

  const remaining = stockRemaining(db, mid);
  const currentStockValue = remaining * avgPurchaseRate;
  const costOfGoodsSold = soldQty * avgPurchaseRate;
  const estProfit = soldValue - costOfGoodsSold;

  return {
    purchasedQty, purchasedValue, avgPurchaseRate,
    soldQty, soldValue,
    remaining, currentStockValue,
    costOfGoodsSold, estProfit,
  };
}

export const payLabel = (p: PaymentStatus) =>
  p === 'paid' ? 'Paid' : p === 'pending' ? 'Pending' : 'Debt';

export const payClass = (p: PaymentStatus) =>
  p === 'paid' ? 'ps-paid' : p === 'pending' ? 'ps-pending' : 'ps-debt';

export const payBadge = (p: PaymentStatus) =>
  p === 'paid' ? 'bgr' : p === 'pending' ? 'bpd' : 'bdb';

export const gstTypeLabel = (state: string) =>
  state === 'Punjab' ? 'CGST+SGST (Intra)' : 'IGST (Inter)';

export const gstTypeBadge = (state: string) =>
  state === 'Punjab' ? 'bg' : 'bb';

export const paymentModeLabel = (m: PaymentMode | undefined | null) =>
  m === 'cash' ? 'Cash' : m === 'online' ? 'Online' : '—';

// ───────────────────────── Validators ─────────────────────────
// Indian mobile: 10 digits, starting 6-9.
export const isValidPhone = (p: string) => /^[6-9][0-9]{9}$/.test(p.trim());
// GSTIN: 15 chars — 2 state + 5 alpha + 4 digits + 1 alpha + 1 alphanum + Z + 1 alphanum.
export const isValidGSTIN = (g: string) => /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(g.trim());
export const isPositiveNumber = (s: string) => {
  if (!s.trim()) return false;
  const n = parseFloat(s);
  return !isNaN(n) && isFinite(n) && n > 0;
};

// ───────────────────── Link-checking helpers ─────────────────────
// True if the party has any slips, invoices, or auto-generated ledger entries linked.
// Used to block hard-deletes that would leave dangling references.
export function partyHasLinkedRecords(db: DBShape, partyId: number) {
  const slips = db.slips.filter(s => s.party_id === partyId).length;
  const invoices = db.invoices.filter(i => i.party_id === partyId).length;
  const ledger = db.ledger.filter(l => l.party_id === partyId).length;
  return { slips, invoices, ledger, total: slips + invoices + ledger };
}

export function materialHasLinkedRecords(db: DBShape, materialId: number) {
  const slips = db.slips.filter(s => s.material_id === materialId).length;
  const invoices = db.invoices.filter(i => i.material_id === materialId).length;
  const purchases = db.purchases.filter(p => p.material_id === materialId).length;
  const trips = db.trips.filter(t => t.material_id === materialId).length;
  return { slips, invoices, purchases, trips, total: slips + invoices + purchases + trips };
}

export function vehicleHasLinkedRecords(db: DBShape, vehicleId: number) {
  const trips = db.trips.filter(t => t.vehicle_id === vehicleId).length;
  const fuel = db.fuel_logs.filter(f => f.vehicle_id === vehicleId).length;
  const maint = db.maintenance_logs.filter(m => m.vehicle_id === vehicleId).length;
  const tyres = db.tyre_logs.filter(t => t.vehicle_id === vehicleId).length;
  const expenses = db.expenses.filter(e => e.vehicle_id === vehicleId).length;
  const drivers = db.drivers.filter(d => d.vehicle_id === vehicleId).length;
  return { trips, fuel, maint, tyres, expenses, drivers, total: trips + fuel + maint + tyres + expenses + drivers };
}

export function driverHasLinkedRecords(db: DBShape, driverId: number) {
  const trips = db.trips.filter(t => t.driver_id === driverId).length;
  const fuel = db.fuel_logs.filter(f => f.driver_id === driverId).length;
  const vehicles = db.vehicles.filter(v => v.driver_id === driverId).length;
  return { trips, fuel, vehicles, total: trips + fuel + vehicles };
}

export function supplierHasLinkedRecords(db: DBShape, supplierId: number) {
  const purchases = db.purchases.filter(p => p.supplier_id === supplierId).length;
  return { purchases, total: purchases };
}

// ───────────────────── Expiry status (vehicle docs, driver license) ─────────────────────
// Three-tier window:
//   'expired'  — date is already past (red).
//   'critical' — ≤7 days remaining (urgent red, must renew immediately).
//   'soon'     — 8–30 days remaining (amber warning).
//   'ok'       — >30 days, no badge urgency (green).
//   'unknown'  — no date set / unparseable date.
export type ExpiryStatus = 'expired' | 'critical' | 'soon' | 'ok' | 'unknown';
export function expiryStatus(iso?: string | null, soonDays = 30, criticalDays = 7): ExpiryStatus {
  if (!iso) return 'unknown';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'unknown';
  const now = new Date();
  const diffDays = Math.ceil((d.getTime() - now.getTime()) / 86_400_000);
  if (diffDays < 0) return 'expired';
  if (diffDays <= criticalDays) return 'critical';
  if (diffDays <= soonDays) return 'soon';
  return 'ok';
}
export const expiryBadge = (s: ExpiryStatus) =>
  s === 'expired' ? 'br' : s === 'critical' ? 'br' : s === 'soon' ? 'ba' : s === 'ok' ? 'bg' : 'badge-gray';
export const expiryLabel = (s: ExpiryStatus, iso?: string | null) => {
  if (s === 'unknown') return '—';
  if (!iso) return '—';
  const d = new Date(iso).toLocaleDateString('en-IN');
  return s === 'expired' ? `Expired (${d})`
    : s === 'critical' ? `⚠ Urgent (${d})`
    : s === 'soon' ? `Due soon (${d})`
    : d;
};

// ───────────────────── Vehicle assignment lifecycle ─────────────────────
// Reconcile the assignment-history audit trail against the current Vehicle↔Driver pairing.
// Mutates `db.vehicle_assignments` and `db.counters.assignment`. Idempotent — running
// it twice with no live-state change produces no new rows.
//
//   - When a vehicle now has a driver that isn't reflected by any active history row,
//     open a new row.
//   - When an active history row no longer matches the live pairing (either side
//     reassigned or unassigned), close it (unassigned_at + status=inactive).
//
// Call this from every place that mutates vehicle.driver_id or driver.vehicle_id so
// the audit trail stays consistent.
export function recordAssignmentChange(db: DBShape): void {
  const now = new Date().toISOString();
  const active = db.vehicle_assignments.filter(a => a.status === 'active');

  // Close any active row whose pairing is no longer live.
  active.forEach(a => {
    const v = db.vehicles.find(x => x.vehicle_id === a.vehicle_id);
    if (!v || v.driver_id !== a.driver_id) {
      a.status = 'inactive';
      a.unassigned_at = now;
    }
  });

  // Open a row for every live pairing that doesn't already have an active history row.
  db.vehicles.forEach(v => {
    if (v.driver_id == null) return;
    const hasActive = db.vehicle_assignments.some(
      a => a.status === 'active' && a.vehicle_id === v.vehicle_id && a.driver_id === v.driver_id
    );
    if (hasActive) return;
    db.counters.assignment = (db.counters.assignment || 1);
    db.vehicle_assignments.push({
      assignment_id: db.counters.assignment++,
      vehicle_id: v.vehicle_id,
      driver_id: v.driver_id,
      assigned_at: now,
      status: 'active',
    });
  });
}

// ───────────────────── Fuel / fleet analytics ─────────────────────
// Compute average mileage (KM/L) for a vehicle from its odometer-tagged fuel logs.
// Needs at least two fill-ups with odometer readings; returns null otherwise.
export function vehicleMileage(db: DBShape, vehicleId: number): { kmpl: number; samples: number } | null {
  const logs = db.fuel_logs
    .filter(f => f.vehicle_id === vehicleId && f.odometer != null && f.quantity > 0)
    .sort((a, b) => (a.odometer ?? 0) - (b.odometer ?? 0));
  if (logs.length < 2) return null;
  const totalKm = (logs[logs.length - 1].odometer ?? 0) - (logs[0].odometer ?? 0);
  // Litres consumed BETWEEN the first fill and the last (we don't know what the first
  // fill drove on, only what it filled). Standard practice: sum litres from the second
  // log onward.
  const litres = logs.slice(1).reduce((a, l) => a + l.quantity, 0);
  if (totalKm <= 0 || litres <= 0) return null;
  return { kmpl: totalKm / litres, samples: logs.length };
}

export const getPartyRate = (party: Party | undefined | null, mid: number | string): number | null => {
  if (!party || !party.rates) return null;
  const r = party.rates;
  const v = r[String(mid)] ?? r[mid as any] ?? null;
  return v != null ? parseFloat(String(v)) : null;
};

export function dateRangeFilter<T extends { date: string }>(items: T[], from: string | null, to: string | null): T[] {
  if (!from && !to) return items;
  return items.filter(s => {
    const d = s.date.split('T')[0];
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });
}

export function getQuickRange(q: string): [string | null, string | null] {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  if (q === 'today') { const t = today(); return [t, t]; }
  if (q === 'yesterday') {
    const y2 = new Date(now); y2.setDate(d - 1);
    const s = y2.toISOString().split('T')[0]; return [s, s];
  }
  if (q === 'week') {
    const s = new Date(now); s.setDate(d - 6);
    return [s.toISOString().split('T')[0], today()];
  }
  if (q === '30d') {
    const s = new Date(now); s.setDate(d - 29);
    return [s.toISOString().split('T')[0], today()];
  }
  if (q === 'month') return [`${y}-${String(m + 1).padStart(2, '0')}-01`, today()];
  if (q === 'lastmonth') {
    const lm = new Date(y, m, 0);
    const fs = new Date(y, m - 1, 1);
    return [fs.toISOString().split('T')[0], lm.toISOString().split('T')[0]];
  }
  if (q === 'quarter') {
    const qs = new Date(y, Math.floor(m / 3) * 3, 1);
    return [qs.toISOString().split('T')[0], today()];
  }
  if (q === 'year') return [`${y}-01-01`, today()];
  return [null, null];
}

export function numToWords(n: number): string {
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  function iw(x: number): string {
    if (!x) return '';
    if (x < 20) return a[x] + ' ';
    if (x < 100) return b[Math.floor(x / 10)] + ' ' + (x % 10 ? a[x % 10] + ' ' : '');
    if (x < 1000) return a[Math.floor(x / 100)] + 'Hundred ' + (x % 100 ? iw(x % 100) : '');
    if (x < 100000) return iw(Math.floor(x / 1000)) + 'Thousand ' + (x % 1000 ? iw(x % 1000) : '');
    if (x < 10000000) return iw(Math.floor(x / 100000)) + 'Lakh ' + (x % 100000 ? iw(x % 100000) : '');
    return iw(Math.floor(x / 10000000)) + 'Crore ' + (x % 10000000 ? iw(x % 10000000) : '');
  }
  const w = Math.floor(n);
  const d = Math.round((n - w) * 100);
  let r = (iw(w) || 'Zero').trim();
  if (d > 0) r += ' and ' + iw(d).trim() + ' Paise';
  return r;
}

export function buildWAMsg(obj: any, db: DBShape): string {
  const party = db.parties.find(p => p.party_id === obj.party_id) || { party_name: 'Customer', state: '-', phone: '', gstin: '' } as any;
  const mat = db.materials.find(m => m.id === obj.material_id) || { material_name: 'Material', hsn_code: '-' };
  const isPunjab = obj.party_state === 'Punjab';
  const biz = db.bizInfo;
  const isInv = obj.invoice_id !== undefined;
  const ref = isInv ? `INV-${obj.invoice_id}` : `SLIP-${obj.slip_id}`;
  const ps = obj.payment_status || 'pending';
  return `*${biz.name}*
GSTIN: ${biz.gstin} | Punjab
─────────────────
*TAX INVOICE (M-Form)*
Ref: *${ref}* | ${new Date(obj.date).toLocaleDateString('en-IN')}
─────────────────
*Party:* ${party.party_name}${party.gstin ? ' | GSTIN: ' + party.gstin : ''}
*State:* ${party.state}
*Vehicle:* ${obj.vehicle_number}
─────────────────
*Material:* ${mat.material_name} (HSN: ${mat.hsn_code})
*Qty:* ${obj.quantity} CFT @ ₹${obj.rate}/CFT
─────────────────
*Taxable:* ₹${fmt2(obj.base_amount)}
${isPunjab
  ? `*CGST ${obj.gst_percent / 2}%:* ₹${fmt2(obj.cgst)}
*SGST ${obj.gst_percent / 2}%:* ₹${fmt2(obj.sgst)}`
  : `*IGST ${obj.gst_percent}%:* ₹${fmt2(obj.igst)}`}
─────────────────
*TOTAL: ₹${fmt2(obj.final_amount)}*
*Payment: ${payLabel(ps)}*
─────────────────
_Generated by Crusher ERP_`;
}

export function buildSMSMsg(obj: any, db: DBShape): string {
  const party = db.parties.find(p => p.party_id === obj.party_id) || { party_name: 'Customer' };
  const mat = db.materials.find(m => m.id === obj.material_id) || { material_name: 'Mat' };
  const isInv = obj.invoice_id !== undefined;
  const ref = isInv ? `INV-${obj.invoice_id}` : `SLP-${obj.slip_id}`;
  const ps = obj.payment_status || 'pending';
  return `${db.bizInfo.name}: ${ref} | ${party.party_name} | ${mat.material_name} ${obj.quantity} CFT | Total:Rs.${fmt2(obj.final_amount)} | GST:Rs.${fmt2(obj.gst_amount)} | ${payLabel(ps)}`;
}

export function shareWA(obj: any, db: DBShape, phone: string) {
  const msg = buildWAMsg(obj, db);
  const enc = encodeURIComponent(msg);
  const num = (phone || '').replace(/\D/g, '');
  const url = num ? `https://wa.me/${num.startsWith('91') ? num : '91' + num}?text=${enc}` : `https://wa.me/?text=${enc}`;
  window.open(url, '_blank');
}

export function shareSMS(obj: any, db: DBShape, phone: string) {
  const msg = buildSMSMsg(obj, db);
  const enc = encodeURIComponent(msg);
  const num = (phone || '').replace(/\D/g, '');
  window.open(num ? `sms:${num}?body=${enc}` : `sms:?body=${enc}`, '_blank');
}
