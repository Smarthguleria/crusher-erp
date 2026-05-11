'use client';

import { useMemo, useState } from 'react';
import { useDB } from '@/store/DBContext';
import { useToast } from '@/store/ToastContext';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import NumberInput from '@/components/NumberInput';
import DateFilter from '@/components/DateFilter';
import { dateRangeFilter, fmt, isPositiveNumber, today } from '@/lib/helpers';
import type { Expense, ExpenseCategory } from '@/lib/types';

interface ExpForm {
  expense_id?: number;
  date: string;
  category: ExpenseCategory;
  amount: string;
  paid_to: string;
  vehicle_id: string;
  payment_mode: 'cash' | 'online' | '';
  notes: string;
}

const EMPTY: ExpForm = {
  date: today(), category: 'misc', amount: '', paid_to: '',
  vehicle_id: '', payment_mode: '', notes: '',
};

const CATEGORIES: { id: ExpenseCategory; label: string; emoji: string }[] = [
  { id: 'diesel', label: 'Diesel', emoji: '⛽' },
  { id: 'maintenance', label: 'Maintenance', emoji: '🔧' },
  { id: 'salary', label: 'Salary', emoji: '💰' },
  { id: 'office', label: 'Office', emoji: '🏢' },
  { id: 'labour', label: 'Labour', emoji: '👷' },
  { id: 'electricity', label: 'Electricity', emoji: '⚡' },
  { id: 'tyre', label: 'Tyre', emoji: '🛞' },
  { id: 'misc', label: 'Miscellaneous', emoji: '📌' },
];
const catLabel = (c: ExpenseCategory) => CATEGORIES.find(x => x.id === c)?.label ?? c;
const catEmoji = (c: ExpenseCategory) => CATEGORIES.find(x => x.id === c)?.emoji ?? '📌';

