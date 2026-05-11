'use client';

import { useMemo, useState } from 'react';
import { useDB } from '@/store/DBContext';
import { useToast } from '@/store/ToastContext';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import NumberInput from '@/components/NumberInput';
import { fmt, isValidGSTIN, isValidPhone, supplierHasLinkedRecords } from '@/lib/helpers';
import { STATES, type Supplier } from '@/lib/types';

interface SupForm {
  supplier_id?: number;
  supplier_name: string;
  phone: string;
  gstin: string;
  address: string;
  state: string;
  notes: string;
}

const EMPTY: SupForm = {
  supplier_name: '', phone: '', gstin: '', address: '', state: 'Punjab', notes: '',
};

export default function SuppliersPage() {
  const { db, setDb } = useDB();
  const toast = useToast();
  const [form, setForm] = useState<SupForm | null>(null);
  const [search, setSearch] = useState('');
  const [confirmDel, setConfirmDel] = useState<{ id: number; name: string } | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return db.suppliers;
    return db.suppliers.filter(s =>
      s.supplier_name.toLowerCase().includes(q) ||
      (s.phone || '').includes(q) ||
      (s.gstin || '').toLowerCase().includes(q) ||
      (s.address || '').toLowerCase().includes(q)
    );
  }, [db.suppliers, search]);

  // Aggregate purchase metrics per supplier so the table shows business value at a glance.
  const supplierStats = useMemo(() => {
    const stats = new Map<number, { count: number; total: number }>();
    db.purchases.forEach(p => {
      if (!p.supplier_id) return;
      const cur = stats.get(p.supplier_id) || { count: 0, total: 0 };
      cur.count++;
      cur.total += p.total_amount;
      stats.set(p.supplier_id, cur);
    });
    return stats;
  }, [db.purchases]);

  const open = (s?: Supplier) => {
    if (s) {
      setForm({
        supplier_id: s.supplier_id,
        supplier_name: s.supplier_name,
        phone: s.phone || '',
        gstin: s.gstin || '',
        address: s.address || '',
        state: s.state || 'Punjab',
        notes: s.notes || '',
      });
    } else {
      setForm({ ...EMPTY });
    }
  };

  const save = () => {
    if (!form) return;
    if (!form.supplier_name.trim()) { toast('Supplier name is required', 'error'); return; }
    if (form.phone && !isValidPhone(form.phone)) {
      toast('Phone must be 10 digits (starts 6-9)', 'error'); return;
    }
    if (form.gstin && !isValidGSTIN(form.gstin)) {
      toast('Invalid GSTIN format (15 chars, e.g. 03AABCU9603R1ZX)', 'error'); return;
    }

    setDb(prev => {
      const next = { ...prev, suppliers: [...prev.suppliers], counters: { ...prev.counters } };
      const id = form.supplier_id || (next.counters.supplier++);
      const data: Supplier = {
        supplier_id: id,
        supplier_name: form.supplier_name.trim(),
        phone: form.phone.trim(),
        gstin: form.gstin.trim().toUpperCase(),
        address: form.address.trim(),
        state: form.state,
        notes: form.notes.trim(),
      };
      if (form.supplier_id) {
        const i = next.suppliers.findIndex(s => s.supplier_id === form.supplier_id);
        if (i >= 0) next.suppliers[i] = data;
      } else {
        next.suppliers.push(data);
      }
      return next;
    });
    toast(form.supplier_id ? 'Supplier updated' : 'Supplier added', 'success');
    setForm(null);
  };

  const requestDelete = (s: Supplier) => {
    const links = supplierHasLinkedRecords(db, s.supplier_id);
    if (links.total > 0) {
      toast(`Cannot delete "${s.supplier_name}" — linked to ${links.purchases} purchase${links.purchases > 1 ? 's' : ''}.`, 'error', 6000);
      return;
    }
    setConfirmDel({ id: s.supplier_id, name: s.supplier_name });
  };

  const performDelete = () => {
    if (!confirmDel) return;
    setDb(prev => ({ ...prev, suppliers: prev.suppliers.filter(s => s.supplier_id !== confirmDel.id) }));
    toast('Supplier deleted', 'warning');
    setConfirmDel(null);
  };

  return (
    <>
      <div className="ph">
        <div>
          <div className="pt">Supplier Master</div>
          <div className="ps">{db.suppliers.length} suppliers · used by Purchases module</div>
        </div>
        <button className="btn btnp" onClick={() => open()}>+ Add Supplier</button>
      </div>

      <div className="filter-bar" style={{ marginBottom: 12 }}>
        <div className="search-wrap" style={{ flex: 1, minWidth: 220 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, phone, GSTIN, address…" />
        </div>
        {search && <button className="btn btn-sm" onClick={() => setSearch('')}>Clear</button>}
      </div>

      <div className="card">
        {db.suppliers.length === 0 ? (
          <div className="empty"><div className="empty-icon">🏭</div>No suppliers yet. Add quarry / vendor masters here so they auto-fill on Purchase entries.</div>
        ) : filtered.length === 0 ? (
          <div className="empty"><div className="empty-icon">🔍</div>No suppliers match "{search}"</div>
        ) : (
          <div className="tbl">
            <table>
              <thead>
                <tr><th>Name</th><th>Phone</th><th>GSTIN</th><th>State</th><th>Address</th><th>Purchases</th><th>Total Spend</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {filtered.map(s => {
                  const stats = supplierStats.get(s.supplier_id) || { count: 0, total: 0 };
                  return (
                    <tr key={s.supplier_id}>
                      <td style={{ fontWeight: 700 }}>{s.supplier_name}</td>
                      <td className="mono" style={{ fontSize: 11 }}>{s.phone || '—'}</td>
                      <td className="mono" style={{ fontSize: 11 }}>{s.gstin || '—'}</td>
                      <td><span className="tag-chip">{s.state}</span></td>
                      <td style={{ fontSize: 11.5, color: 'var(--text2)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.address || ''}>{s.address || '—'}</td>
                      <td className="mono" style={{ fontSize: 11 }}>{stats.count}</td>
                      <td style={{ fontWeight: 700 }}>₹{fmt(stats.total)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn btn-sm" onClick={() => open(s)}>Edit</button>
                        <button className="btn btn-sm" onClick={() => requestDelete(s)} style={{ color: 'var(--red)', borderColor: 'var(--red)', marginLeft: 4 }}>Delete</button>
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
        <Modal title={form.supplier_id ? 'Edit Supplier' : 'Add Supplier'} onClose={() => setForm(null)}>
          <div className="fg-row">
            <label className="flbl">Supplier / Quarry Name <span className="req">*</span></label>
            <input value={form.supplier_name} onChange={e => setForm({ ...form, supplier_name: e.target.value })} placeholder="e.g. ABC Quarry & Aggregates" />
          </div>
          <div className="g2">
            <div className="fg-row">
              <label className="flbl">Phone (10 digits)</label>
              <NumberInput mode="integer" maxLength={10} value={form.phone} onChange={v => setForm({ ...form, phone: v })} />
            </div>
            <div className="fg-row">
              <label className="flbl">State</label>
              <select value={form.state} onChange={e => setForm({ ...form, state: e.target.value })}>
                {STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="fg-row">
            <label className="flbl">GSTIN (optional)</label>
            <input className="mono" maxLength={15} value={form.gstin} onChange={e => setForm({ ...form, gstin: e.target.value.toUpperCase() })} placeholder="e.g. 03AABCU9603R1ZX" />
          </div>
          <div className="fg-row">
            <label className="flbl">Address</label>
            <textarea rows={2} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} style={{ resize: 'vertical' }} />
          </div>
          <div className="fg-row">
            <label className="flbl">Notes</label>
            <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn btnp" style={{ flex: 1 }} onClick={save}>{form.supplier_id ? 'Update' : 'Add Supplier'}</button>
            <button className="btn" onClick={() => setForm(null)}>Cancel</button>
          </div>
        </Modal>
      )}

      {confirmDel && (
        <ConfirmDialog
          title="Delete supplier?"
          message={`Permanently delete "${confirmDel.name}"?\n\nNo purchase entries are linked. Cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={performDelete}
          onCancel={() => setConfirmDel(null)}
        />
      )}
    </>
  );
}
