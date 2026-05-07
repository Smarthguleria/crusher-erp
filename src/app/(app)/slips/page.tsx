'use client';

import Link from 'next/link';
import { Fragment, useMemo, useState } from 'react';
import { useDB } from '@/store/DBContext';
import { useToast } from '@/store/ToastContext';
import DateFilter from '@/components/DateFilter';
import SharePanel from '@/components/SharePanel';
import ConfirmDialog from '@/components/ConfirmDialog';
import { dateRangeFilter, fmt, fmt2, payClass, payLabel, paymentModeLabel, today } from '@/lib/helpers';
import type { PaymentStatus } from '@/lib/types';

export default function SlipsPage() {
  const { db, setDb } = useDB();
  const toast = useToast();
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(today());
  const [search, setSearch] = useState('');
  const [payFilter, setPayFilter] = useState('all');
  const [matFilter, setMatFilter] = useState('all');
  const [openShare, setOpenShare] = useState<number | null>(null);
  const [confirmDel, setConfirmDel] = useState<{ slip_id: number; final_amount: number; ps: PaymentStatus } | null>(null);

  const performDelete = () => {
    if (!confirmDel) return;
    const id = confirmDel.slip_id;
    setDb(prev => ({
      ...prev,
      slips: prev.slips.filter(s => s.slip_id !== id),
      ledger: prev.ledger.filter(l => !(l.auto && l.slip_id === id)),
    }));
    toast(`Slip #${id} deleted`, 'warning');
    setConfirmDel(null);
  };

  const filtered = useMemo(() => {
    let f = dateRangeFilter(db.slips, from, to);
    if (payFilter !== 'all') f = f.filter(s => s.payment_status === payFilter);
    if (matFilter !== 'all') f = f.filter(s => s.material_id === parseInt(matFilter));
    const q = search.toLowerCase();
    if (q) f = f.filter(s => {
      const p = db.parties.find(x => x.party_id === s.party_id);
      return s.vehicle_number.toLowerCase().includes(q) ||
        (p?.party_name || '').toLowerCase().includes(q) ||
        String(s.slip_id).includes(q);
    });
    return f;
  }, [db.slips, db.parties, from, to, search, payFilter, matFilter]);

  const paidTotal = filtered.filter(s => s.payment_status === 'paid').reduce((a, s) => a + s.final_amount, 0);
  const pendTotal = filtered.filter(s => s.payment_status === 'pending').reduce((a, s) => a + s.final_amount, 0);
  const debtTotal = filtered.filter(s => s.payment_status === 'debt').reduce((a, s) => a + s.final_amount, 0);

  const changeStatus = (slipId: number, newStatus: PaymentStatus) => {
    setDb(prev => {
      const next = { ...prev, slips: [...prev.slips], invoices: [...prev.invoices], ledger: [...prev.ledger], counters: { ...prev.counters } };
      const s = next.slips.find(x => x.slip_id === slipId);
      if (!s) return prev;
      const old = s.payment_status;
      s.payment_status = newStatus;
      if (newStatus !== 'paid') s.payment_mode = undefined;

      // Sync linked invoice + sale-credit row.
      const linkedInv = next.invoices.find(i => i.slip_id === slipId);
      if (linkedInv) {
        linkedInv.payment_status = newStatus;
        if (newStatus !== 'paid') linkedInv.payment_mode = undefined;
      }
      const credit = next.ledger.find(l => l.auto && l.type === 'credit' && l.slip_id === slipId);
      if (credit) {
        credit.payment_status = newStatus;
        if (newStatus !== 'paid') credit.payment_mode = undefined;
      }

      // Reconcile receipt debit.
      const existingDebit = next.ledger.find(l => l.auto && l.type === 'debit' && l.slip_id === slipId);
      if (newStatus === 'paid' && old !== 'paid') {
        next.counters.ledger += 1;
        next.ledger.push({
          ledger_id: next.counters.ledger,
          party_id: s.party_id,
          type: 'debit',
          amount: s.final_amount,
          note: `Payment received — Slip #${s.slip_id}`,
          date: new Date().toISOString(),
          slip_id: s.slip_id,
          invoice_id: linkedInv?.invoice_id,
          auto: true,
          payment_status: 'paid',
        });
        toast('Inline change set status to Paid. Open the slip to set Cash/Online mode.', 'warning', 4500);
      } else if (newStatus !== 'paid' && existingDebit) {
        next.ledger = next.ledger.filter(l => l.ledger_id !== existingDebit.ledger_id);
      }
      return next;
    });
    toast(`Slip #${slipId} → ${payLabel(newStatus)}`, 'success');
  };

  return (
    <>
      <div className="ph">
        <div>
          <div className="pt">All Slips</div>
          <div className="ps">{db.slips.length} total records</div>
        </div>
        <Link href="/slip" className="btn btnp">+ New Slip</Link>
      </div>

      <div className="g3" style={{ marginBottom: 14 }}>
        <div className="stat stat-green"><div className="slbl">🟢 Paid</div><div className="sval-sm tx-cr">₹{fmt(paidTotal)}</div><div className="sval-sub">{filtered.filter(s => s.payment_status === 'paid').length} slips</div></div>
        <div className="stat stat-amber"><div className="slbl">🟡 Pending</div><div className="sval-sm tx-pd">₹{fmt(pendTotal)}</div><div className="sval-sub">{filtered.filter(s => s.payment_status === 'pending').length} slips</div></div>
        <div className="stat stat-red"><div className="slbl">🔴 Debt</div><div className="sval-sm tx-dr">₹{fmt(debtTotal)}</div><div className="sval-sub">{filtered.filter(s => s.payment_status === 'debt').length} slips</div></div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <DateFilter onChange={(f, t) => { setFrom(f); setTo(t); }} />
      </div>
      <div className="filter-bar">
        <div className="search-wrap" style={{ flex: 1, minWidth: 180 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by slip#, vehicle, party..." />
        </div>
        <select value={payFilter} onChange={e => setPayFilter(e.target.value)} style={{ width: 130 }}>
          <option value="all">All Payments</option>
          <option value="paid">🟢 Paid</option>
          <option value="pending">🟡 Pending</option>
          <option value="debt">🔴 Debt</option>
        </select>
        <select value={matFilter} onChange={e => setMatFilter(e.target.value)} style={{ width: 140 }}>
          <option value="all">All Materials</option>
          {db.materials.map(m => <option key={m.id} value={m.id}>{m.material_name}</option>)}
        </select>
      </div>

      <div className="card">
        {db.slips.length === 0 ? (
          <div className="empty"><div className="empty-icon">📋</div>No slips yet. Generate your first slip!</div>
        ) : (
          <div className="tbl">
            <table>
              <thead>
                <tr><th>Slip #</th><th>Date</th><th>Vehicle</th><th>Party</th><th>Material</th><th>Quantity</th><th>Total</th><th>Payment</th><th>Mode</th><th>Invoice</th><th>View</th><th>Share</th><th>Change Status</th><th>Delete</th></tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={14}><div className="empty"><div className="empty-icon">🔍</div>No slips found for selected filters</div></td></tr>
                ) : [...filtered].reverse().map(s => {
                  const p = db.parties.find(x => x.party_id === s.party_id);
                  const m = db.materials.find(x => x.id === s.material_id);
                  const ps = s.payment_status || 'pending';
                  return (
                    <Fragment key={s.slip_id}>
                      <tr>
                        <td className="mono" style={{ fontSize: 11, fontWeight: 700 }}>#{s.slip_id}</td>
                        <td style={{ fontSize: 11, color: 'var(--text3)' }}>{new Date(s.date).toLocaleDateString('en-IN')}</td>
                        <td className="mono" style={{ fontSize: 11 }}>{s.vehicle_number}</td>
                        <td style={{ fontWeight: 600 }}>{p?.party_name || '—'}</td>
                        <td><span className="badge bg">{m?.material_name || '—'}</span></td>
                        <td className="mono" style={{ fontSize: 11 }}>{fmt2(s.quantity)} CFT</td>
                        <td style={{ fontWeight: 700 }}>₹{fmt(s.final_amount)}</td>
                        <td><span className={`ps-pill ${payClass(ps)}`}>{payLabel(ps)}</span></td>
                        <td style={{ fontSize: 11, color: 'var(--text2)' }}>{ps === 'paid' ? paymentModeLabel(s.payment_mode) : '—'}</td>
                        <td><span className={`badge ${s.invoiced ? 'bb' : 'ba'}`}>{s.invoiced ? 'Invoiced' : 'Not Invoiced'}</span></td>
                        <td><Link href={`/slips/${s.slip_id}`} className="btn btn-sm btnp">View</Link></td>
                        <td><button className="btn btn-sm btnwa" onClick={() => setOpenShare(openShare === s.slip_id ? null : s.slip_id)}>Share</button></td>
                        <td>
                          <select value={ps} onChange={e => changeStatus(s.slip_id, e.target.value as PaymentStatus)} style={{ fontSize: 11, padding: '4px 6px', width: 90 }}>
                            <option value="paid">🟢 Paid</option>
                            <option value="pending">🟡 Pending</option>
                            <option value="debt">🔴 Debt</option>
                          </select>
                        </td>
                        <td>
                          <button className="btn btn-xs"
                                  onClick={() => setConfirmDel({ slip_id: s.slip_id, final_amount: s.final_amount, ps })}
                                  disabled={s.invoiced}
                                  title={s.invoiced ? 'Delete linked invoice first' : 'Delete slip'}
                                  style={{ color: 'var(--red)', borderColor: 'var(--red)' }}>✕</button>
                        </td>
                      </tr>
                      {openShare === s.slip_id && (
                        <tr>
                          <td colSpan={14} style={{ padding: '0 12px 12px' }}><SharePanel obj={s} /></td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {confirmDel && (
        <ConfirmDialog
          title="Delete this slip?"
          message={`Permanently delete Slip #${confirmDel.slip_id} (₹${fmt(confirmDel.final_amount)})?\n\nLinked auto ledger entries (sale credit${confirmDel.ps === 'paid' ? ' and payment receipt' : ''}) will also be removed. This cannot be undone.`}
          confirmLabel="Delete slip"
          danger
          onConfirm={performDelete}
          onCancel={() => setConfirmDel(null)}
        />
      )}
    </>
  );
}
