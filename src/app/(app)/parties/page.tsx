'use client';

import { useState } from 'react';
import { useDB } from '@/store/DBContext';
import { useToast } from '@/store/ToastContext';
import Modal from '@/components/Modal';
import { fmt, fmt2, gstTypeBadge, gstTypeLabel } from '@/lib/helpers';
import { STATES, type Party } from '@/lib/types';

interface PartyForm {
  party_id?: number;
  party_name: string;
  phone: string;
  state: string;
  gstin: string;
  address: string;
  rates: Record<string, string>;
}

const EMPTY: PartyForm = { party_name: '', phone: '', state: 'Punjab', gstin: '', address: '', rates: {} };

export default function PartiesPage() {
  const { db, setDb } = useDB();
  const toast = useToast();
  const [form, setForm] = useState<PartyForm | null>(null);

  const open = (p?: Party) => {
    if (p) {
      const rates: Record<string, string> = {};
      Object.keys(p.rates || {}).forEach(k => { rates[k] = String(p.rates[k]); });
      setForm({
        party_id: p.party_id, party_name: p.party_name, phone: p.phone || '',
        state: p.state, gstin: p.gstin || '', address: p.address || '', rates,
      });
    } else {
      setForm({ ...EMPTY, rates: {} });
    }
  };

  const save = () => {
    if (!form) return;
    if (!form.party_name || !form.state) { toast('Party name and state are required', 'error'); return; }
    if (form.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(form.gstin)) {
      toast('Invalid GSTIN format', 'error'); return;
    }
    setDb(prev => {
      const next = { ...prev, parties: [...prev.parties] };
      const rates: Record<string, number> = {};
      Object.keys(form.rates).forEach(k => {
        const v = parseFloat(form.rates[k]);
        if (!isNaN(v) && v >= 0 && form.rates[k].trim() !== '') rates[k] = v;
      });
      const data: Party = {
        party_id: form.party_id || (next.parties.length ? Math.max(...next.parties.map(p => p.party_id)) + 1 : 1),
        party_name: form.party_name,
        phone: form.phone,
        state: form.state,
        gstin: form.gstin,
        address: form.address,
        rates,
      };
      if (form.party_id) {
        const i = next.parties.findIndex(p => p.party_id === form.party_id);
        if (i >= 0) next.parties[i] = data;
      } else {
        next.parties.push(data);
      }
      return next;
    });
    toast(form.party_id ? 'Party updated!' : 'Party added!', 'success');
    setForm(null);
  };

  const delParty = (id: number) => {
    const hasSlips = db.slips.some(s => s.party_id === id);
    if (hasSlips && !confirm('This party has existing slips. Deleting will keep slips but remove party. Continue?')) return;
    if (!hasSlips && !confirm('Delete this party?')) return;
    setDb(prev => ({ ...prev, parties: prev.parties.filter(p => p.party_id !== id) }));
    toast('Party deleted', 'warning');
  };

  return (
    <>
      <div className="ph">
        <div>
          <div className="pt">Party Master</div>
          <div className="ps">{db.parties.length} parties registered</div>
        </div>
        <button className="btn btnp" onClick={() => open()}>+ Add Party</button>
      </div>

      <div className="card">
        {db.parties.length === 0 ? (
          <div className="empty"><div className="empty-icon">👤</div>No parties added yet. Add your first customer or buyer!</div>
        ) : (
          <div className="tbl">
            <table>
              <thead>
                <tr><th>Party ID</th><th>Party Name</th><th>Phone</th><th>GSTIN</th><th>Address</th><th>State</th><th>GST Treatment</th><th>Custom Rates</th><th>Total Qty (MT)</th><th>🟢 Paid</th><th>🟡 Pending</th><th>🔴 Debt</th><th>Outstanding</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {db.parties.map(p => {
                  const pSlips = db.slips.filter(s => s.party_id === p.party_id);
                  const pQty = pSlips.reduce((a, s) => a + s.quantity, 0);
                  const pPaid = pSlips.filter(s => s.payment_status === 'paid').reduce((a, s) => a + s.final_amount, 0);
                  const pPend = pSlips.filter(s => s.payment_status === 'pending').reduce((a, s) => a + s.final_amount, 0);
                  const pDebt = pSlips.filter(s => s.payment_status === 'debt').reduce((a, s) => a + s.final_amount, 0);
                  const outstanding = pPend + pDebt;
                  return (
                    <tr key={p.party_id}>
                      <td className="mono" style={{ fontSize: 11 }}>P-{p.party_id}</td>
                      <td style={{ fontWeight: 700 }}>{p.party_name}</td>
                      <td className="mono" style={{ fontSize: 11 }}>{p.phone || '—'}</td>
                      <td className="mono" style={{ fontSize: 11 }}>{p.gstin || '—'}</td>
                      <td style={{ fontSize: 11, color: 'var(--text2)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.address || ''}>{p.address || '—'}</td>
                      <td><span className="tag-chip">{p.state}</span></td>
                      <td><span className={`badge ${gstTypeBadge(p.state)}`}>{gstTypeLabel(p.state)}</span></td>
                      <td style={{ fontSize: 11 }}>
                        {p.rates && Object.keys(p.rates).length > 0
                          ? db.materials.filter(m => p.rates[String(m.id)] != null).map(m => (
                            <span key={m.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: 'var(--accent-light)', border: '1px solid #b8d8c4', borderRadius: 4, padding: '2px 6px', margin: 1, fontSize: 10.5, fontWeight: 700, color: 'var(--accent)' }}>
                              {m.material_name}: ₹{p.rates[String(m.id)]}
                            </span>))
                          : <span style={{ color: 'var(--text3)' }}>Default</span>}
                      </td>
                      <td className="mono" style={{ fontSize: 11 }}>{(pQty / 1000).toFixed(4)} MT<div style={{ fontSize: 10, color: 'var(--text3)' }}>{fmt2(pQty)} CFT</div></td>
                      <td className="tx-cr">₹{fmt(pPaid)}</td>
                      <td className="tx-pd">₹{fmt(pPend)}</td>
                      <td className="tx-dr">₹{fmt(pDebt)}</td>
                      <td style={{ fontWeight: 800, color: outstanding > 0 ? 'var(--red)' : 'var(--green)' }}>₹{fmt(outstanding)} {outstanding > 0 ? '🔺' : '✓'}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn btn-sm" onClick={() => open(p)}>Edit</button>
                        <button className="btn btn-sm" onClick={() => delParty(p.party_id)} style={{ color: 'var(--red)', borderColor: 'var(--red)', marginLeft: 4 }}>Delete</button>
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
        <Modal title={form.party_id ? 'Edit Party' : 'Add Party'} onClose={() => setForm(null)}>
          <div className="fg-row">
            <label className="flbl">Party / Customer Name <span className="req">*</span></label>
            <input value={form.party_name} onChange={e => setForm({ ...form, party_name: e.target.value })} placeholder="Full company or individual name" />
          </div>
          <div className="fg-row">
            <label className="flbl">Phone Number <span style={{ color: 'var(--text3)' }}>(for WhatsApp/SMS)</span></label>
            <input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="98765XXXXX" />
          </div>
          <div className="fg-row">
            <label className="flbl">GSTIN <span style={{ color: 'var(--text3)' }}>(optional)</span></label>
            <input className="mono" value={form.gstin} onChange={e => setForm({ ...form, gstin: e.target.value.toUpperCase() })} placeholder="e.g. 03AABCU9603R1ZX" />
            <div className="field-hint">15-digit GST Identification Number of the buyer</div>
          </div>
          <div className="fg-row">
            <label className="flbl">Business Address <span style={{ color: 'var(--text3)' }}>(optional)</span></label>
            <textarea rows={2} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="e.g. Village/Colony, District, State – 141001" style={{ resize: 'vertical' }} />
            <div className="field-hint">Appears on invoices under Bill To section</div>
          </div>
          <div className="fg-row">
            <label className="flbl">State <span className="req">*</span></label>
            <select value={form.state} onChange={e => setForm({ ...form, state: e.target.value })}>
              {STATES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <div className="field-hint">Punjab = CGST+SGST, Other states = IGST</div>
          </div>
          <div style={{ marginTop: 4 }}>
            <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 10, color: 'var(--accent)' }}>Party-Specific Rates (₹/CFT)</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 10 }}>Leave blank to use the material's default rate. These rates auto-fill when this party is selected.</div>
            {db.materials.map(m => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, minWidth: 90 }}>{m.material_name}</span>
                <span style={{ fontSize: 11, color: 'var(--text3)', minWidth: 70 }}>Default: ₹{m.rate || 0}/CFT</span>
                <input type="number" min="0" step="0.01" value={form.rates[String(m.id)] || ''}
                  onChange={e => setForm({ ...form, rates: { ...form.rates, [String(m.id)]: e.target.value } })}
                  placeholder="Party rate" style={{ padding: '5px 8px', fontSize: 12, width: 110 }} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn btnp" style={{ flex: 1 }} onClick={save}>{form.party_id ? 'Update Party' : 'Add Party'}</button>
            <button className="btn" onClick={() => setForm(null)}>Cancel</button>
          </div>
        </Modal>
      )}
    </>
  );
}
