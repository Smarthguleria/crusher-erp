'use client';

import { useMemo, useState } from 'react';
import { useDB } from '@/store/DBContext';
import { useToast } from '@/store/ToastContext';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import NumberInput from '@/components/NumberInput';
import { fmt, isPositiveNumber, partyBalance, paymentModeLabel, today, totalBalance } from '@/lib/helpers';
import type { LedgerEntry, PaymentMode } from '@/lib/types';

export default function LedgerPage() {
  const { db, setDb } = useDB();
  const toast = useToast();
  const [showModal, setShowModal] = useState(false);
  const [pid, setPid] = useState('');
  const [type, setType] = useState<'credit' | 'debit'>('credit');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode | ''>('');
  const [confirmDel, setConfirmDel] = useState<LedgerEntry | null>(null);

  const bal = totalBalance(db);
  const cr = db.ledger.filter(e => e.type === 'credit').reduce((a, e) => a + e.amount, 0);
  const dr = db.ledger.filter(e => e.type === 'debit').reduce((a, e) => a + e.amount, 0);

  // Compute running balance per row in chronological order, then reverse for display.
  const ledgerWithBalance = useMemo(() => {
    const sorted = [...db.ledger].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || a.ledger_id - b.ledger_id);
    let run = 0;
    const out = sorted.map(e => {
      run += e.type === 'credit' ? e.amount : -e.amount;
      return { entry: e, running: run };
    });
    return out.reverse();
  }, [db.ledger]);

  const save = () => {
    if (!pid) { toast('Select a party', 'error'); return; }
    if (!isPositiveNumber(amount)) { toast('Amount must be a positive number', 'error'); return; }
    setDb(prev => {
      const next = { ...prev, ledger: [...prev.ledger], counters: { ...prev.counters } };
      next.counters.ledger += 1;
      next.ledger.push({
        ledger_id: next.counters.ledger,
        party_id: parseInt(pid),
        type,
        amount: parseFloat(amount),
        note: note.trim(),
        date: new Date(date).toISOString(),
        auto: false,
        payment_status: type === 'debit' ? 'paid' : undefined,
        payment_mode: type === 'debit' && paymentMode ? paymentMode : undefined,
      });
      return next;
    });
    setShowModal(false); setPid(''); setAmount(''); setNote(''); setPaymentMode('');
    toast('Transaction saved!', 'success');
  };

  const performDelete = () => {
    if (!confirmDel) return;
    const id = confirmDel.ledger_id;
    setDb(prev => ({ ...prev, ledger: prev.ledger.filter(e => e.ledger_id !== id) }));
    toast('Entry deleted', 'warning');
    setConfirmDel(null);
  };

  return (
    <>
      <div className="ph">
        <div>
          <div className="pt">Credit / Debit Ledger</div>
          <div className="ps">Financial transaction register</div>
        </div>
        <button className="btn btnp" onClick={() => setShowModal(true)}>+ Add Transaction</button>
      </div>

      <div className="g3" style={{ marginBottom: 14 }}>
        <div className="stat stat-green">
          <div className="slbl">Total Credit (Sales)</div>
          <div className="sval-sm tx-cr">₹{fmt(cr)}</div>
          <div className="sval-sub">{db.ledger.filter(e => e.type === 'credit').length} entries</div>
        </div>
        <div className="stat stat-red">
          <div className="slbl">Total Debit (Payments)</div>
          <div className="sval-sm tx-dr">₹{fmt(dr)}</div>
          <div className="sval-sub">{db.ledger.filter(e => e.type === 'debit').length} entries</div>
        </div>
        <div className={`stat ${bal >= 0 ? 'stat-green' : 'stat-red'}`}>
          <div className="slbl">Net Balance</div>
          <div className="sval-sm" style={{ color: bal >= 0 ? 'var(--green)' : 'var(--red)' }}>
            ₹{fmt(Math.abs(bal))} <span style={{ fontSize: 13 }}>{bal >= 0 ? 'CR' : 'DR'}</span>
          </div>
          <div className="sval-sub">{bal >= 0 ? 'Amount receivable' : 'Amount payable'}</div>
        </div>
      </div>

      <div className="g2">
        <div className="card">
          <div className="section-hdr">Party-wise Balance</div>
          {db.parties.length === 0 ? (
            <div className="empty"><div className="empty-icon">👤</div>No parties yet</div>
          ) : db.parties.map(p => {
            const b = partyBalance(db, p.party_id);
            const pSlips = db.slips.filter(s => s.party_id === p.party_id);
            const pPaid = pSlips.filter(s => s.payment_status === 'paid').reduce((a, s) => a + s.final_amount, 0);
            const pPend = pSlips.filter(s => s.payment_status === 'pending').reduce((a, s) => a + s.final_amount, 0);
            const pDebt = pSlips.filter(s => s.payment_status === 'debt').reduce((a, s) => a + s.final_amount, 0);
            return (
              <div key={p.party_id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{p.party_name}</span>
                    <span className="tag-chip" style={{ marginLeft: 6 }}>{p.state}</span>
                    {p.gst_enabled === false && <span className="tag-chip" style={{ marginLeft: 4, background: '#FEF6E0', color: '#9A5A10' }}>No GST</span>}
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 14, color: b >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    ₹{fmt(Math.abs(b))} <span style={{ fontSize: 11 }}>{b >= 0 ? 'CR' : 'DR'}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10.5, background: '#E3F2E9', color: '#1A6B35', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>🟢 ₹{fmt(pPaid)}</span>
                  <span style={{ fontSize: 10.5, background: '#FEF6E0', color: '#9A5A10', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>🟡 ₹{fmt(pPend)}</span>
                  <span style={{ fontSize: 10.5, background: '#FEECEB', color: '#8B2222', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>🔴 ₹{fmt(pDebt)}</span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="card">
          <div className="section-hdr">Transaction Log</div>
          {db.ledger.length === 0 ? (
            <div className="empty"><div className="empty-icon">📝</div>No transactions yet</div>
          ) : (
            <div className="tbl" style={{ maxHeight: 480, overflowY: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Date</th><th>Ref</th><th>Party</th><th>Note</th>
                    <th>Type</th><th>Amount</th><th>Mode</th><th>Balance</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerWithBalance.map(({ entry: e, running }) => {
                    const p = db.parties.find(x => x.party_id === e.party_id);
                    const ref = e.invoice_id ? `INV-${e.invoice_id}` : e.slip_id ? `#${e.slip_id}` : '—';
                    return (
                      <tr key={e.ledger_id}>
                        <td style={{ fontSize: 10.5, color: 'var(--text3)', whiteSpace: 'nowrap' }}>{new Date(e.date).toLocaleDateString('en-IN')}</td>
                        <td className="mono" style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text2)' }}>{ref}</td>
                        <td style={{ fontSize: 12, fontWeight: 500 }}>{p?.party_name || '—'}</td>
                        <td style={{ fontSize: 10.5, color: 'var(--text3)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.note || ''}>{e.note || '—'}</td>
                        <td><span className={`badge ${e.type === 'credit' ? 'bg' : 'br'}`}>{e.type === 'credit' ? 'CR' : 'DR'}</span></td>
                        <td className={e.type === 'credit' ? 'tx-cr' : 'tx-dr'} style={{ whiteSpace: 'nowrap', fontWeight: 700 }}>₹{fmt(e.amount)}</td>
                        <td style={{ fontSize: 10.5, color: 'var(--text2)' }}>
                          {e.type === 'debit' ? paymentModeLabel(e.payment_mode) : (e.payment_mode ? paymentModeLabel(e.payment_mode) : '—')}
                        </td>
                        <td style={{ whiteSpace: 'nowrap', fontWeight: 700, color: running >= 0 ? 'var(--green)' : 'var(--red)' }}>
                          ₹{fmt(Math.abs(running))} {running >= 0 ? 'CR' : 'DR'}
                        </td>
                        <td>{!e.auto
                          ? <button className="btn btn-xs" onClick={() => setConfirmDel(e)} style={{ color: 'var(--red)', borderColor: 'var(--red)' }}>✕</button>
                          : <span style={{ color: 'var(--text3)', fontSize: 11 }}>auto</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <Modal title="Add Manual Transaction" onClose={() => setShowModal(false)}>
          <div className="fg-row">
            <label className="flbl">Party <span className="req">*</span></label>
            <select value={pid} onChange={e => setPid(e.target.value)}>
              <option value="">— Select Party —</option>
              {db.parties.map(p => <option key={p.party_id} value={p.party_id}>{p.party_name}</option>)}
            </select>
          </div>
          <div className="fg-row">
            <label className="flbl">Transaction Type</label>
            <select value={type} onChange={e => setType(e.target.value as any)}>
              <option value="credit">Credit — Sale / Amount Receivable</option>
              <option value="debit">Debit — Payment Received / Expense</option>
            </select>
          </div>
          <div className="g2">
            <div className="fg-row">
              <label className="flbl">Amount (₹) <span className="req">*</span></label>
              <NumberInput mode="decimal" value={amount} onChange={setAmount} placeholder="0.00" />
            </div>
            <div className="fg-row">
              <label className="flbl">Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>
          {type === 'debit' && (
            <div className="fg-row">
              <label className="flbl">Payment Mode</label>
              <select value={paymentMode} onChange={e => setPaymentMode(e.target.value as any)}>
                <option value="">— Optional —</option>
                <option value="cash">💵 Cash</option>
                <option value="online">🏦 Online</option>
              </select>
            </div>
          )}
          <div className="fg-row">
            <label className="flbl">Note / Description</label>
            <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Payment received for Slip #1001" />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn btnp" style={{ flex: 1 }} onClick={save}>Save Transaction</button>
            <button className="btn" onClick={() => setShowModal(false)}>Cancel</button>
          </div>
        </Modal>
      )}

      {confirmDel && (
        <ConfirmDialog
          title="Delete this transaction?"
          message={`Delete this ${confirmDel.type === 'credit' ? 'credit' : 'debit'} entry of ₹${fmt(confirmDel.amount)}?\n\nThis cannot be undone.`}
          confirmLabel="Delete entry"
          danger
          onConfirm={performDelete}
          onCancel={() => setConfirmDel(null)}
        />
      )}
    </>
  );
}
