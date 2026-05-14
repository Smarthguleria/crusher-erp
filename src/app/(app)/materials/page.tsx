'use client';

import { useMemo, useState } from 'react';
import { useDB } from '@/store/DBContext';
import { useToast } from '@/store/ToastContext';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import NumberInput from '@/components/NumberInput';
import { fmt, fmt2, isPositiveNumber, materialAnalytics, materialHasLinkedRecords, stockRemaining, stockSold } from '@/lib/helpers';
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

export default function MaterialsPage() {
  const { db, setDb } = useDB();
  const toast = useToast();
  const [editForm, setEditForm] = useState<MatForm | null>(null);
  const [stockForm, setStockForm] = useState<{ matId: number; qty: string; rate: string; sv: string; note: string } | null>(null);
  const [confirmDel, setConfirmDel] = useState<{ id: number; name: string } | null>(null);
  const [search, setSearch] = useState('');

  const totalStock = db.materials.reduce((a, m) => a + (m.stock_tons || 0), 0);
  const totalValue = db.materials.reduce((a, m) => a + (m.stock_value || 0), 0);
  const totalSold = db.slips.reduce((a, s) => a + s.quantity, 0);

  // Roll up sales analytics across every material so the header strip shows business-
  // level KPIs (revenue, profit) alongside stock.
  const fleetAnalytics = db.materials.reduce((acc, m) => {
    const a = materialAnalytics(db, m.id);
    return {
      purchasedValue: acc.purchasedValue + a.purchasedValue,
      soldValue: acc.soldValue + a.soldValue,
      currentStockValue: acc.currentStockValue + a.currentStockValue,
      estProfit: acc.estProfit + a.estProfit,
    };
  }, { purchasedValue: 0, soldValue: 0, currentStockValue: 0, estProfit: 0 });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return db.materials;
    return db.materials.filter(m =>
      m.material_name.toLowerCase().includes(q) ||
      (m.hsn_code || '').toLowerCase().includes(q) ||
      (m.unit || '').toLowerCase().includes(q)
    );
  }, [db.materials, search]);

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
    setDb(prev => {
      const next = { ...prev, materials: [...prev.materials] };
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
    setDb(prev => ({ ...prev, materials: prev.materials.filter(m => m.id !== confirmDel.id) }));
    toast('Material deleted', 'warning');
    setConfirmDel(null);
  };

  const saveStock = () => {
    if (!stockForm) return;
    if (!isPositiveNumber(stockForm.qty)) { toast('Enter a valid quantity', 'error'); return; }
    const qty = parseFloat(stockForm.qty);
    const rate = parseFloat(stockForm.rate) || 0;
    const sv = parseFloat(stockForm.sv) || (qty * rate);
    setDb(prev => {
      const next = { ...prev, materials: [...prev.materials] };
      const m = next.materials.find(x => x.id === stockForm.matId);
      if (m) {
        m.stock_tons = (m.stock_tons || 0) + qty;
        m.stock_value = (m.stock_value || 0) + sv;
        // Update average purchase price if a rate was given.
        if (rate > 0) m.purchase_price = rate;
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

      <div className="g4" style={{ marginBottom: 14 }}>
        <div className="stat stat-accent">
          <div className="slbl">📦 Stock On Hand</div>
          <div className="sval-sm">{(totalStock / 1000).toFixed(4)} MT</div>
          <div className="sval-sub">{fmt2(totalStock)} CFT · ₹{fmt(fleetAnalytics.currentStockValue || totalValue)}</div>
        </div>
        <div className="stat stat-blue">
          <div className="slbl">📥 Purchase Spend (all time)</div>
          <div className="sval-sm" style={{ color: 'var(--blue)' }}>₹{fmt(fleetAnalytics.purchasedValue)}</div>
          <div className="sval-sub">across {db.purchases.length} purchase{db.purchases.length !== 1 ? 's' : ''}</div>
        </div>
        <div className="stat stat-green">
          <div className="slbl">💰 Sales Revenue (taxable)</div>
          <div className="sval-sm tx-cr">₹{fmt(fleetAnalytics.soldValue)}</div>
          <div className="sval-sub">{(totalSold / 1000).toFixed(4)} MT sold</div>
        </div>
        <div className="stat stat-amber">
          <div className="slbl">📈 Estimated Profit</div>
          <div className="sval-sm" style={{ color: fleetAnalytics.estProfit >= 0 ? 'var(--green)' : 'var(--red)' }}>₹{fmt(Math.abs(fleetAnalytics.estProfit))}</div>
          <div className="sval-sub">{fleetAnalytics.estProfit >= 0 ? 'sold − cost' : 'loss vs. cost'}</div>
        </div>
      </div>

      <div className="filter-bar" style={{ marginBottom: 12 }}>
        <div className="search-wrap" style={{ flex: 1, minWidth: 220 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, HSN, unit…" />
        </div>
        {search && <button className="btn btn-sm" onClick={() => setSearch('')}>Clear</button>}
      </div>

      <div className="card">
        <div className="section-hdr">Material Stock Details</div>
        {filtered.length === 0 ? (
          <div className="empty"><div className="empty-icon">📦</div>No materials match your search</div>
        ) : filtered.map(m => {
          const sold = stockSold(db, m.id);
          const rem = stockRemaining(db, m.id);
          const tot = m.stock_tons || 0;
          const pct = tot > 0 ? Math.min(100, Math.round(rem / tot * 100)) : 0;
          const low = (m.min_stock || 0) > 0 && rem <= (m.min_stock || 0);
          const ana = materialAnalytics(db, m.id);
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
                    HSN: {m.hsn_code} · GST: {m.gst_percent}% · Sell: ₹{m.rate}/CFT{m.purchase_price ? ` · Buy: ₹${m.purchase_price}/CFT` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button className="btn btn-sm btng" onClick={() => setStockForm({ matId: m.id, qty: '', rate: String(m.purchase_price || m.rate || ''), sv: '', note: '' })}>+ Add Stock</button>
                  <button className="btn btn-sm" onClick={() => openEdit(m)}>Edit</button>
                  <button className="btn btn-sm" onClick={() => requestDelete(m)} style={{ color: 'var(--red)', borderColor: 'var(--red)' }}>Delete</button>
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

              {/* Sales analytics row — derived from purchases + invoices, not stored. */}
              <div className="g4" style={{ gap: 10, marginTop: 12 }}>
                <div style={{ background: '#F4F8FB', borderRadius: 'var(--r)', padding: 10, border: '1px solid #d6e3ee' }}>
                  <div style={{ fontSize: 10, color: 'var(--blue)', fontWeight: 700, textTransform: 'uppercase' }}>Purchased</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--blue)', marginTop: 2 }}>{fmt2(ana.purchasedQty)} CFT</div>
                  <div style={{ fontSize: 10, color: 'var(--text3)' }}>₹{fmt(ana.purchasedValue)} {ana.avgPurchaseRate > 0 ? `· avg ₹${ana.avgPurchaseRate.toFixed(2)}/CFT` : ''}</div>
                </div>
                <div style={{ background: 'var(--green-light)', borderRadius: 'var(--r)', padding: 10, border: '1px solid #b8e0c4' }}>
                  <div style={{ fontSize: 10, color: 'var(--green)', fontWeight: 700, textTransform: 'uppercase' }}>Sold (Revenue)</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--green)', marginTop: 2 }}>{fmt2(ana.soldQty)} CFT</div>
                  <div style={{ fontSize: 10, color: 'var(--text3)' }}>₹{fmt(ana.soldValue)} taxable</div>
                </div>
                <div style={{ background: '#FBF6E8', borderRadius: 'var(--r)', padding: 10, border: '1px solid #f0d99a' }}>
                  <div style={{ fontSize: 10, color: 'var(--amber)', fontWeight: 700, textTransform: 'uppercase' }}>Stock Valuation</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--amber)', marginTop: 2 }}>₹{fmt(ana.currentStockValue)}</div>
                  <div style={{ fontSize: 10, color: 'var(--text3)' }}>{fmt2(ana.remaining)} CFT × avg rate</div>
                </div>
                <div style={{
                  background: ana.estProfit >= 0 ? '#E8F5EC' : 'var(--red-light)',
                  borderRadius: 'var(--r)', padding: 10,
                  border: `1px solid ${ana.estProfit >= 0 ? '#a6d6b3' : '#f4bbb8'}`,
                }}>
                  <div style={{ fontSize: 10, color: ana.estProfit >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 700, textTransform: 'uppercase' }}>Estimated Profit</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: ana.estProfit >= 0 ? 'var(--green)' : 'var(--red)', marginTop: 2 }}>₹{fmt(Math.abs(ana.estProfit))} {ana.estProfit < 0 ? 'loss' : ''}</div>
                  <div style={{ fontSize: 10, color: 'var(--text3)' }}>sold − (qty × avg cost)</div>
                </div>
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
