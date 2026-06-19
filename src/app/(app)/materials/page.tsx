'use client';

import { useMemo, useState } from 'react';
import { useDB } from '@/store/DBContext';
import { useToast } from '@/store/ToastContext';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import NumberInput from '@/components/NumberInput';
import DateFilter from '@/components/DateFilter';
import {
  fmt, fmt2, fmtDateTime12, isPositiveNumber, materialAnalytics, materialHasLinkedRecords,
  stockHealth, stockRemaining, stockSold,
} from '@/lib/helpers';
import type { Material } from '@/lib/types';

interface MatForm {
  id?: number;
  material_name: string;
  unit: string;
  rate: string;
  purchase_price: string;
  gst_percent: string;
  hsn_code: string;
  stock_tons: string;
  stock_value: string;
  min_stock: string;
}

const EMPTY_FORM: MatForm = {
  material_name: '', unit: 'CFT', rate: '', purchase_price: '', gst_percent: '5', hsn_code: '251710',
  stock_tons: '', stock_value: '', min_stock: '',
};

const HEALTH_CLASS = { green: 'health-green', amber: 'health-amber', red: 'health-red' } as const;
const HBAR_CLASS = { green: 'hbar-green', amber: 'hbar-amber', red: 'hbar-red' } as const;
const HEALTH_DOT = { green: '🟢', amber: '🟡', red: '🔴' } as const;
const PAGE_SIZE = 8;

