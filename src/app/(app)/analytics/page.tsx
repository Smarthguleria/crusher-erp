'use client';

import { useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from 'chart.js';
import { useDB } from '@/store/DBContext';
import { fmt, stockSold } from '@/lib/helpers';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

type Period = 'day' | 'week' | 'month' | 'year';

export default function AnalyticsPage() {
  const { db } = useDB();
  const [period, setPeriod] = useState<Period>('month');

  const totalAll = db.slips.reduce((a, s) => a + s.final_amount, 0);
  const totalQty = db.slips.reduce((a, s) => a + s.quantity, 0);
  const avgSlip = db.slips.length ? totalAll / db.slips.length : 0;

  const getSalesData = (p: Period) => {
    const now = new Date(); const labels: string[] = []; const totals: number[] = [];
    const byMat: Record<number, number[]> = {};
    db.materials.forEach(m => { byMat[m.id] = []; });
    if (p === 'day') {
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now); d.setDate(d.getDate() - i);
        const ds = d.toISOString().split('T')[0];
        labels.push(d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' }));
        const ds2 = db.slips.filter(s => s.date.startsWith(ds));
        totals.push(ds2.reduce((a, s) => a + s.final_amount, 0));
        db.materials.forEach(m => byMat[m.id].push(ds2.filter(s => s.material_id === m.id).reduce((a, s) => a + s.quantity, 0)));
      }
    } else if (p === 'week') {
      for (let i = 7; i >= 0; i--) {
        const wE = new Date(now); wE.setDate(wE.getDate() - i * 7);
        const wS = new Date(wE); wS.setDate(wS.getDate() - 6);
        labels.push('Wk ' + (8 - i));
        const ws = db.slips.filter(s => { const d = new Date(s.date); return d >= wS && d <= wE; });
        totals.push(ws.reduce((a, s) => a + s.final_amount, 0));
        db.materials.forEach(m => byMat[m.id].push(ws.filter(s => s.material_id === m.id).reduce((a, s) => a + s.quantity, 0)));
      }
    } else if (p === 'month') {
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        labels.push(d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }));
        const ms = db.slips.filter(s => { const sd = new Date(s.date); return sd.getFullYear() === d.getFullYear() && sd.getMonth() === d.getMonth(); });
        totals.push(ms.reduce((a, s) => a + s.final_amount, 0));
        db.materials.forEach(m => byMat[m.id].push(ms.filter(s => s.material_id === m.id).reduce((a, s) => a + s.quantity, 0)));
      }
    } else {
      for (let i = 2; i >= 0; i--) {
        const yr = now.getFullYear() - i;
        labels.push(String(yr));
        const ys = db.slips.filter(s => new Date(s.date).getFullYear() === yr);
        totals.push(ys.reduce((a, s) => a + s.final_amount, 0));
        db.materials.forEach(m => byMat[m.id].push(ys.filter(s => s.material_id === m.id).reduce((a, s) => a + s.quantity, 0)));
      }
    }
    return { labels, totals, byMat };
  };

  const { labels, totals, byMat } = getSalesData(period);
  const colors = ['#2E8C5A', '#1B4F8A', '#C47A15', '#C0392B', '#6C3483', '#0E7490'];

  return (
    <>
      <div className="ph">
        <div>
          <div className="pt">Sales Analytics</div>
          <div className="ps">Revenue &amp; quantity breakdown across all periods</div>
        </div>
      </div>

      <div className="g4" style={{ marginBottom: 14 }}>
        <div className="stat stat-accent"><div className="slbl">Total Revenue (All Time)</div><div className="sval-sm" style={{ color: 'var(--accent)' }}>₹{fmt(totalAll)}</div></div>
        <div className="stat stat-blue"><div className="slbl">Total Quantity Sold</div><div className="sval-sm">{(totalQty / 1000).toFixed(4)} MT</div><div className="sval-sub">{totalQty.toFixed(0)} CFT</div></div>
        <div className="stat"><div className="slbl">Total Slips Generated</div><div className="sval-sm">{db.slips.length}</div></div>
        <div className="stat stat-green"><div className="slbl">Average per Slip</div><div className="sval-sm tx-cr">₹{fmt(avgSlip)}</div></div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
          <div className="section-hdr" style={{ margin: 0, border: 0, padding: 0 }}>Revenue Trend</div>
          <div className="seg-tabs">
            {(['day', 'week', 'month', 'year'] as Period[]).map(p => (
              <button key={p} className={`seg-tab ${period === p ? 'on' : ''}`} onClick={() => setPeriod(p)}>
                {p === 'day' ? 'Daily' : p === 'week' ? 'Weekly' : p === 'month' ? 'Monthly' : 'Yearly'}
              </button>
            ))}
          </div>
        </div>
        <div style={{ position: 'relative', height: 230 }}>
          <Bar
            data={{ labels, datasets: [{ label: 'Revenue (₹)', data: totals, backgroundColor: '#2E8C5A', borderRadius: 5 }] }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => '₹' + fmt(c.raw as number) } } },
              scales: {
                y: { ticks: { callback: v => '₹' + fmt(v as number), font: { size: 10 } }, grid: { color: 'rgba(0,0,0,0.04)' } },
                x: { ticks: { font: { size: 10 }, maxRotation: 0 }, grid: { display: false } },
              },
            }}
          />
        </div>
      </div>

      <div className="g2">
        <div className="card">
          <div className="section-hdr">Quantity by Material</div>
          <div style={{ position: 'relative', height: 230 }}>
            <Bar
              data={{
                labels,
                datasets: db.materials.map((m, i) => ({
                  label: m.material_name,
                  data: byMat[m.id],
                  backgroundColor: colors[i % colors.length],
                  borderRadius: 3,
                })),
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: true, position: 'bottom', labels: { font: { size: 10 }, usePointStyle: true } } },
                scales: { x: { stacked: true, ticks: { font: { size: 10 }, maxRotation: 0 } }, y: { stacked: true, ticks: { font: { size: 10 } } } },
              }}
            />
          </div>
        </div>
        <div className="card">
          <div className="section-hdr">Material Sales Summary (All Time)</div>
          {db.materials.map(m => {
            const sold = stockSold(db, m.id);
            const rev = db.slips.filter(s => s.material_id === m.id).reduce((a, s) => a + s.final_amount, 0);
            return (
              <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{m.material_name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>{(sold / 1000).toFixed(4)} MT dispatched</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 800, color: 'var(--accent)', fontSize: 14 }}>₹{fmt(rev)}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--text3)' }}>{db.slips.filter(s => s.material_id === m.id).length} slips</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
