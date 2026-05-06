'use client';

import Link from 'next/link';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from 'chart.js';
import { useDB } from '@/store/DBContext';
import { fmt, fmt2, stockRemaining, stockSold } from '@/lib/helpers';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

export default function StockPage() {
  const { db } = useDB();
  const totalIn = db.materials.reduce((a, m) => a + (m.stock_tons || 0), 0);
  const totalSold = db.slips.reduce((a, s) => a + s.quantity, 0);
  const totalRem = Math.max(0, totalIn - totalSold);
  const totalVal = db.materials.reduce((a, m) => a + (m.stock_value || 0), 0);

  const labels = db.materials.map(m => m.material_name);
  const si = db.materials.map(m => m.stock_tons || 0);
  const sold = db.materials.map(m => stockSold(db, m.id));
  const rem = db.materials.map((m, i) => Math.max(0, (m.stock_tons || 0) - sold[i]));

  return (
    <>
      <div className="ph">
        <div>
          <div className="pt">Stock Overview</div>
          <div className="ps">Real-time inventory across all materials</div>
        </div>
        <Link href="/materials" className="btn btnp">Manage Materials →</Link>
      </div>

      <div className="g4" style={{ marginBottom: 14 }}>
        <div className="stat stat-accent"><div className="slbl">Total Stock In</div><div className="sval-sm">{(totalIn / 1000).toFixed(4)} MT</div><div className="sval-sub">{fmt2(totalIn)} CFT</div></div>
        <div className="stat stat-red"><div className="slbl">Total Dispatched</div><div className="sval-sm tx-dr">{(totalSold / 1000).toFixed(4)} MT</div><div className="sval-sub">{fmt2(totalSold)} CFT</div></div>
        <div className="stat stat-green"><div className="slbl">Total Available</div><div className="sval-sm tx-cr">{(totalRem / 1000).toFixed(4)} MT</div><div className="sval-sub">{fmt2(totalRem)} CFT</div></div>
        <div className="stat stat-blue"><div className="slbl">Total Inventory Value</div><div className="sval-sm" style={{ color: 'var(--blue)' }}>₹{fmt(totalVal)}</div></div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="section-hdr">Material-wise Inventory Summary</div>
        <div className="tbl">
          <table>
            <thead>
              <tr>
                <th>Material</th><th>HSN Code</th><th>Selling Rate</th><th>Opening (MT)</th>
                <th>Dispatched (MT)</th><th>Available (MT)</th><th>Min Alert</th>
                <th>Inventory Value</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {db.materials.map(m => {
                const s = stockSold(db, m.id);
                const r = stockRemaining(db, m.id);
                const tot = m.stock_tons || 0;
                const pct = tot > 0 ? r / tot * 100 : 0;
                const low = (m.min_stock || 0) > 0 && r <= (m.min_stock || 0);
                return (
                  <tr key={m.id} style={low ? { background: '#FFFAFA' } : undefined}>
                    <td style={{ fontWeight: 700 }}>{m.material_name}{low && <span style={{ color: 'var(--red)', fontSize: 10, marginLeft: 4, fontWeight: 700 }}>⚠ Low</span>}</td>
                    <td className="mono" style={{ fontSize: 11 }}>{m.hsn_code}</td>
                    <td style={{ fontWeight: 600 }}>₹{m.rate}/CFT</td>
                    <td style={{ fontWeight: 600 }}>{(tot / 1000).toFixed(4)}<div style={{ fontSize: 10, color: 'var(--text3)' }}>{fmt2(tot)} CFT</div></td>
                    <td className="tx-dr">{(s / 1000).toFixed(4)}<div style={{ fontSize: 10, color: 'var(--text3)' }}>{fmt2(s)} CFT</div></td>
                    <td className="tx-cr" style={{ fontWeight: 700 }}>{(r / 1000).toFixed(4)}<div style={{ fontSize: 10, color: 'var(--text3)' }}>{fmt2(r)} CFT</div></td>
                    <td style={{ fontSize: 11, color: 'var(--text3)' }}>{m.min_stock || 0} CFT</td>
                    <td>₹{fmt(m.stock_value || 0)}</td>
                    <td><span className={`badge ${tot === 0 ? 'ba' : pct < 20 ? 'br' : pct < 50 ? 'ba' : 'bg'}`}>{tot === 0 ? 'Not Set' : pct < 20 ? 'Critical' : pct < 50 ? 'Low' : 'Good'}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="section-hdr">Stock vs Dispatched — Visual Comparison</div>
        <div style={{ position: 'relative', height: db.materials.length * 60 + 80 }}>
          <Bar
            data={{
              labels,
              datasets: [
                { label: 'Opening Stock', data: si, backgroundColor: '#2E8C5A', borderRadius: 4 },
                { label: 'Dispatched', data: sold, backgroundColor: '#C0392B', borderRadius: 4 },
                { label: 'Available', data: rem, backgroundColor: '#1B4F8A', borderRadius: 4 },
              ],
            }}
            options={{
              indexAxis: 'y',
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: true, position: 'bottom', labels: { font: { size: 11 }, usePointStyle: true } } },
              scales: {
                x: { ticks: { font: { size: 10 } }, grid: { color: 'rgba(0,0,0,0.04)' } },
                y: { ticks: { font: { size: 12 } } },
              },
            }}
          />
        </div>
      </div>
    </>
  );
}
