'use client';

import { useMemo, useState } from 'react';
import { useDB } from '@/store/DBContext';
import { useToast } from '@/store/ToastContext';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import NumberInput from '@/components/NumberInput';
import DateFilter from '@/components/DateFilter';
import { dateRangeFilter, extractLocalTime, fmt, fmt2, fmtDateTime12, isPositiveNumber, nowTime, today } from '@/lib/helpers';
import type { Purchase } from '@/lib/types';

interface PurchaseForm {
  purchase_id?: number;
  date: string;   // yyyy-mm-dd (HTML <input type="date">)
  time: string;   // HH:MM 24h (HTML <input type="time">) — displayed as 12h AM/PM
  supplier_id: string;
  supplier_name: string;
  material_id: string;
  vehicle_number: string;
  driver_name: string;
  quantity: string;
  unit: string;
  rate: string;
  total_amount: string;
  royalty_number: string;
  weighbridge_slip: string;
  notes: string;
}

const EMPTY: PurchaseForm = {
  date: today(), time: nowTime(), supplier_id: '', supplier_name: '', material_id: '',
  vehicle_number: '', driver_name: '', quantity: '', unit: 'CFT', rate: '',
  total_amount: '', royalty_number: '', weighbridge_slip: '', notes: '',
};

export default function PurchasesPage() {
  const { db, setDb } = useDB();
  const toast = useToast();
  const [form, setForm] = useState<PurchaseForm | null>(null);
  const [confirmDel, setConfirmDel] = useState<Purchase | null>(null);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(today());
  const [matFilter, setMatFilter] = useState('all');
  const [supplierFilter, setSupplierFilter] = useState('all');

  const filtered = useMemo(() => {
    let f = dateRangeFilter(db.purchases, from, to);
    if (matFilter !== 'all') f = f.filter(p => p.material_id === parseInt(matFilter));
    if (supplierFilter !== 'all') f = f.filter(p => p.supplier_id === parseInt(supplierFilter));
    return f;
  }, [db.purchases, from, to, matFilter, supplierFilter]);

  const totalQty = filtered.reduce((a, p) => a + p.quantity, 0);
  const totalSpend = filtered.reduce((a, p) => a + p.total_amount, 0);

  const open = (p?: Purchase) => {
    if (p) {
      setForm({
        purchase_id: p.purchase_id,
        date: p.date.split('T')[0],
        time: extractLocalTime(p.date) || nowTime(),
        supplier_id: p.supplier_id ? String(p.supplier_id) : '',
        supplier_name: p.supplier_name || '',
        material_id: String(p.material_id),
        vehicle_number: p.vehicle_number || '',
        driver_name: p.driver_name || '',
        quantity: String(p.quantity),
        unit: p.unit,
        rate: String(p.rate),
        total_amount: String(p.total_amount),
        royalty_number: p.royalty_number || '',
        weighbridge_slip: p.weighbridge_slip || '',
        notes: p.notes || '',
      });
    } else {
      setForm({ ...EMPTY });
    }
  };

  const save = () => {
    if (!form) return;
    if (!form.material_id) { toast('Select a material', 'error'); return; }
    if (!isPositiveNumber(form.quantity)) { toast('Quantity must be positive', 'error'); return; }
    if (!isPositiveNumber(form.rate)) { toast('Rate must be positive', 'error'); return; }

    setDb(prev => {
      const next = { ...prev, purchases: [...prev.purchases], materials: [...prev.materials], counters: { ...prev.counters } };
      const id = form.purchase_id || (next.counters.purchase++);
      const qty = parseFloat(form.quantity);
      const rate = parseFloat(form.rate);
      const total = form.total_amount ? parseFloat(form.total_amount) : (qty * rate);
      const matId = parseInt(form.material_id);

      // Combine the form's date (yyyy-mm-dd) and time (HH:MM, 24h) into a local-time
      // Date object, then store as ISO. `new Date('yyyy-mm-ddTHH:MM')` is interpreted as
      // local time per the spec, which is what we want — the user typed a wall-clock time.
      const dt = form.time
        ? new Date(`${form.date}T${form.time}`)
        : new Date(form.date);
      const data: Purchase = {
        purchase_id: id,
        date: (isNaN(dt.getTime()) ? new Date(form.date) : dt).toISOString(),
        supplier_id: form.supplier_id ? parseInt(form.supplier_id) : undefined,
        supplier_name: form.supplier_name.trim() || undefined,
        material_id: matId,
        vehicle_number: form.vehicle_number.toUpperCase().trim(),
        driver_name: form.driver_name.trim(),
        quantity: qty,
        unit: form.unit,
        rate,
        total_amount: total,
        royalty_number: form.royalty_number.trim(),
        weighbridge_slip: form.weighbridge_slip.trim(),
        notes: form.notes.trim(),
      };

      // Auto stock update — handle both new entries and edits.
      const m = next.materials.find(x => x.id === matId);
      if (m) {
        if (form.purchase_id) {
          // Edit: subtract previous values, then add new.
          const old = prev.purchases.find(p => p.purchase_id === form.purchase_id);
          if (old) {
            const oldM = next.materials.find(x => x.id === old.material_id);
            if (oldM) {
              oldM.stock_tons = Math.max(0, (oldM.stock_tons || 0) - old.quantity);
              oldM.stock_value = Math.max(0, (oldM.stock_value || 0) - old.total_amount);
            }
          }
        }
        m.stock_tons = (m.stock_tons || 0) + qty;
        m.stock_value = (m.stock_value || 0) + total;
        m.purchase_price = rate;
      }

      if (form.purchase_id) {
        const i = next.purchases.findIndex(p => p.purchase_id === form.purchase_id);
        if (i >= 0) next.purchases[i] = data;
      } else {
        next.purchases.push(data);
      }
      return next;
    });
    toast(form.purchase_id ? 'Purchase updated · stock adjusted' : 'Purchase recorded · stock updated', 'success');
    setForm(null);
  };

  const performDelete = () => {
    if (!confirmDel) return;
    setDb(prev => {
      const next = { ...prev, purchases: prev.purchases.filter(p => p.purchase_id !== confirmDel.purchase_id), materials: [...prev.materials] };
      // Reverse the stock impact when deleting a purchase entry.
      const m = next.materials.find(x => x.id === confirmDel.material_id);
      if (m) {
        m.stock_tons = Math.max(0, (m.stock_tons || 0) - confirmDel.quantity);
        m.stock_value = Math.max(0, (m.stock_value || 0) - confirmDel.total_amount);
      }
      return next;
    });
    toast('Purchase deleted · stock reversed', 'warning');
    setConfirmDel(null);
  };

  return (
    <>
      <div className="ph">
        <div>
          <div className="pt">Purchase / Inward Stock</div>
          <div className="ps">{db.purchases.length} purchases · auto-updates material stock</div>
        </div>
        <button className="btn btnp" onClick={() => open()} disabled={db.materials.length === 0}>+ Add Purchase</button>
      </div>

      <div className="g3" style={{ marginBottom: 14 }}>
        <div className="stat stat-blue"><div className="slbl">Quantity Purchased</div><div className="sval-sm" style={{ color: 'var(--blue)' }}>{fmt2(totalQty)}</div><div className="sval-sub">Current view</div></div>
        <div className="stat stat-red"><div className="slbl">Total Spend</div><div className="sval-sm tx-dr">₹{fmt(totalSpend)}</div></div>
        <div className="stat stat-green"><div className="slbl">Suppliers</div><div className="sval-sm" style={{ color: 'var(--green)' }}>{db.suppliers.length}</div></div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <DateFilter onChange={(f, t) => { setFrom(f); setTo(t); }} />
      </div>
      <div className="filter-bar" style={{ marginBottom: 12 }}>
        <button className="btn btn-sm" onClick={() => { const t = today(); setFrom(t); setTo(t); }}>Today</button>
        <select value={matFilter} onChange={e => setMatFilter(e.target.value)} style={{ width: 170 }}>
          <option value="all">All Materials</option>
          {db.materials.map(m => <option key={m.id} value={m.id}>{m.material_name}</option>)}
        </select>
        <select value={supplierFilter} onChange={e => setSupplierFilter(e.target.value)} style={{ width: 200 }}>
          <option value="all">All Suppliers</option>
          {db.suppliers.map(s => <option key={s.supplier_id} value={s.supplier_id}>{s.supplier_name}</option>)}
        </select>
      </div>

      <div className="card">
        {db.purchases.length === 0 ? (
          <div className="empty"><div className="empty-icon">📥</div>No purchases recorded yet. Add one to update inventory automatically.</div>
        ) : filtered.length === 0 ? (
          <div className="empty"><div className="empty-icon">🔍</div>No purchases match filters</div>
        ) : (
          <div className="tbl">
            <table>
              <thead>
                <tr>
                  <th>Date &amp; Time</th><th>Purchase #</th><th>Supplier</th><th>Material</th>
                  <th>Vehicle</th><th>Qty</th><th>Rate</th><th>Total</th>
                  <th>Royalty</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {[...filtered].reverse().map(p => {
                  const sup = db.suppliers.find(s => s.supplier_id === p.supplier_id);
                  const m = db.materials.find(x => x.id === p.material_id);
                  return (
                    <tr key={p.purchase_id}>
                      <td style={{ fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap' }}>{fmtDateTime12(p.date)}</td>
                      <td className="mono" style={{ fontWeight: 700, fontSize: 11 }}>P-{p.purchase_id}</td>
                      <td style={{ fontSize: 12 }}>{sup?.supplier_name || p.supplier_name || '—'}</td>
                      <td><span className="badge bg">{m?.material_name || '—'}</span></td>
                      <td className="mono" style={{ fontSize: 11 }}>{p.vehicle_number || '—'}</td>
                      <td className="mono" style={{ fontSize: 11 }}>{p.quantity} {p.unit}</td>
                      <td>₹{p.rate}</td>
                      <td style={{ fontWeight: 700 }}>₹{fmt(p.total_amount)}</td>
                      <td className="mono" style={{ fontSize: 10.5, color: 'var(--text3)' }}>{p.royalty_number || '—'}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn btn-sm" onClick={() => open(p)}>Edit</button>
                        <button className="btn btn-xs" onClick={() => setConfirmDel(p)} style={{ color: 'var(--red)', borderColor: 'var(--red)', marginLeft: 4 }}>✕</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {form && (
        <Modal title={form.purchase_id ? 'Edit Purchase' : 'Add Purchase'} onClose={() => setForm(null)}>
          <div className="alert alert-info" style={{ marginBottom: 14 }}>Saving this entry adds the quantity to the selected material's stock and updates its purchase price. Editing or deleting reverses the previous impact.</div>
          <div className="g3">
            <div className="fg-row">
              <label className="flbl">Date <span className="req">*</span></label>
              <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
            </div>
            <div className="fg-row">
              <label className="flbl">Time <span className="req">*</span></label>
              <input type="time" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} />
              <div className="field-hint">Displayed in 12-hour AM/PM format on slips and reports.</div>
            </div>
            <div className="fg-row">
              <label className="flbl">Material <span className="req">*</span></label>
              <select value={form.material_id} onChange={e => setForm({ ...form, material_id: e.target.value })}>
                <option value="">— Select —</option>
                {db.materials.map(m => <option key={m.id} value={m.id}>{m.material_name}</option>)}
              </select>
            </div>
          </div>
          <div className="fg-row">
            <label className="flbl">Supplier (master)</label>
            <select value={form.supplier_id} onChange={e => {
              const s = db.suppliers.find(x => x.supplier_id === parseInt(e.target.value));
              setForm({ ...form, supplier_id: e.target.value, supplier_name: s?.supplier_name || form.supplier_name });
            }}>
              <option value="">— Free text below —</option>
              {db.suppliers.map(s => <option key={s.supplier_id} value={s.supplier_id}>{s.supplier_name}</option>)}
            </select>
          </div>
          <div className="fg-row">
            <label className="flbl">Supplier Name (free text)</label>
            <input value={form.supplier_name} onChange={e => setForm({ ...form, supplier_name: e.target.value })} placeholder="If not in master list" />
          </div>
          <div className="g3">
            <div className="fg-row">
              <label className="flbl">Quantity <span className="req">*</span></label>
              <NumberInput mode="decimal" value={form.quantity}
                           onChange={v => {
                             const q = parseFloat(v) || 0;
                             const r = parseFloat(form.rate) || 0;
                             setForm({ ...form, quantity: v, total_amount: q > 0 && r > 0 ? (q * r).toFixed(2) : form.total_amount });
                           }} />
            </div>
            <div className="fg-row">
              <label className="flbl">Unit</label>
              <input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} />
            </div>
            <div className="fg-row">
              <label className="flbl">Rate (₹) <span className="req">*</span></label>
              <NumberInput mode="decimal" value={form.rate}
                           onChange={v => {
                             const r = parseFloat(v) || 0;
                             const q = parseFloat(form.quantity) || 0;
                             setForm({ ...form, rate: v, total_amount: q > 0 && r > 0 ? (q * r).toFixed(2) : form.total_amount });
                           }} />
            </div>
          </div>
          <div className="fg-row">
            <label className="flbl">Total Amount (₹)</label>
            <NumberInput mode="decimal" value={form.total_amount} onChange={v => setForm({ ...form, total_amount: v })} placeholder="Auto" />
          </div>
          <div className="g2">
            <div className="fg-row">
              <label className="flbl">Vehicle Number</label>
              <input value={form.vehicle_number} onChange={e => setForm({ ...form, vehicle_number: e.target.value.toUpperCase() })} />
            </div>
            <div className="fg-row">
              <label className="flbl">Driver Name</label>
              <input value={form.driver_name} onChange={e => setForm({ ...form, driver_name: e.target.value })} />
            </div>
          </div>
          <div className="g2">
            <div className="fg-row">
              <label className="flbl">Royalty Number</label>
              <input value={form.royalty_number} onChange={e => setForm({ ...form, royalty_number: e.target.value })} />
            </div>
            <div className="fg-row">
              <label className="flbl">Weighbridge Slip</label>
              <input value={form.weighbridge_slip} onChange={e => setForm({ ...form, weighbridge_slip: e.target.value })} />
            </div>
          </div>
          <div className="fg-row">
            <label className="flbl">Notes</label>
            <textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={{ resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn btnp" style={{ flex: 1 }} onClick={save}>{form.purchase_id ? 'Update Purchase' : 'Save & Update Stock'}</button>
            <button className="btn" onClick={() => setForm(null)}>Cancel</button>
          </div>
        </Modal>
      )}

      {confirmDel && (
        <ConfirmDialog
          title="Delete purchase?"
          message={`Delete Purchase P-${confirmDel.purchase_id} (${confirmDel.quantity} ${confirmDel.unit} · ₹${fmt(confirmDel.total_amount)})?\n\nThis will reverse the stock addition for the linked material. Cannot be undone.`}
          confirmLabel="Delete & reverse stock"
          danger
          onConfirm={performDelete}
          onCancel={() => setConfirmDel(null)}
        />
      )}
    </>
  );
}