export default function ExpensesPage() {
  const { db, setDb } = useDB();
  const toast = useToast();
  const [form, setForm] = useState<ExpForm | null>(null);
  const [confirmDel, setConfirmDel] = useState<Expense | null>(null);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(today());
  const [catFilter, setCatFilter] = useState<'all' | ExpenseCategory>('all');
  const [vehicleFilter, setVehicleFilter] = useState('all');

  const filtered = useMemo(() => {
    let f = dateRangeFilter(db.expenses, from, to);
    if (catFilter !== 'all') f = f.filter(e => e.category === catFilter);
    if (vehicleFilter !== 'all') f = f.filter(e => e.vehicle_id === parseInt(vehicleFilter));
    return f;
  }, [db.expenses, from, to, catFilter, vehicleFilter]);

  const totalSpend = filtered.reduce((a, e) => a + e.amount, 0);

  // Per-category breakdown for the summary strip.
  const byCategory = useMemo(() => {
    const map = new Map<ExpenseCategory, number>();
    filtered.forEach(e => map.set(e.category, (map.get(e.category) || 0) + e.amount));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  const open = (e?: Expense) => {
    if (e) {
      setForm({
        expense_id: e.expense_id,
        date: e.date.split('T')[0],
        category: e.category,
        amount: String(e.amount),
        paid_to: e.paid_to || '',
        vehicle_id: e.vehicle_id ? String(e.vehicle_id) : '',
        payment_mode: e.payment_mode || '',
        notes: e.notes || '',
      });
    } else {
      setForm({ ...EMPTY });
    }
  };

  const save = () => {
    if (!form) return;
    if (!isPositiveNumber(form.amount)) { toast('Amount must be a positive number', 'error'); return; }

    setDb(prev => {
      const next = { ...prev, expenses: [...prev.expenses], counters: { ...prev.counters } };
      const id = form.expense_id || (next.counters.expense++);
      const data: Expense = {
        expense_id: id,
        date: new Date(form.date).toISOString(),
        category: form.category,
        amount: parseFloat(form.amount),
        paid_to: form.paid_to.trim(),
        vehicle_id: form.vehicle_id ? parseInt(form.vehicle_id) : undefined,
        payment_mode: form.payment_mode || undefined,
        notes: form.notes.trim(),
      };
      if (form.expense_id) {
        const i = next.expenses.findIndex(e => e.expense_id === form.expense_id);
        if (i >= 0) next.expenses[i] = data;
      } else {
        next.expenses.push(data);
      }
      return next;
    });
    toast(form.expense_id ? 'Expense updated' : 'Expense recorded', 'success');
    setForm(null);
  };

  const performDelete = () => {
    if (!confirmDel) return;
    setDb(prev => ({ ...prev, expenses: prev.expenses.filter(e => e.expense_id !== confirmDel.expense_id) }));
    toast('Expense deleted', 'warning');
    setConfirmDel(null);
  };

  return (
    <>
      <div className="ph">
        <div>
          <div className="pt">Expense Management</div>
          <div className="ps">{db.expenses.length} expense entries · ₹{fmt(totalSpend)} in current view</div>
        </div>
        <button className="btn btnp" onClick={() => open()}>+ Add Expense</button>
      </div>

      {byCategory.length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="section-hdr">📊 Spend by Category</div>
          <div className="g4">
            {byCategory.map(([c, amt]) => (
              <div key={c} style={{ background: 'var(--surface2)', borderRadius: 'var(--r)', padding: 10 }}>
                <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase' }}>{catEmoji(c)} {catLabel(c)}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--red)', marginTop: 3 }}>₹{fmt(amt)}</div>
                <div style={{ fontSize: 10, color: 'var(--text3)' }}>{Math.round(amt / totalSpend * 100)}% of total</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <DateFilter onChange={(f, t) => { setFrom(f); setTo(t); }} />
      </div>
      <div className="filter-bar" style={{ marginBottom: 12 }}>
        <select value={catFilter} onChange={e => setCatFilter(e.target.value as any)} style={{ width: 170 }}>
          <option value="all">All Categories</option>
          {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
        </select>
        <select value={vehicleFilter} onChange={e => setVehicleFilter(e.target.value)} style={{ width: 170 }}>
          <option value="all">All Vehicles</option>
          {db.vehicles.map(v => <option key={v.vehicle_id} value={v.vehicle_id}>{v.vehicle_number}</option>)}
        </select>
      </div>

      <div className="card">
        {db.expenses.length === 0 ? (
          <div className="empty"><div className="empty-icon">💸</div>No expenses yet</div>
        ) : filtered.length === 0 ? (
          <div className="empty"><div className="empty-icon">🔍</div>No expenses match filters</div>
        ) : (
          <div className="tbl">
            <table>
              <thead>
                <tr><th>Date</th><th>Category</th><th>Paid To</th><th>Vehicle</th><th>Mode</th><th>Notes</th><th>Amount</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {[...filtered].reverse().map(e => {
                  const v = db.vehicles.find(x => x.vehicle_id === e.vehicle_id);
                  return (
                    <tr key={e.expense_id}>
                      <td style={{ fontSize: 11, color: 'var(--text3)' }}>{new Date(e.date).toLocaleDateString('en-IN')}</td>
                      <td><span className="badge badge-gray">{catEmoji(e.category)} {catLabel(e.category)}</span></td>
                      <td style={{ fontSize: 12 }}>{e.paid_to || '—'}</td>
                      <td className="mono" style={{ fontSize: 11 }}>{v?.vehicle_number || '—'}</td>
                      <td style={{ fontSize: 11 }}>{e.payment_mode === 'cash' ? '💵 Cash' : e.payment_mode === 'online' ? '🏦 Online' : '—'}</td>
                      <td style={{ fontSize: 11, color: 'var(--text3)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.notes || ''}>{e.notes || '—'}</td>
                      <td style={{ fontWeight: 700, color: 'var(--red)' }}>₹{fmt(e.amount)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn btn-sm" onClick={() => open(e)}>Edit</button>
                        <button className="btn btn-xs" onClick={() => setConfirmDel(e)} style={{ color: 'var(--red)', borderColor: 'var(--red)', marginLeft: 4 }}>✕</button>
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
        <Modal title={form.expense_id ? 'Edit Expense' : 'Add Expense'} onClose={() => setForm(null)}>
          <div className="g3">
            <div className="fg-row">
              <label className="flbl">Date <span className="req">*</span></label>
              <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
            </div>
            <div className="fg-row">
              <label className="flbl">Category <span className="req">*</span></label>
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value as ExpenseCategory })}>
                {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
              </select>
            </div>
            <div className="fg-row">
              <label className="flbl">Amount (₹) <span className="req">*</span></label>
              <NumberInput mode="decimal" value={form.amount} onChange={v => setForm({ ...form, amount: v })} />
            </div>
          </div>
          <div className="g2">
            <div className="fg-row">
              <label className="flbl">Paid To</label>
              <input value={form.paid_to} onChange={e => setForm({ ...form, paid_to: e.target.value })} placeholder="Vendor / employee / supplier" />
            </div>
            <div className="fg-row">
              <label className="flbl">Vehicle Link (optional)</label>
              <select value={form.vehicle_id} onChange={e => setForm({ ...form, vehicle_id: e.target.value })}>
                <option value="">— None —</option>
                {db.vehicles.map(v => <option key={v.vehicle_id} value={v.vehicle_id}>{v.vehicle_number}</option>)}
              </select>
            </div>
          </div>
          <div className="fg-row">
            <label className="flbl">Payment Mode</label>
            <select value={form.payment_mode} onChange={e => setForm({ ...form, payment_mode: e.target.value as any })}>
              <option value="">— Optional —</option>
              <option value="cash">💵 Cash</option>
              <option value="online">🏦 Online</option>
            </select>
          </div>
          <div className="fg-row">
            <label className="flbl">Notes</label>
            <textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={{ resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn btnp" style={{ flex: 1 }} onClick={save}>{form.expense_id ? 'Update' : 'Save Expense'}</button>
            <button className="btn" onClick={() => setForm(null)}>Cancel</button>
          </div>
        </Modal>
      )}

      {confirmDel && (
        <ConfirmDialog title="Delete expense?" message={`Delete this ${catLabel(confirmDel.category)} expense of ₹${fmt(confirmDel.amount)}? This cannot be undone.`}
          confirmLabel="Delete" danger onConfirm={performDelete} onCancel={() => setConfirmDel(null)} />
      )}
    </>
  );
}
