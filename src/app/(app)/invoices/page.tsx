'use client';

import Link from 'next/link';
import { Fragment, useMemo, useState } from 'react';
import { useDB } from '@/store/DBContext';
import { useToast } from '@/store/ToastContext';
import DateFilter from '@/components/DateFilter';
import SharePanel from '@/components/SharePanel';
import ConfirmDialog from '@/components/ConfirmDialog';
import { dateRangeFilter, fmt, payClass, payLabel, paymentModeLabel, today } from '@/lib/helpers';

export default function InvoicesPage() {
  const { db, setDb } = useDB();
  const toast = useToast();
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(today());
  const [search, setSearch] = useState('');
  const [payFilter, setPayFilter] = useState('all');
  const [openShare, setOpenShare] = useState<number | null>(null);
  const [confirmDel, setConfirmDel] = useState<{ invoice_id: number; slip_id: number } | null>(null);

  const performDelete = () => {
    if (!confirmDel) return;
    const { invoice_id, slip_id } = confirmDel;
    setDb(prev => {
      const next = { ...prev, invoices: [...prev.invoices], slips: [...prev.slips], ledger: [...prev.ledger] };
      next.invoices = next.invoices.filter(i => i.invoice_id !== invoice_id);
      const linkedSlip = next.slips.find(s => s.slip_id === slip_id);
      if (linkedSlip) linkedSlip.invoiced = false;
      next.ledger = next.ledger.map(l => {
        if (l.auto && l.invoice_id === invoice_id && l.slip_id) {
          const cleaned = { ...l, invoice_id: undefined };
          if (l.note?.startsWith('Invoice INV-')) cleaned.note = `Slip #${l.slip_id} (invoice removed) [${payLabel(l.payment_status || 'pending')}]`;
          else if (l.note?.startsWith('Payment received — INV-')) cleaned.note = `Payment received — Slip #${l.slip_id}`;
          return cleaned;
        }
        return l;
      }).filter(l => !(l.auto && l.invoice_id === invoice_id && !l.slip_id));
      return next;
    });
    toast(`Invoice INV-${invoice_id} deleted`, 'warning');
    setConfirmDel(null);
  };

  const filtered = useMemo(() => {
    let f = dateRangeFilter(db.invoices, from, to);
    if (payFilter !== 'all') f = f.filter(i => i.payment_status === payFilter);
    const q = search.toLowerCase();
    if (q) f = f.filter(i => {
      const p = db.parties.find(x => x.party_id === i.party_id);
      return (p?.party_name || '').toLowerCase().includes(q) ||
        String(i.invoice_id).includes(q) ||
        i.vehicle_number.toLowerCase().includes(q);
    });
    return f;
  }, [db.invoices, db.parties, from, to, search, payFilter]);

  const total = filtered.reduce((a, i) => a + i.final_amount, 0);
  const paid = filtered.filter(i => i.payment_status === 'paid').reduce((a, i) => a + i.final_amount, 0);
  const pending = filtered.filter(i => i.payment_status === 'pending').reduce((a, i) => a + i.final_amount, 0);

  return (
    <>
      <div className="ph">
        <div>
          <div className="pt">All Invoices</div>
          <div className="ps">{db.invoices.length} total records</div>
        </div>
      </div>

      <div className="g3" style={{ marginBottom: 14 }}>
        <div className="stat stat-accent"><div className="slbl">Total Invoiced</div><div className="sval-sm" style={{ color: 'var(--accent)' }}>₹{fmt(total)}</div><div className="sval-sub">{filtered.length} invoices</div></div>
        <div className="stat stat-green"><div className="slbl">🟢 Paid</div><div className="sval-sm tx-cr">₹{fmt(paid)}</div></div>
        <div className="stat stat-amber"><div className="slbl">🟡 Pending</div><div className="sval-sm tx-pd">₹{fmt(pending)}</div></div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <DateFilter onChange={(f, t) => { setFrom(f); setTo(t); }} />
      </div>
      <div className="filter-bar">
        <div className="search-wrap" style={{ flex: 1, minWidth: 180 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by invoice#, party, vehicle..." />
        </div>
        <select value={payFilter} onChange={e => setPayFilter(e.target.value)} style={{ width: 130 }}>
          <option value="all">All Payments</option>
          <option value="paid">🟢 Paid</option>
          <option value="pending">🟡 Pending</option>
          <option value="debt">🔴 Debt</option>
        </select>
      </div>

      <div className="card">
        {db.invoices.length === 0 ? (
          <div className="empty"><div className="empty-icon">🧾</div>No invoices yet. Generate a slip and convert it to an invoice!</div>
        ) : (
          <div className="tbl">
            <table>
              <thead>
                <tr><th>Invoice #</th><th>Date</th><th>Party</th><th>Material</th><th>Quantity</th><th>Total</th><th>GST Type</th><th>Payment</th><th>Mode</th><th>View</th><th>Share</th><th>Delete</th></tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={12}><div className="empty"><div className="empty-icon">🔍</div>No invoices found for selected filters</div></td></tr>
                ) : [...filtered].reverse().map(inv => {
                  const p = db.parties.find(x => x.party_id === inv.party_id);
                  const m = db.materials.find(x => x.id === inv.material_id);
                  const ip = inv.party_state === 'Punjab';
                  const ps = inv.payment_status || 'pending';
                  const gstOn = inv.gst_enabled !== false;
                  return (
                    <Fragment key={inv.invoice_id}>
                      <tr>
                        <td className="mono" style={{ fontWeight: 700, fontSize: 11 }}>INV-{inv.invoice_id}</td>
                        <td style={{ fontSize: 11, color: 'var(--text3)' }}>{new Date(inv.date).toLocaleDateString('en-IN')}</td>
                        <td style={{ fontWeight: 600 }}>{p?.party_name || '—'}</td>
                        <td><span className="badge bg">{m?.material_name || '—'}</span></td>
                        <td className="mono" style={{ fontSize: 11 }}>{inv.quantity} CFT</td>
                        <td style={{ fontWeight: 700 }}>₹{fmt(inv.final_amount)}</td>
                        <td><span className={`badge ${gstOn ? (ip ? 'bg' : 'bb') : 'badge-gray'}`}>{gstOn ? (ip ? 'CGST+SGST' : 'IGST') : 'No GST'}</span></td>
                        <td><span className={`ps-pill ${payClass(ps)}`}>{payLabel(ps)}</span></td>
                        <td style={{ fontSize: 11, color: 'var(--text2)' }}>{ps === 'paid' ? paymentModeLabel(inv.payment_mode) : '—'}</td>
                        <td><Link href={`/invoices/${inv.invoice_id}`} className="btn btn-sm btnp">View</Link></td>
                        <td><button className="btn btn-sm btnwa" onClick={() => setOpenShare(openShare === inv.invoice_id ? null : inv.invoice_id)}>Share</button></td>
                        <td>
                          <button className="btn btn-xs"
                                  onClick={() => setConfirmDel({ invoice_id: inv.invoice_id, slip_id: inv.slip_id })}
                                  style={{ color: 'var(--red)', borderColor: 'var(--red)' }}>✕</button>
                        </td>
                      </tr>
                      {openShare === inv.invoice_id && (
                        <tr>
                          <td colSpan={12} style={{ padding: '0 12px 12px' }}><SharePanel obj={inv} /></td>
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
          title="Delete this invoice?"
          message={`Permanently delete INV-${confirmDel.invoice_id}?\n\nLinked slip #${confirmDel.slip_id} will be marked un-invoiced. The slip's ledger entries are preserved. This cannot be undone.`}
          confirmLabel="Delete invoice"
          danger
          onConfirm={performDelete}
          onCancel={() => setConfirmDel(null)}
        />
      )}
    </>
  );
}
