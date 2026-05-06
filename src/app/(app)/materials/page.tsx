'use client';

import { useState } from 'react';
import { useDB } from '@/store/DBContext';
import { useToast } from '@/store/ToastContext';
import Modal from '@/components/Modal';
import { fmt, fmt2, stockRemaining, stockSold } from '@/lib/helpers';
import type { Material } from '@/lib/types';

interface MatForm {
  id?: number;
  material_name: string;
  unit: string;
  rate: number;
  gst_percent: number;
  hsn_code: string;
  stock_tons: number;
  stock_value: number;
  min_stock: number;
}

const EMPTY_FORM: MatForm = {
  material_name: '', unit: 'CFT', rate: 0, gst_percent: 5, hsn_code: '251710',
  stock_tons: 0, stock_value: 0, min_stock: 0,
};

export default function MaterialsPage() {
  const { db, setDb } = useDB();
  const toast = useToast();
  const [editForm, setEditForm] = useState<MatForm | null>(null);
  const [stockForm, setStockForm] = useState<{ matId: number; qty: string; rate: string; sv: string; note: string } | null>(null);

  const totalStock = db.materials.reduce((a, m) => a + (m.stock_tons || 0), 0);
  const totalValue = db.materials.reduce((a, m) => a + (m.stock_value || 0), 0);
  const totalSold = db.slips.reduce((a, s) => a + s.quantity, 0);

  const openEdit = (m?: Material) => {
    setEditForm(m ? { ...m } : { ...EMPTY_FORM });
  };

  const saveMat = () => {
    if (!editForm) return;
    if (!editForm.material_name) { toast('Material name is required', 'error'); return; }
    setDb(prev => {
      const next = { ...prev, materials: [...prev.materials] };
      if (editForm.id) {
        const m = next.materials.find(x => x.id === editForm.id);
        if (m) Object.assign(m, editForm);
      } else {
        const nid = Math.max(0, ...next.materials.map(m => m.id)) + 1;
        next.materials.push({ ...editForm, id: nid } as Material);
      }
      return next;
    });
    toast(editForm.id ? 'Material updated!' : 'Material added!', 'success');
    setEditForm(null);
  };

  const saveStock = () => {
    if (!stockForm) return;
    const qty = parseFloat(stockForm.qty) || 0;
    const sv = parseFloat(stockForm.sv) || 0;
    if (qty <= 0) { toast('Enter a valid quantity', 'error'); return; }
    setDb(prev => {
      const next = { ...prev, materials: [...prev.materials] };
      const m = next.materials.find(x => x.id === stockForm.matId);
      if (m) {
        m.stock_tons = (m.stock_tons || 0) + qty;
        m.stock_value = (m.stock_value || 0) + sv;
      }
      return next;
    });
    toast('Stock updated!', 'success');
    setStockForm(null);
  };

  return (
    <>
      <div className="ph">
        <div>
          <div className="pt">Material Master</div>
          <div className="ps">Rates, HSN codes &amp; live stock management</div>
        </div>
        <button className="btn btnp" onClick={() => openEdit()}>+ Add Material</button>
      </div>

      <div className="g3" style={{ marginBottom: 14 }}>
        <div className="stat stat-accent"><div className="slbl">Total Stock (All Materials)</div><div className="sval-sm">{(totalStock / 1000).toFixed(4)} MT</div><div className="sval-sub">{fmt2(totalStock)} CFT</div></div>
        <div className="stat stat-blue"><div className="slbl">Total Stock Value</div><div className="sval-sm" style={{ color: 'var(--blue)' }}>₹{fmt(totalValue)}</div></div>
        <div className="stat stat-red"><div className="slbl">Total Sold (All Time)</div><div className="sval-sm tx-dr">{(totalSold / 1000).toFixed(4)} MT</div><div className="sval-sub">{fmt2(totalSold)} CFT</div></div>
      </div>

      <div className="card">
        <div className="section-hdr">Material Stock Details</div>
        {db.materials.map(m => {
          const sold = stockSold(db, m.id);
          const rem = stockRemaining(db, m.id);
          const tot = m.stock_tons || 0;
          const pct = tot > 0 ? Math.min(100, Math.round(rem / tot * 100)) : 0;
          const low = (m.min_stock || 0) > 0 && rem <= (m.min_stock || 0);
          return (
            <div key={m.id} style={{
              border: `1px solid ${low ? '#f4bbb8' : 'var(--border)'}`,
              borderRadius: 'var(--r)', padding: 16, marginBottom: 12,
              background: low ? '#FFFAFA' : 'var(--surface)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800 }}>
                    {m.material_name} {low && <span style={{ color: 'var(--red)', fontSize: 11, fontWeight: 700 }}>⚠ Low Stock</span>}
                  </div>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>
                    HSN: {m.hsn_code} · GST: {m.gst_percent}% · Selling Rate: ₹{m.rate}/CFT
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button className="btn btn-sm btng" onClick={() => setStockForm({ matId: m.id, qty: '', rate: String(m.rate), sv: '', note: '' })}>+ Add Stock</button>
                  <button className="btn btn-sm" onClick={() => openEdit(m)}>Edit</button>
                </div>
              </div>
              <div className="g4" style={{ gap: 10, marginBottom: 12 }}>
                <div style={{ background: 'var(--surface2)', borderRadius: 'var(--r)', padding: 10, textAlign: 'center', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase' }}>Stock In</div>
                  <div style={{ fontSize: 15, fontWeight: 800, marginTop: 3 }}>{(tot / 1000).toFixed(4)}</div>
                  <div style={{ fontSize: 10, color: 'var(--text3)' }}>MT</div>
                </div>
                <div style={{ background: 'var(--red-light)', borderRadius: 'var(--r)', padding: 10, textAlign: 'center', border: '1px solid #f4bbb8' }}>
                  <div style={{ fontSize: 10, color: 'var(--red)', fontWeight: 700, textTransform: 'uppercase' }}>Sold</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--red)', marginTop: 3 }}>{(sold / 1000).toFixed(4)}</div>
                  <div style={{ fontSize: 10, color: 'var(--text3)' }}>MT</div>
                </div>
                <div style={{ background: 'var(--green-light)', borderRadius: 'var(--r)', padding: 10, textAlign: 'center', border: '1px solid #b8e0c4' }}>
                  <div style={{ fontSize: 10, color: 'var(--green)', fontWeight: 700, textTransform: 'uppercase' }}>Available</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--green)', marginTop: 3 }}>{(rem / 1000).toFixed(4)}</div>
                  <div style={{ fontSize: 10, color: 'var(--text3)' }}>MT</div>
                </div>
                <div style={{ background: 'var(--blue-light)', borderRadius: 'var(--r)', padding: 10, textAlign: 'center', border: '1px solid #b8d4f0' }}>
                  <div style={{ fontSize: 10, color: 'var(--blue)', fontWeight: 700, textTransform: 'uppercase' }}>Stock Value</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--blue)', marginTop: 3 }}>₹{fmt(m.stock_value || 0)}</div>
                  <div style={{ fontSize: 10, color: 'var(--text3)' }}>Total</div>
                </div>
              </div>
              <div style={{ marginBottom: 5, display: 'flex', justifyContent: 'space-between', fontSize: 11.5 }}>
                <span style={{ fontWeight: 600 }}>Stock Level — {pct}% available</span>
                <span style={{ color: 'var(--text3)' }}>{(m.min_stock || 0) > 0 ? `Min alert: ${m.min_stock} CFT` : ''}</span>
              </div>
              <div className="stock-bar-wrap" style={{ height: 10 }}>
                <div className={`stock-bar ${pct < 20 ? 'low' : pct < 50 ? 'mid' : ''}`} style={{ width: `${pct}%`, height: 10 }} />
              </div>
            </div>
          );
        })}
      </div>

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
              <input type="number" min="0" value={editForm.rate} onChange={e => {
                const v = parseFloat(e.target.value) || 0;
                const sv = (editForm.stock_tons > 0 && v > 0) ? editForm.stock_tons * v : editForm.stock_value;
                setEditForm({ ...editForm, rate: v, stock_value: sv });
              }} /></div>
            <div className="fg-row"><label className="flbl">GST Rate (%)</label>
              <input type="number" min="0" max="28" value={editForm.gst_percent} onChange={e => setEditForm({ ...editForm, gst_percent: parseFloat(e.target.value) || 0 })} /></div>
          </div>
          <div className="fg-row"><label className="flbl">HSN Code</label>
            <input value={editForm.hsn_code} onChange={e => setEditForm({ ...editForm, hsn_code: e.target.value })} /></div>
          <div className="divider" />
          <div className="mo-section">📦 Stock Information</div>
          <div className="g2">
            <div className="fg-row"><label className="flbl">Opening Stock (CFT)</label>
              <input type="number" min="0" step="0.001" value={editForm.stock_tons} onChange={e => {
                const v = parseFloat(e.target.value) || 0;
                const sv = (v > 0 && editForm.rate > 0) ? v * editForm.rate : editForm.stock_value;
                setEditForm({ ...editForm, stock_tons: v, stock_value: sv });
              }} /></div>
            <div className="fg-row"><label className="flbl">Stock Value (₹)</label>
              <input type="number" min="0" value={editForm.stock_value} onChange={e => setEditForm({ ...editForm, stock_value: parseFloat(e.target.value) || 0 })} placeholder="Auto-calculated" /></div>
          </div>
          <div className="fg-row"><label className="flbl">Minimum Stock Alert (CFT)</label>
            <input type="number" min="0" step="0.001" value={editForm.min_stock} onChange={e => setEditForm({ ...editForm, min_stock: parseFloat(e.target.value) || 0 })} placeholder="Alert when stock falls below this level" /></div>
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
              <input type="number" min="0" step="0.001" value={stockForm.qty} onChange={e => {
                const q = parseFloat(e.target.value) || 0;
                const r = parseFloat(stockForm.rate) || 0;
                setStockForm({ ...stockForm, qty: e.target.value, sv: q > 0 && r > 0 ? (q * r).toFixed(0) : stockForm.sv });
              }} placeholder="0.000" /></div>
            <div className="fg-row"><label className="flbl">Purchase Rate (₹/CFT)</label>
              <input type="number" min="0" step="0.01" value={stockForm.rate} onChange={e => {
                const r = parseFloat(e.target.value) || 0;
                const q = parseFloat(stockForm.qty) || 0;
                setStockForm({ ...stockForm, rate: e.target.value, sv: q > 0 && r > 0 ? (q * r).toFixed(0) : stockForm.sv });
              }} /></div>
            <div className="fg-row"><label className="flbl">Stock Value Added (₹)</label>
              <input type="number" value={stockForm.sv} onChange={e => setStockForm({ ...stockForm, sv: e.target.value })} placeholder="Auto-calculated from qty × rate" /></div>
            <div className="fg-row"><label className="flbl">Note (Supplier, Purchase Date, etc.)</label>
              <input type="text" value={stockForm.note} onChange={e => setStockForm({ ...stockForm, note: e.target.value })} placeholder="e.g. Purchased from XYZ Quarry" /></div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="btn btng" style={{ flex: 1 }} onClick={saveStock}>Add Stock</button>
              <button className="btn" onClick={() => setStockForm(null)}>Cancel</button>
            </div>
          </Modal>
        );
      })()}
    </>
  );
}