export default function MaterialsPage() {
  const { db, setDb } = useDB();
  const toast = useToast();
  const [editForm, setEditForm] = useState<MatForm | null>(null);
  const [stockForm, setStockForm] = useState<{ matId: number; qty: string; rate: string; sv: string; note: string } | null>(null);
  const [confirmDel, setConfirmDel] = useState<{ id: number; name: string } | null>(null);
  const [search, setSearch] = useState('');
  const [drawerId, setDrawerId] = useState<number | null>(null);

  // Date filter — scopes ANALYTICS and STOCK HISTORY only. Live stock figures
  // (current/available/value/health) intentionally bypass it (Section 7).
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);

  // Stock-movement history table controls.
  const [histSearch, setHistSearch] = useState('');
  const [histMat, setHistMat] = useState<'all' | number>('all');
  const [histPage, setHistPage] = useState(1);

  const totalStock = db.materials.reduce((a, m) => a + (m.stock_tons || 0), 0);
  const totalValue = db.materials.reduce((a, m) => a + (m.stock_value || 0), 0);
  const totalSold = db.slips.reduce((a, s) => a + s.quantity, 0);

  // Fleet-level rollup honours the date filter for the spend/revenue/profit KPIs,
  // but stock-in-hand stays live.
  const fleet = db.materials.reduce((acc, m) => {
    const a = materialAnalytics(db, m.id, from, to);
    return {
      purchasedValue: acc.purchasedValue + a.purchasedValue,
      soldValue: acc.soldValue + a.soldValue,
      currentStockValue: acc.currentStockValue + a.currentStockValue,
      estProfit: acc.estProfit + a.estProfit,
      soldQty: acc.soldQty + a.soldQty,
    };
  }, { purchasedValue: 0, soldValue: 0, currentStockValue: 0, estProfit: 0, soldQty: 0 });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return db.materials;
    return db.materials.filter(m =>
      m.material_name.toLowerCase().includes(q) ||
      (m.hsn_code || '').toLowerCase().includes(q) ||
      (m.unit || '').toLowerCase().includes(q)
    );
  }, [db.materials, search]);

  // Smart insights (Section 10) — derived, defensive against empty data.
  const insights = useMemo(() => {
    const out: { tone: '' | 'warn' | 'danger' | 'info'; ico: string; bg: string; color: string; t: string; s: string }[] = [];
    // Top-selling material (by sold qty in period).
    const ranked = db.materials
      .map(m => ({ m, a: materialAnalytics(db, m.id, from, to) }))
      .filter(x => x.a.soldQty > 0)
      .sort((a, b) => b.a.soldQty - a.a.soldValue);
    if (ranked[0]) {
      const top = [...ranked].sort((a, b) => b.a.soldValue - a.a.soldValue)[0];
      out.push({ tone: 'info', ico: '🏆', bg: 'var(--blue-light)', color: 'var(--blue)', t: `${top.m.material_name} is your top-selling material`, s: `₹${fmt(top.a.soldValue)} revenue in this period` });
      const prof = [...ranked].sort((a, b) => b.a.estProfit - a.a.estProfit)[0];
      out.push({ tone: '', ico: '📈', bg: 'var(--green-light)', color: 'var(--green)', t: `${prof.m.material_name} is the most profitable`, s: `₹${fmt(Math.abs(prof.a.estProfit))} estimated profit` });
    }
    // Run-out risk — pick the material closest to depletion that still sells.
    const risk = db.materials
      .map(m => {
        const rem = stockRemaining(db, m.id);
        const a = materialAnalytics(db, m.id, from, to);
        // crude daily burn from period sold qty over the window length (fallback 30d)
        const days = from && to ? Math.max(1, (new Date(to).getTime() - new Date(from).getTime()) / 86400000 + 1) : 30;
        const perDay = a.soldQty / days;
        return { m, rem, daysLeft: perDay > 0 ? rem / perDay : Infinity };
      })
      .filter(x => isFinite(x.daysLeft) && x.daysLeft < 14)
      .sort((a, b) => a.daysLeft - b.daysLeft)[0];
    if (risk) out.push({ tone: 'warn', ico: '⏳', bg: 'var(--amber-light)', color: 'var(--amber)', t: `${risk.m.material_name} stock may run out in ${Math.ceil(risk.daysLeft)} days`, s: `${fmt(risk.rem)} CFT remaining at current sales pace` });
    // Outstanding collection.
    const outstanding = db.slips.filter(s => s.payment_status !== 'paid').reduce((a, s) => a + s.final_amount, 0);
    if (outstanding > 0) out.push({ tone: 'danger', ico: '💰', bg: 'var(--red-light)', color: 'var(--red)', t: `₹${fmt(outstanding)} outstanding to collect`, s: 'Pending + debt across all parties' });
    return out.slice(0, 4);
  }, [db, from, to]);

  // Flattened, filtered, paginated movement history.
  const allMovements = useMemo(() => {
    let rows = [...db.stock_movements].sort((a, b) => (a.date < b.date ? 1 : -1));
    if (histMat !== 'all') rows = rows.filter(r => r.material_id === histMat);
    rows = rows.filter(r => {
      const d = r.date.split('T')[0];
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
    const q = histSearch.trim().toLowerCase();
    if (q) {
      rows = rows.filter(r => {
        const name = db.materials.find(m => m.id === r.material_id)?.material_name.toLowerCase() || '';
        return name.includes(q) || (r.updated_by || '').toLowerCase().includes(q) || (r.note || '').toLowerCase().includes(q);
      });
    }
    return rows;
  }, [db.stock_movements, db.materials, histMat, histSearch, from, to]);

  const histPages = Math.max(1, Math.ceil(allMovements.length / PAGE_SIZE));
  const pageRows = allMovements.slice((histPage - 1) * PAGE_SIZE, histPage * PAGE_SIZE);
  const matName = (id: number) => db.materials.find(m => m.id === id)?.material_name || '—';

  // ─────────────── CRUD (logic unchanged from the original) ───────────────
  const openEdit = (m?: Material) => {
    if (m) {
      setEditForm({
        id: m.id, material_name: m.material_name, unit: m.unit,
        rate: String(m.rate || ''),
        purchase_price: String(m.purchase_price || ''),
        gst_percent: String(m.gst_percent || 5),
        hsn_code: m.hsn_code || '',
        stock_tons: String(m.stock_tons || ''),
        stock_value: String(m.stock_value || ''),
        min_stock: String(m.min_stock || ''),
      });
    } else {
      setEditForm({ ...EMPTY_FORM });
    }
  };

  const saveMat = () => {
    if (!editForm) return;
    if (!editForm.material_name.trim()) { toast('Material name is required', 'error'); return; }
    const isNew = !editForm.id;
    setDb(prev => {
      const next = { ...prev, materials: [...prev.materials], stock_movements: [...prev.stock_movements], counters: { ...prev.counters } };
      const data: Material = {
        id: editForm.id || (Math.max(0, ...next.materials.map(m => m.id)) + 1),
        material_name: editForm.material_name.trim(),
        unit: editForm.unit.trim() || 'CFT',
        rate: parseFloat(editForm.rate) || 0,
        purchase_price: parseFloat(editForm.purchase_price) || 0,
        gst_percent: parseFloat(editForm.gst_percent) || 0,
        hsn_code: editForm.hsn_code.trim() || '251710',
        stock_tons: parseFloat(editForm.stock_tons) || 0,
        stock_value: parseFloat(editForm.stock_value) || 0,
        min_stock: parseFloat(editForm.min_stock) || 0,
      };
      if (editForm.id) {
        const i = next.materials.findIndex(m => m.id === editForm.id);
        if (i >= 0) next.materials[i] = data;
      } else {
        next.materials.push(data);
        // Seed an "opening" audit row so the history starts at the true opening balance.
        if (data.stock_tons > 0) {
          next.counters.movement = next.counters.movement || 1;
          next.stock_movements.push({
            movement_id: next.counters.movement++,
            material_id: data.id,
            date: new Date().toISOString(),
            type: 'opening',
            previous_stock: 0,
            added_qty: data.stock_tons,
            current_stock: data.stock_tons,
            rate: data.purchase_price || undefined,
            value: data.stock_value || undefined,
            updated_by: 'Admin',
            note: 'Opening stock',
          });
        }
      }
      return next;
    });
    toast(editForm.id ? 'Material updated!' : 'Material added!', 'success');
    setEditForm(null);
  };

  const requestDelete = (m: Material) => {
    const links = materialHasLinkedRecords(db, m.id);
    if (links.total > 0) {
      const parts = [];
      if (links.slips) parts.push(`${links.slips} slip${links.slips > 1 ? 's' : ''}`);
      if (links.invoices) parts.push(`${links.invoices} invoice${links.invoices > 1 ? 's' : ''}`);
      if (links.purchases) parts.push(`${links.purchases} purchase${links.purchases > 1 ? 's' : ''}`);
      if (links.trips) parts.push(`${links.trips} trip${links.trips > 1 ? 's' : ''}`);
      toast(`Cannot delete "${m.material_name}" — linked to ${parts.join(', ')}.`, 'error', 6000);
      return;
    }
    setConfirmDel({ id: m.id, name: m.material_name });
  };

  const performDelete = () => {
    if (!confirmDel) return;
    setDb(prev => ({
      ...prev,
      materials: prev.materials.filter(m => m.id !== confirmDel.id),
      stock_movements: prev.stock_movements.filter(mv => mv.material_id !== confirmDel.id),
    }));
    toast('Material deleted', 'warning');
    if (drawerId === confirmDel.id) setDrawerId(null);
    setConfirmDel(null);
  };

  const saveStock = () => {
    if (!stockForm) return;
    if (!isPositiveNumber(stockForm.qty)) { toast('Enter a valid quantity', 'error'); return; }
    const qty = parseFloat(stockForm.qty);
    const rate = parseFloat(stockForm.rate) || 0;
    const sv = parseFloat(stockForm.sv) || (qty * rate);
    setDb(prev => {
      const next = { ...prev, materials: [...prev.materials], stock_movements: [...prev.stock_movements], counters: { ...prev.counters } };
      const m = next.materials.find(x => x.id === stockForm.matId);
      if (m) {
        const previous = m.stock_tons || 0;                 // snapshot BEFORE — unchanged logic
        m.stock_tons = previous + qty;
        m.stock_value = (m.stock_value || 0) + sv;
        if (rate > 0) m.purchase_price = rate;              // average / last purchase price
        // Append the audit row (additive — does not affect any calculation).
        next.counters.movement = next.counters.movement || 1;
        next.stock_movements.push({
          movement_id: next.counters.movement++,
          material_id: m.id,
          date: new Date().toISOString(),
          type: 'topup',
          previous_stock: previous,
          added_qty: qty,
          current_stock: m.stock_tons,
          rate: rate || undefined,
          value: sv || undefined,
          updated_by: 'Admin',
          note: stockForm.note || undefined,
        });
      }
      return next;
    });
    toast('Stock updated!', 'success');
    setStockForm(null);
  };

  // ─────────────── Exports (client-side, no deps) ───────────────
  const exportExcel = () => {
    const head = ['Date', 'Material', 'Type', 'Previous Stock (CFT)', 'Added (CFT)', 'Current Stock (CFT)', 'Purchase Rate', 'Value', 'Updated By', 'Note'];
    const lines = allMovements.map(r => [
      fmtDateTime12(r.date), matName(r.material_id), r.type, r.previous_stock, r.added_qty, r.current_stock,
      r.rate ?? '', r.value ?? '', r.updated_by, (r.note || '').replace(/"/g, '""'),
    ]);
    const csv = [head, ...lines].map(row => row.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `stock-history.csv`; a.click();
    URL.revokeObjectURL(url);
    toast('Exported to Excel (CSV)', 'success');
  };

  const exportPDF = () => {
    const rows = allMovements.map(r => `<tr>
      <td>${fmtDateTime12(r.date)}</td><td>${matName(r.material_id)}</td><td>${r.type}</td>
      <td style="text-align:right">${fmt2(r.previous_stock)}</td>
      <td style="text-align:right;color:#1A6B35">+${fmt2(r.added_qty)}</td>
      <td style="text-align:right;font-weight:700">${fmt2(r.current_stock)}</td>
      <td style="text-align:right">${r.rate ? '₹' + r.rate : '—'}</td>
      <td>${r.updated_by}</td></tr>`).join('');
    const w = window.open('', '_blank');
    if (!w) { toast('Allow pop-ups to export PDF', 'error'); return; }
    w.document.write(`<html><head><title>Stock Movement History</title>
      <style>body{font-family:Arial,sans-serif;padding:24px;color:#111}h1{font-size:18px}
      table{width:100%;border-collapse:collapse;font-size:11px;margin-top:12px}
      th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}th{background:#16422C;color:#fff}</style></head>
      <body><h1>Stock Movement History — ${db.bizInfo.name || 'Crusher ERP'}</h1>
      <table><thead><tr><th>Date</th><th>Material</th><th>Type</th><th>Previous</th><th>Added</th><th>Current</th><th>Rate</th><th>By</th></tr></thead>
      <tbody>${rows}</tbody></table></body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 250);
  };

  const drawerMat = drawerId != null ? db.materials.find(m => m.id === drawerId) : null;

  return (
    <>
      <div className="ph">
        <div>
          <div className="pt">Material Master</div>
          <div className="ps">Inventory, rates &amp; live stock — understand every material at a glance</div>
        </div>
        <button className="btn btnp" onClick={() => openEdit()}>+ Add Material</button>
      </div>

      <div style={{ marginBottom: 14 }}>
        <DateFilter defaultPreset="month" onChange={(f, t) => { setFrom(f); setTo(t); setHistPage(1); }} />
        <div className="field-hint" style={{ marginTop: 4 }}>Date range scopes analytics &amp; stock history. Current stock, value &amp; health always show live values.</div>
      </div>

      {/* ── Fleet KPI strip (Section 4) — modern tiles ── */}
      <div className="g4" style={{ marginBottom: 14 }}>
        <KpiTile ico="📥" bg="var(--blue-light)" color="var(--blue)" label="Purchase Spend"
          value={`₹${fmt(fleet.purchasedValue)}`} sub={`${db.purchases.length} purchases · period`} />
        <KpiTile ico="💰" bg="var(--green-light)" color="var(--green)" label="Sales Revenue"
          value={`₹${fmt(fleet.soldValue)}`} sub={`${(fleet.soldQty / 1000).toFixed(3)} MT sold (taxable)`} />
        <KpiTile ico="📈" bg="var(--amber-light)" color="var(--amber)" label="Estimated Profit"
          value={`₹${fmt(Math.abs(fleet.estProfit))}`} sub={fleet.estProfit >= 0 ? 'sold − cost' : 'loss vs. cost'} />
        <KpiTile ico="📦" bg="var(--accent-light)" color="var(--accent3)" label="Stock In Hand (live)"
          value={`${(totalStock / 1000).toFixed(3)} MT`} sub={`${fmt2(totalStock)} CFT · ₹${fmt(fleet.currentStockValue || totalValue)}`} />
      </div>

      {/* ── Smart insights (Section 10) ── */}
      {insights.length > 0 && (
        <div className="g4" style={{ marginBottom: 16 }}>
          {insights.map((n, i) => (
            <div key={i} className={`insight ${n.tone}`}>
              <div className="insight-ico" style={{ background: n.bg, color: n.color }}>{n.ico}</div>
              <div><div className="insight-t">{n.t}</div><div className="insight-s">{n.s}</div></div>
            </div>
          ))}
        </div>
      )}

      {/* ── Search + material cards (Section 2) ── */}
      <div className="filter-bar" style={{ marginBottom: 12 }}>
        <div className="search-wrap" style={{ flex: 1, minWidth: 220 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search materials by name, HSN, unit…" />
        </div>
        {search && <button className="btn btn-sm" onClick={() => setSearch('')}>Clear</button>}
      </div>

      {filtered.length === 0 ? (
        <div className="card"><div className="empty"><div className="empty-icon">📦</div>No materials match your search</div></div>
      ) : (
        <div className="cards-grid" style={{ marginBottom: 18 }}>
          {filtered.map(m => {
            const rem = stockRemaining(db, m.id);
            const tot = m.stock_tons || 0;
            const h = stockHealth(rem, tot, m.min_stock || 0);
            const ana = materialAnalytics(db, m.id, from, to);
            return (
              <div key={m.id} className="mcard" onClick={() => setDrawerId(m.id)}>
                <div className="mcard-hd">
                  <div>
                    <div className="mcard-name">{m.material_name}</div>
                    <div className="mcard-hsn">HSN {m.hsn_code} · GST {m.gst_percent}%</div>
                  </div>
                  <span className={`health ${HEALTH_CLASS[h.level]}`}>{HEALTH_DOT[h.level]} {h.label}</span>
                </div>
                <div className="mcard-metrics">
                  <div>
                    <div className="mcard-m-lbl">Current Stock</div>
                    <div className="mcard-m-val">{(tot / 1000).toFixed(3)} <span style={{ fontSize: 11, color: 'var(--text3)' }}>MT</span></div>
                  </div>
                  <div>
                    <div className="mcard-m-lbl">Available</div>
                    <div className="mcard-m-val" style={{ color: 'var(--green)' }}>{fmt2(rem)} <span style={{ fontSize: 11, color: 'var(--text3)' }}>CFT</span></div>
                  </div>
                  <div>
                    <div className="mcard-m-lbl">Stock Value</div>
                    <div className="mcard-m-val" style={{ color: 'var(--blue)' }}>₹{fmt(m.stock_value || 0)}</div>
                  </div>
                  <div>
                    <div className="mcard-m-lbl">Est. Profit</div>
                    <div className="mcard-m-val" style={{ color: ana.estProfit >= 0 ? 'var(--green)' : 'var(--red)' }}>₹{fmt(Math.abs(ana.estProfit))}</div>
                  </div>
                </div>
                <div className={`hbar ${HBAR_CLASS[h.level]}`}><span style={{ width: `${h.pct}%` }} /></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600 }}>{h.pct}% available</span>
                  <button className="btn btn-sm" onClick={e => { e.stopPropagation(); setDrawerId(m.id); }}>View Details →</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Stock movement history (Section 6) ── */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          <div className="section-hdr" style={{ margin: 0, border: 0, padding: 0 }}>📜 Stock Movement History</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className="btn btn-sm" onClick={exportExcel} disabled={allMovements.length === 0}>⬇ Excel</button>
            <button className="btn btn-sm" onClick={exportPDF} disabled={allMovements.length === 0}>⬇ PDF</button>
          </div>
        </div>
        <div className="filter-bar">
          <div className="search-wrap" style={{ flex: 1, minWidth: 200 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
            <input type="text" value={histSearch} onChange={e => { setHistSearch(e.target.value); setHistPage(1); }} placeholder="Search by material, user, note…" />
          </div>
          <select value={histMat} onChange={e => { setHistMat(e.target.value === 'all' ? 'all' : Number(e.target.value)); setHistPage(1); }}>
            <option value="all">All materials</option>
            {db.materials.map(m => <option key={m.id} value={m.id}>{m.material_name}</option>)}
          </select>
        </div>
        {allMovements.length === 0 ? (
          <div className="empty"><div className="empty-icon">📜</div>No stock movements recorded yet. Use <b>+ Add Stock</b> on any material to start the audit trail.</div>
        ) : (
          <>
            <div className="tbl tbl-sticky">
              <table>
                <thead>
                  <tr><th>Date</th><th>Material</th><th>Type</th><th>Previous</th><th>Added</th><th>Current</th><th>Rate</th><th>Updated By</th></tr>
                </thead>
                <tbody>
                  {pageRows.map(r => (
                    <tr key={r.movement_id}>
                      <td style={{ fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap' }}>{fmtDateTime12(r.date)}</td>
                      <td style={{ fontWeight: 700 }}>{matName(r.material_id)}</td>
                      <td><span className={`badge ${r.type === 'opening' ? 'bb' : r.type === 'adjustment' ? 'ba' : 'bg'}`}>{r.type}</span></td>
                      <td className="mono" style={{ fontSize: 11.5 }}>{fmt2(r.previous_stock)}</td>
                      <td className="mono tx-cr" style={{ fontSize: 11.5 }}>{r.added_qty >= 0 ? '+' : ''}{fmt2(r.added_qty)}</td>
                      <td className="mono" style={{ fontSize: 11.5, fontWeight: 800 }}>{fmt2(r.current_stock)}</td>
                      <td className="mono" style={{ fontSize: 11.5 }}>{r.rate ? `₹${r.rate}` : '—'}</td>
                      <td><span className="tag-chip">{r.updated_by}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>{allMovements.length} movement{allMovements.length !== 1 ? 's' : ''} · page {histPage} of {histPages}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-sm" disabled={histPage <= 1} onClick={() => setHistPage(p => Math.max(1, p - 1))}>← Prev</button>
                <button className="btn btn-sm" disabled={histPage >= histPages} onClick={() => setHistPage(p => Math.min(histPages, p + 1))}>Next →</button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ════════════ Detail drawer (Sections 3,4,5,8,9) ════════════ */}
      {drawerMat && (() => {
        const m = drawerMat;
        const rem = stockRemaining(db, m.id);
        const tot = m.stock_tons || 0;
        const sold = stockSold(db, m.id);
        const h = stockHealth(rem, tot, m.min_stock || 0);
        const ana = materialAnalytics(db, m.id, from, to);
        const last = [...db.stock_movements].filter(mv => mv.material_id === m.id).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
        const matHistory = [...db.stock_movements].filter(mv => mv.material_id === m.id).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 6);
        return (
          <>
            <div className="drawer-ov" onClick={() => setDrawerId(null)} />
            <aside className="drawer" role="dialog" aria-label={`${m.material_name} details`}>
              <div className="drawer-hd">
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.3px' }}>{m.material_name}</div>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>
                    HSN {m.hsn_code} · GST {m.gst_percent}% · Buy ₹{m.purchase_price || 0}/CFT · Sell ₹{m.rate || 0}/CFT
                  </div>
                </div>
                <button className="mo-close" onClick={() => setDrawerId(null)} aria-label="Close">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>

              <div className="drawer-body">
                {/* Primary inventory KPIs (Section 4) */}
                <div className="g2" style={{ gap: 10 }}>
                  <KpiTile ico="📦" bg="var(--accent-light)" color="var(--accent3)" label="Current Stock"
                    value={`${(tot / 1000).toFixed(3)} MT`} sub={`${fmt2(tot)} CFT`} />
                  <KpiTile ico="✅" bg="var(--green-light)" color="var(--green)" label="Available"
                    value={`${fmt2(rem)}`} sub={`CFT · ${fmt2(sold)} sold`} />
                  <KpiTile ico="💵" bg="var(--blue-light)" color="var(--blue)" label="Stock Value"
                    value={`₹${fmt(m.stock_value || 0)}`} sub="live valuation" />
                  <KpiTile ico="📈" bg="var(--amber-light)" color={ana.estProfit >= 0 ? 'var(--green)' : 'var(--red)'} label="Est. Profit"
                    value={`₹${fmt(Math.abs(ana.estProfit))}`} sub={ana.estProfit >= 0 ? 'sold − cost' : 'loss'} />
                </div>

                {/* Inventory health (Section 9) */}
                <div className="card" style={{ padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>Stock Health</span>
                    <span className={`health ${HEALTH_CLASS[h.level]}`}>{HEALTH_DOT[h.level]} {h.label} · {h.pct}%</span>
                  </div>
                  <div className={`hbar ${HBAR_CLASS[h.level]}`} style={{ height: 10 }}><span style={{ width: `${h.pct}%` }} /></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: 'var(--text3)' }}>
                    <span>{fmt2(rem)} / {fmt2(tot)} CFT available</span>
                    <span>{(m.min_stock || 0) > 0 ? `Min alert: ${fmt2(m.min_stock)} CFT` : 'No min-stock alert set'}</span>
                  </div>
                  {h.level === 'red' && <div className="alert alert-error" style={{ marginTop: 10, marginBottom: 0 }}>⚠ Low stock — consider restocking soon.</div>}
                </div>

                {/* Latest stock update (Section 5) */}
                <div className="card" style={{ padding: 14, borderLeft: '3px solid var(--accent3)' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>🔄 Latest Stock Update</div>
                  {last ? (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                        <UpdateChip label="Previous" value={`${fmt2(last.previous_stock)} CFT`} />
                        <span style={{ color: 'var(--text3)' }}>→</span>
                        <UpdateChip label="Added" value={`${last.added_qty >= 0 ? '+' : ''}${fmt2(last.added_qty)} CFT`} accent="var(--green)" />
                        <span style={{ color: 'var(--text3)' }}>→</span>
                        <UpdateChip label="Current" value={`${fmt2(last.current_stock)} CFT`} bold />
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                        {fmtDateTime12(last.date)} · by <b style={{ color: 'var(--text2)' }}>{last.updated_by}</b>{last.note ? ` · ${last.note}` : ''}
                      </div>
                    </>
                  ) : <div style={{ fontSize: 12, color: 'var(--text3)' }}>No stock updates yet. Use “+ Add Stock” below.</div>}
                </div>

                {/* Period analytics (Section 8) */}
                <div className="card" style={{ padding: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>📊 Analytics <span style={{ fontWeight: 500, color: 'var(--text3)' }}>(selected period)</span></div>
                  <div className="g2" style={{ gap: 8 }}>
                    <MiniStat label="Purchased" value={`${fmt2(ana.purchasedQty)} CFT`} sub={`₹${fmt(ana.purchasedValue)}`} color="var(--blue)" />
                    <MiniStat label="Sold (Revenue)" value={`${fmt2(ana.soldQty)} CFT`} sub={`₹${fmt(ana.soldValue)}`} color="var(--green)" />
                    <MiniStat label="Avg Buy Rate" value={ana.avgPurchaseRate > 0 ? `₹${ana.avgPurchaseRate.toFixed(2)}` : '—'} sub="per CFT" color="var(--amber)" />
                    <MiniStat label="Profit Margin" value={ana.soldValue > 0 ? `${((ana.estProfit / ana.soldValue) * 100).toFixed(1)}%` : '—'} sub={`₹${fmt(Math.abs(ana.estProfit))}`} color={ana.estProfit >= 0 ? 'var(--green)' : 'var(--red)'} />
                  </div>
                </div>

                {/* Per-material movement history (Section 6, scoped) */}
                <div className="card" style={{ padding: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>🧾 Recent Movements</div>
                  {matHistory.length === 0 ? <div style={{ fontSize: 12, color: 'var(--text3)' }}>No movements logged.</div> : (
                    <div className="tbl">
                      <table>
                        <thead><tr><th>Date</th><th>Prev</th><th>Added</th><th>Current</th><th>By</th></tr></thead>
                        <tbody>
                          {matHistory.map(r => (
                            <tr key={r.movement_id}>
                              <td style={{ fontSize: 10.5, color: 'var(--text3)' }}>{fmtDateTime12(r.date).split(' · ')[0]}</td>
                              <td className="mono" style={{ fontSize: 11 }}>{fmt2(r.previous_stock)}</td>
                              <td className="mono tx-cr" style={{ fontSize: 11 }}>{r.added_qty >= 0 ? '+' : ''}{fmt2(r.added_qty)}</td>
                              <td className="mono" style={{ fontSize: 11, fontWeight: 700 }}>{fmt2(r.current_stock)}</td>
                              <td style={{ fontSize: 10.5, color: 'var(--text3)' }}>{r.updated_by}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              <div className="drawer-foot">
                <button className="btn btng" style={{ flex: 1 }} onClick={() => setStockForm({ matId: m.id, qty: '', rate: String(m.purchase_price || m.rate || ''), sv: '', note: '' })}>+ Add Stock</button>
                <button className="btn" onClick={() => openEdit(m)}>Edit</button>
                <button className="btn" onClick={() => requestDelete(m)} style={{ color: 'var(--red)', borderColor: 'var(--red)' }}>Delete</button>
              </div>
            </aside>
          </>
        );
      })()}

      {/* ════════════ Modals (logic preserved) ════════════ */}
      {editForm && (
        <Modal title={editForm.id ? 'Edit Material' : 'Add Material'} onClose={() => setEditForm(null)}>
          <div className="alert alert-info" style={{ marginBottom: 14 }}>Set rate and initial stock to activate this material for slip generation.</div>
          <div className="g2">
            <div className="fg-row"><label className="flbl">Material Name <span className="req">*</span></label>
              <input value={editForm.material_name} onChange={e => setEditForm({ ...editForm, material_name: e.target.value })} /></div>
            <div className="fg-row"><label className="flbl">Unit</label>
              <input value={editForm.unit} onChange={e => setEditForm({ ...editForm, unit: e.target.value })} /></div>
          </div>
          <div className="g2">
            <div className="fg-row"><label className="flbl">Selling Rate (₹/CFT) <span className="req">*</span></label>
              <NumberInput mode="decimal" value={editForm.rate}
                           onChange={v => {
                             const r = parseFloat(v) || 0;
                             const tons = parseFloat(editForm.stock_tons) || 0;
                             const sv = (tons > 0 && r > 0) ? String(tons * r) : editForm.stock_value;
                             setEditForm({ ...editForm, rate: v, stock_value: sv });
                           }} /></div>
            <div className="fg-row"><label className="flbl">Purchase Price (₹/CFT)</label>
              <NumberInput mode="decimal" value={editForm.purchase_price}
                           onChange={v => setEditForm({ ...editForm, purchase_price: v })} placeholder="Optional buy-side rate" /></div>
          </div>
          <div className="g2">
            <div className="fg-row"><label className="flbl">GST Rate (%)</label>
              <NumberInput mode="decimal" value={editForm.gst_percent}
                           onChange={v => setEditForm({ ...editForm, gst_percent: v })} /></div>
            <div className="fg-row"><label className="flbl">HSN Code</label>
              <input value={editForm.hsn_code} onChange={e => setEditForm({ ...editForm, hsn_code: e.target.value })} /></div>
          </div>
          <div className="divider" />
          <div className="mo-section">📦 Stock Information</div>
          <div className="g2">
            <div className="fg-row"><label className="flbl">Opening Stock (CFT)</label>
              <NumberInput mode="decimal" value={editForm.stock_tons}
                           onChange={v => {
                             const tons = parseFloat(v) || 0;
                             const r = parseFloat(editForm.rate) || 0;
                             const sv = (tons > 0 && r > 0) ? String(tons * r) : editForm.stock_value;
                             setEditForm({ ...editForm, stock_tons: v, stock_value: sv });
                           }} /></div>
            <div className="fg-row"><label className="flbl">Stock Value (₹)</label>
              <NumberInput mode="decimal" value={editForm.stock_value}
                           onChange={v => setEditForm({ ...editForm, stock_value: v })}
                           placeholder="Auto-calculated" /></div>
          </div>
          <div className="fg-row"><label className="flbl">Minimum Stock Alert (CFT)</label>
            <NumberInput mode="decimal" value={editForm.min_stock}
                         onChange={v => setEditForm({ ...editForm, min_stock: v })}
                         placeholder="Alert when stock falls below this level" /></div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn btnp" style={{ flex: 1 }} onClick={saveMat}>{editForm.id ? 'Update Material' : 'Add Material'}</button>
            <button className="btn" onClick={() => setEditForm(null)}>Cancel</button>
          </div>
        </Modal>
      )}

      {stockForm && (() => {
        const mat = db.materials.find(m => m.id === stockForm.matId)!;
        return (
          <Modal title={`Add Stock — ${mat.material_name}`} onClose={() => setStockForm(null)}>
            <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 12, marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12.5 }}>
                <span style={{ color: 'var(--text3)' }}>Current Opening Stock</span>
                <span style={{ fontWeight: 700 }}>{fmt2(mat.stock_tons || 0)} CFT</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12.5 }}>
                <span style={{ color: 'var(--text3)' }}>Total Sold</span>
                <span className="tx-dr">{fmt2(stockSold(db, stockForm.matId))} CFT</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 6 }}>
                <span>Available Now</span>
                <span className="tx-cr">{fmt2(stockRemaining(db, stockForm.matId))} CFT</span>
              </div>
            </div>
            <div className="fg-row"><label className="flbl">Quantity to Add (CFT) <span className="req">*</span></label>
              <NumberInput mode="decimal" value={stockForm.qty}
                           onChange={v => {
                             const q = parseFloat(v) || 0;
                             const r = parseFloat(stockForm.rate) || 0;
                             setStockForm({ ...stockForm, qty: v, sv: q > 0 && r > 0 ? (q * r).toFixed(0) : stockForm.sv });
                           }} placeholder="0.000" /></div>
            <div className="fg-row"><label className="flbl">Purchase Rate (₹/CFT)</label>
              <NumberInput mode="decimal" value={stockForm.rate}
                           onChange={v => {
                             const r = parseFloat(v) || 0;
                             const q = parseFloat(stockForm.qty) || 0;
                             setStockForm({ ...stockForm, rate: v, sv: q > 0 && r > 0 ? (q * r).toFixed(0) : stockForm.sv });
                           }} /></div>
            <div className="fg-row"><label className="flbl">Stock Value Added (₹)</label>
              <NumberInput mode="decimal" value={stockForm.sv}
                           onChange={v => setStockForm({ ...stockForm, sv: v })}
                           placeholder="Auto-calculated from qty × rate" /></div>
            <div className="fg-row"><label className="flbl">Note (Supplier, Purchase Date, etc.)</label>
              <input type="text" value={stockForm.note} onChange={e => setStockForm({ ...stockForm, note: e.target.value })} placeholder="e.g. Purchased from XYZ Quarry" /></div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="btn btng" style={{ flex: 1 }} onClick={saveStock}>Add Stock</button>
              <button className="btn" onClick={() => setStockForm(null)}>Cancel</button>
            </div>
          </Modal>
        );
      })()}

      {confirmDel && (
        <ConfirmDialog
          title="Delete material?"
          message={`Permanently delete "${confirmDel.name}"?\n\nThis material has no linked slips, invoices, purchases, or trips. The action cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={performDelete}
          onCancel={() => setConfirmDel(null)}
        />
      )}
    </>
  );
}

// ─────────────── Small presentational helpers ───────────────
function KpiTile({ ico, bg, color, label, value, sub }: { ico: string; bg: string; color: string; label: string; value: string; sub: string }) {
  return (
    <div className="kpi">
      <div className="kpi-top">
        <div className="kpi-ico" style={{ background: bg, color }}>{ico}</div>
      </div>
      <div className="kpi-lbl">{label}</div>
      <div className="kpi-val" style={{ marginTop: 4 }}>{value}</div>
      <div className="kpi-sub">{sub}</div>
    </div>
  );
}

function MiniStat({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div style={{ background: 'var(--surface2)', borderRadius: 'var(--r)', padding: 10, border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase', color: 'var(--text3)' }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 800, color, marginTop: 2 }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--text3)' }}>{sub}</div>
    </div>
  );
}

function UpdateChip({ label, value, accent, bold }: { label: string; value: string; accent?: string; bold?: boolean }) {
  return (
    <div style={{ flex: 1, textAlign: 'center', background: 'var(--surface2)', borderRadius: 'var(--r)', padding: '8px 6px', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase', color: 'var(--text3)' }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: bold ? 800 : 700, color: accent || 'var(--text)', marginTop: 2, whiteSpace: 'nowrap' }}>{value}</div>
    </div>
  );
}
