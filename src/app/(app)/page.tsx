'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { useDB } from '@/store/DBContext';
import DateFilter from '@/components/DateFilter';
import { dateRangeFilter, expiryStatus, fmt, fmt2, payClass, payLabel, stockRemaining, today, shareWA } from '@/lib/helpers';

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

  // ─── Operations: fleet / inventory / expense aggregates (date-range filtered) ───
  const filteredPurchases = useMemo(() => dateRangeFilter(db.purchases, from, to), [db.purchases, from, to]);
  const filteredExpenses = useMemo(() => dateRangeFilter(db.expenses, from, to), [db.expenses, from, to]);
  const filteredTrips = useMemo(() => dateRangeFilter(db.trips, from, to), [db.trips, from, to]);
  const filteredFuel = useMemo(() => dateRangeFilter(db.fuel_logs, from, to), [db.fuel_logs, from, to]);
  const totalPurchaseSpend = filteredPurchases.reduce((a, p) => a + p.total_amount, 0);
  const totalExpenseSpend = filteredExpenses.reduce((a, e) => a + e.amount, 0);
  const totalFreight = filteredTrips.reduce((a, t) => a + t.freight_amount, 0);
  const totalFuelCost = filteredFuel.reduce((a, f) => a + f.total_amount, 0);
  const fleetProfit = totalFreight - totalFuelCost;

  const todayTrips = db.trips.filter(t => t.date.startsWith(ts)).length;
  const lowStockMats = db.materials.filter(m => (m.min_stock || 0) > 0 && stockRemaining(db, m.id) <= (m.min_stock || 0));

  // Document expiry alerts across the fleet (insurance / fitness / pollution / license).
  // Anything not 'ok' or 'unknown' counts — critical and expired are urgent.
  let docAlerts = 0;
  db.vehicles.forEach(v => {
    [v.insurance_expiry, v.fitness_expiry, v.pollution_expiry].forEach(d => {
      const s = expiryStatus(d);
      if (s === 'expired' || s === 'critical' || s === 'soon') docAlerts++;
    });
  });
  db.drivers.forEach(d => {
    const s = expiryStatus(d.license_expiry);
    if (s === 'expired' || s === 'critical' || s === 'soon') docAlerts++;
  });

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
        <DateFilter onChange={(f, t) => { setFrom(f); setTo(t); }} />
      </div>

      <div className="g4" style={{ marginBottom: 14 }}>
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
        <div className="stat" style={{ borderLeft: '3px solid var(--purple)' }}>
          <div className="slbl">Slips / Invoices</div>
          <div className="sval" style={{ fontSize: 20 }}>{filtered.length}</div>
          <div className="sval-sub">{db.invoices.length} invoiced · {db.parties.length} parties</div>
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

      <div className="g4" style={{ marginBottom: 14 }}>
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
        <div className="stat stat-green">
          <div className="slbl">🚛 Fleet Profit (Freight − Fuel)</div>
          <div className="sval-sm" style={{ color: fleetProfit >= 0 ? 'var(--green)' : 'var(--red)' }}>₹{fmt(Math.abs(fleetProfit))}</div>
          <div className="sval-sub">{filteredTrips.length} trips · {todayTrips} today · ₹{fmt(totalFuelCost)} fuel</div>
        </div>
        <div className="stat stat-amber">
          <div className="slbl">⚠ Alerts</div>
          <div className="sval-sm tx-pd">{docAlerts + lowStockMats.length}</div>
          <div className="sval-sub">{docAlerts} doc expiry · {lowStockMats.length} low stock</div>
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
