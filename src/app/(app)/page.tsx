'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { useDB } from '@/store/DBContext';
import DateFilter from '@/components/DateFilter';
import { dateRangeFilter, fmt, fmt2, payClass, payLabel, stockRemaining, today, shareWA } from '@/lib/helpers';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

export default function DashboardPage() {
  const { db } = useDB();
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(today());

  const filtered = useMemo(() => dateRangeFilter(db.slips, from, to), [db.slips, from, to]);
  const ts = today();
  const tdSlips = db.slips.filter(s => s.date.startsWith(ts));
  const tdRev = tdSlips.reduce((a, s) => a + s.final_amount, 0);
  const totalRev = filtered.reduce((a, s) => a + s.final_amount, 0);
  const paidAmt = filtered.filter(s => s.payment_status === 'paid').reduce((a, s) => a + s.final_amount, 0);
  const pendingAmt = filtered.filter(s => s.payment_status === 'pending').reduce((a, s) => a + s.final_amount, 0);
  const debtAmt = filtered.filter(s => s.payment_status === 'debt').reduce((a, s) => a + s.final_amount, 0);
  const totalSold = filtered.reduce((a, s) => a + s.quantity, 0);
  const paidSlips = filtered.filter(s => s.payment_status === 'paid');
  const pendSlips = filtered.filter(s => s.payment_status === 'pending');
  const debtSlips = filtered.filter(s => s.payment_status === 'debt');

  const partyRows = db.parties.map(p => {
    const pSlips = filtered.filter(s => s.party_id === p.party_id);
    const pPaid = pSlips.filter(s => s.payment_status === 'paid').reduce((a, s) => a + s.final_amount, 0);
    const pPend = pSlips.filter(s => s.payment_status === 'pending').reduce((a, s) => a + s.final_amount, 0);
    const pDebt = pSlips.filter(s => s.payment_status === 'debt').reduce((a, s) => a + s.final_amount, 0);
    const pQty = pSlips.reduce((a, s) => a + s.quantity, 0);
    const pTotal = pSlips.reduce((a, s) => a + s.final_amount, 0);
    return { p, pPaid, pPend, pDebt, pQty, pTotal, outstanding: pPend + pDebt };
  }).filter(x => x.pTotal > 0).sort((a, b) => b.outstanding - a.outstanding);

  const recent = [...filtered].reverse().slice(0, 10);

  // Top customers by total sale in the selected period (distinct from the outstanding-
  // sorted party summary table below).
  const topCustomers = [...partyRows].sort((a, b) => b.pTotal - a.pTotal).slice(0, 5);

  // Material-wise sales (taxable revenue) within the selected period — for the bar chart.
  const matSales = db.materials
    .map(m => ({ name: m.material_name, value: filtered.filter(s => s.material_id === m.id).reduce((a, s) => a + s.final_amount, 0) }))
    .filter(x => x.value > 0)
    .sort((a, b) => b.value - a.value);

  // Smart insights — week-over-week revenue trend, best material, low stock, receivables.
  const sum7 = (offset: number) => {
    let total = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(); d.setDate(d.getDate() - i - offset);
      const ds = d.toISOString().split('T')[0];
      total += db.slips.filter(s => s.date.startsWith(ds)).reduce((a, s) => a + s.final_amount, 0);
    }
    return total;
  };
  const thisWeek = sum7(0);
  const lastWeek = sum7(7);
  const wowPct = lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : (thisWeek > 0 ? 100 : 0);
  const lowStockCount = db.materials.filter(m => (m.min_stock || 0) > 0 && stockRemaining(db, m.id) <= (m.min_stock || 0)).length;
  const bestMat = matSales[0];

  const insights: { tone: string; ico: string; bg: string; color: string; t: string; s: string }[] = [];
  insights.push(wowPct >= 0
    ? { tone: '', ico: '📈', bg: 'var(--green-light)', color: 'var(--green)', t: `Revenue ${wowPct === 0 ? 'is flat' : `up ${wowPct}%`} this week`, s: `₹${fmt(thisWeek)} vs ₹${fmt(lastWeek)} last week` }
    : { tone: 'warn', ico: '📉', bg: 'var(--amber-light)', color: 'var(--amber)', t: `Revenue down ${Math.abs(wowPct)}% this week`, s: `₹${fmt(thisWeek)} vs ₹${fmt(lastWeek)} last week` });
  if (bestMat) insights.push({ tone: 'info', ico: '🏆', bg: 'var(--blue-light)', color: 'var(--blue)', t: `${bestMat.name} is the top seller`, s: `₹${fmt(bestMat.value)} in this period` });
  if (lowStockCount > 0) insights.push({ tone: 'danger', ico: '⚠', bg: 'var(--red-light)', color: 'var(--red)', t: `${lowStockCount} material${lowStockCount > 1 ? 's' : ''} low on stock`, s: 'Check Material Master to restock' });
  insights.push({ tone: 'warn', ico: '💰', bg: 'var(--amber-light)', color: 'var(--amber)', t: `₹${fmt(pendingAmt + debtAmt)} outstanding`, s: 'Pending + debt receivable' });

  // ─── Period-scoped accounting aggregates. Stock-related cards (e.g. Available
  // in the Live Stock Status panel) intentionally bypass the date filter — current
  // stock must always reflect live inventory, not historical-window slices. ───
  const filteredPurchases = useMemo(() => dateRangeFilter(db.purchases, from, to), [db.purchases, from, to]);
  const filteredExpenses = useMemo(() => dateRangeFilter(db.expenses, from, to), [db.expenses, from, to]);
  const totalPurchaseSpend = filteredPurchases.reduce((a, p) => a + p.total_amount, 0);
  const totalExpenseSpend = filteredExpenses.reduce((a, e) => a + e.amount, 0);

  const chartLabels: string[] = [];
  const chartData: number[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const ds = d.toISOString().split('T')[0];
    chartLabels.push(d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' }));
    chartData.push(db.slips.filter(s => s.date.startsWith(ds)).reduce((a, s) => a + s.final_amount, 0));
  }

  const quickWA = (slipId: number | undefined) => {
    if (!slipId) return;
    const s = db.slips.find(x => x.slip_id === slipId);
    if (!s) return;
    const p = db.parties.find(x => x.party_id === s.party_id);
    shareWA(s, db, p?.phone || '');
  };

  return (
    <>
      <div className="ph">
        <div>
          <div className="pt">Dashboard</div>
          <div className="ps">{new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/slip" className="btn btnp">+ New Slip</Link>
          <Link href="/ledger" className="btn btna">+ Transaction</Link>
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        {/* Default to last-7-days for an accounting-focused at-a-glance window.
            Note: only the period-scoped aggregates (revenue, paid/pending/debt,
            purchases, expenses) honour this filter — Live Stock Status below uses
            stockRemaining() which always reflects real-time inventory. */}
        <DateFilter defaultPreset="week" onChange={(f, t) => { setFrom(f); setTo(t); }} />
      </div>

      {/* Smart business insights */}
      <div className="g4" style={{ marginBottom: 14 }}>
        {insights.map((n, i) => (
          <div key={i} className={`insight ${n.tone}`}>
            <div className="insight-ico" style={{ background: n.bg, color: n.color }}>{n.ico}</div>
            <div><div className="insight-t">{n.t}</div><div className="insight-s">{n.s}</div></div>
          </div>
        ))}
      </div>

      {/* Top row — Revenue · Outstanding · Qty Sold (3-col per dashboard spec). */}
      <div className="g3" style={{ marginBottom: 14 }}>
        <div className="stat stat-accent">
          <div className="slbl">Revenue</div>
          <div className="sval" style={{ color: 'var(--accent)', fontSize: 20 }}>₹{fmt(totalRev)}</div>
          <div className="sval-sub">Today: ₹{fmt(tdRev)} · {tdSlips.length} slip{tdSlips.length !== 1 ? 's' : ''}</div>
        </div>
        <div className="stat stat-red">
          <div className="slbl">Outstanding</div>
          <div className="sval" style={{ color: (pendingAmt + debtAmt) > 0 ? 'var(--red)' : 'var(--green)', fontSize: 20 }}>₹{fmt(pendingAmt + debtAmt)}</div>
          <div className="sval-sub">Pending + Debt receivable</div>
        </div>
        <div className="stat stat-blue">
          <div className="slbl">Qty Sold</div>
          <div className="sval" style={{ fontSize: 18 }}>{fmt2(totalSold)} CFT</div>
          <div className="sval-sub" style={{ color: 'var(--accent2)', fontWeight: 700 }}>{(totalSold / 1000).toFixed(4)} MT</div>
        </div>
      </div>

      <div className="g3" style={{ marginBottom: 14 }}>
        <div className="stat stat-green">
          <div className="slbl">🟢 Paid Amount</div>
          <div className="sval-sm tx-cr">₹{fmt(paidAmt)}</div>
          <div className="sval-sub">{paidSlips.length} slips · {(paidSlips.reduce((a, s) => a + s.quantity, 0) / 1000).toFixed(4)} MT</div>
        </div>
        <div className="stat stat-amber">
          <div className="slbl">🟡 Pending Amount</div>
          <div className="sval-sm tx-pd">₹{fmt(pendingAmt)}</div>
          <div className="sval-sub">{pendSlips.length} slips · {(pendSlips.reduce((a, s) => a + s.quantity, 0) / 1000).toFixed(4)} MT</div>
        </div>
        <div className="stat stat-red">
          <div className="slbl">🔴 Debt Amount</div>
          <div className="sval-sm tx-dr">₹{fmt(debtAmt)}</div>
          <div className="sval-sub">{debtSlips.length} slips · {(debtSlips.reduce((a, s) => a + s.quantity, 0) / 1000).toFixed(4)} MT</div>
        </div>
      </div>

      {/* Third row — Purchases · Expenses (2-col, accounting-focused). */}
      <div className="g2" style={{ marginBottom: 14 }}>
        <div className="stat stat-blue">
          <div className="slbl">📥 Purchases (period)</div>
          <div className="sval-sm" style={{ color: 'var(--blue)' }}>₹{fmt(totalPurchaseSpend)}</div>
          <div className="sval-sub">{filteredPurchases.length} entries</div>
        </div>
        <div className="stat stat-red">
          <div className="slbl">💸 Expenses (period)</div>
          <div className="sval-sm tx-dr">₹{fmt(totalExpenseSpend)}</div>
          <div className="sval-sub">{filteredExpenses.length} entries</div>
        </div>
      </div>

      <div className="g2" style={{ marginBottom: 14 }}>
        <div className="card">
          <div className="section-hdr">Revenue — Last 7 Days</div>
          <div style={{ position: 'relative', height: 180 }}>
            <Bar
              data={{ labels: chartLabels, datasets: [{ label: 'Revenue', data: chartData, backgroundColor: '#2E8C5A', borderRadius: 5 }] }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                  y: { ticks: { callback: v => '₹' + fmt(v as number), font: { size: 10 } }, grid: { color: 'rgba(0,0,0,0.04)' } },
                  x: { ticks: { font: { size: 10 }, maxRotation: 0 }, grid: { display: false } },
                },
              }}
            />
          </div>
        </div>
        <div className="card">
          <div className="section-hdr">Live Stock Status</div>
          {db.materials.map(m => {
            const rem = stockRemaining(db, m.id);
            const tot = m.stock_tons || 0;
            const pct = tot > 0 ? Math.min(100, Math.round(rem / tot * 100)) : 0;
            const low = (m.min_stock || 0) > 0 && rem <= (m.min_stock || 0);
            return (
              <div key={m.id} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                  <span style={{ fontWeight: 600 }}>{m.material_name}{low && <span style={{ color: 'var(--red)', fontSize: 10, marginLeft: 4 }}>⚠</span>}</span>
                  <span style={{ color: 'var(--text3)' }}>{fmt2(rem)} / {fmt2(tot)} CFT</span>
                </div>
                <div className="stock-bar-wrap">
                  <div className={`stock-bar ${pct < 20 ? 'low' : pct < 50 ? 'mid' : ''}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Material-wise sales + Top customers */}
      <div className="g2" style={{ marginBottom: 14 }}>
        <div className="card">
          <div className="section-hdr">Material-wise Sales</div>
          {matSales.length === 0 ? (
            <div className="empty"><div className="empty-icon">📊</div>No sales in this period</div>
          ) : (
            <div style={{ position: 'relative', height: Math.max(140, matSales.length * 34) }}>
              <Bar
                data={{ labels: matSales.map(x => x.name), datasets: [{ label: 'Sales', data: matSales.map(x => x.value), backgroundColor: '#1B4F8A', borderRadius: 5 }] }}
                options={{
                  indexAxis: 'y' as const,
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { display: false } },
                  scales: {
                    x: { ticks: { callback: v => '₹' + fmt(v as number), font: { size: 10 } }, grid: { color: 'rgba(0,0,0,0.04)' } },
                    y: { ticks: { font: { size: 11 } }, grid: { display: false } },
                  },
                }}
              />
            </div>
          )}
        </div>
        <div className="card">
          <div className="section-hdr">Top Customers</div>
          {topCustomers.length === 0 ? (
            <div className="empty"><div className="empty-icon">🤝</div>No customers in this period</div>
          ) : topCustomers.map((c, i) => (
            <div key={c.p.party_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: i < topCustomers.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <div className="tb-avatar" style={{ width: 30, height: 30, fontSize: 11 }}>{(c.p.party_name || '?').slice(0, 2).toUpperCase()}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.p.party_name}</div>
                <div style={{ fontSize: 10.5, color: 'var(--text3)' }}>{fmt2(c.pQty)} CFT · {c.p.state}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent)' }}>₹{fmt(c.pTotal)}</div>
                {c.outstanding > 0 && <div style={{ fontSize: 10, color: 'var(--red)', fontWeight: 600 }}>₹{fmt(c.outstanding)} due</div>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {partyRows.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div className="section-hdr" style={{ margin: 0, border: 0, padding: 0 }}>Party-wise Account Summary</div>
            <Link href="/ledger" className="btn btn-sm">Full Ledger →</Link>
          </div>
          <div className="tbl">
            <table>
              <thead>
                <tr>
                  <th>Party</th><th>State</th><th>Total Sale</th><th>Qty (CFT)</th>
                  <th>🟢 Paid</th><th>🟡 Pending</th><th>🔴 Debt</th>
                  <th>Outstanding</th><th>Action</th>
                </tr>
              </thead>
              <tbody>
                {partyRows.map(({ p, pPaid, pPend, pDebt, pQty, pTotal, outstanding }) => (
                  <tr key={p.party_id}>
                    <td style={{ fontWeight: 700 }}>{p.party_name}</td>
                    <td><span className="tag-chip">{p.state}</span></td>
                    <td style={{ fontWeight: 700, color: 'var(--accent)' }}>₹{fmt(pTotal)}</td>
                    <td className="mono" style={{ fontSize: 11.5 }}>{fmt2(pQty)} CFT</td>
                    <td className="tx-cr">₹{fmt(pPaid)}</td>
                    <td className="tx-pd">₹{fmt(pPend)}</td>
                    <td className="tx-dr">₹{fmt(pDebt)}</td>
                    <td style={{ fontWeight: 800, color: outstanding > 0 ? 'var(--red)' : 'var(--green)' }}>₹{fmt(outstanding)} {outstanding > 0 ? '🔺' : '✓'}</td>
                    <td>
                      <button className="btn btn-sm btnwa" onClick={() => quickWA(db.slips.filter(s => s.party_id === p.party_id).slice(-1)[0]?.slip_id)}>WA</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div className="section-hdr" style={{ margin: 0, border: 0, padding: 0 }}>Recent Slips</div>
          <Link href="/slips" className="btn btn-sm">View All →</Link>
        </div>
        {recent.length === 0 ? (
          <div className="empty"><div className="empty-icon">📋</div>No slips in this period</div>
        ) : (
          <div className="tbl">
            <table>
              <thead>
                <tr><th>Slip #</th><th>Date</th><th>Party</th><th>Material</th><th>Qty (CFT)</th><th>Amount</th><th>Payment</th><th>Share</th></tr>
              </thead>
              <tbody>
                {recent.map(s => {
                  const p = db.parties.find(x => x.party_id === s.party_id);
                  const m = db.materials.find(x => x.id === s.material_id);
                  const ps = s.payment_status || 'pending';
                  return (
                    <tr key={s.slip_id}>
                      <td className="mono" style={{ fontSize: 11, fontWeight: 700 }}>#{s.slip_id}</td>
                      <td style={{ fontSize: 11, color: 'var(--text3)' }}>{new Date(s.date).toLocaleDateString('en-IN')}</td>
                      <td style={{ fontWeight: 600 }}>{p?.party_name || '—'}</td>
                      <td><span className="badge bg">{m?.material_name || '—'}</span></td>
                      <td className="mono" style={{ fontSize: 11 }}>{fmt2(s.quantity)} CFT</td>
                      <td style={{ fontWeight: 700 }}>₹{fmt(s.final_amount)}</td>
                      <td><span className={`ps-pill ${payClass(ps)}`}>{payLabel(ps)}</span></td>
                      <td><button className="btn btn-sm btnwa" onClick={() => quickWA(s.slip_id)}>WA</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
