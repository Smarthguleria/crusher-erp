'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useDB } from '@/store/DBContext';
import { useToast } from '@/store/ToastContext';
import InvoiceDocument from '@/components/InvoiceDocument';
import SharePanel from '@/components/SharePanel';
import ConfirmDialog from '@/components/ConfirmDialog';
import Modal from '@/components/Modal';
import PaymentSelector from '@/components/PaymentSelector';
import { payClass, payLabel } from '@/lib/helpers';
import type { PaymentStatus, PaymentMode, Invoice } from '@/lib/types';

export default function InvoiceViewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = parseInt(params?.id || '0');
  const { db, setDb, ready } = useDB();
  const toast = useToast();

  const [confirmDel, setConfirmDel] = useState(false);
  const [editing, setEditing] = useState(false);

  if (!ready) {
    return <div className="empty"><div className="empty-icon">⏳</div>Loading invoice…</div>;
  }

  const inv = db.invoices.find(x => x.invoice_id === id);
  if (!inv) {
    return (
      <div className="ph">
        <div>
          <div className="pt">Invoice not found</div>
          <div className="ps">No invoice with ID {id} exists in this workspace.</div>
        </div>
        <Link href="/invoices" className="btn">← All Invoices</Link>
      </div>
    );
  }

  const party = db.parties.find(p => p.party_id === inv.party_id);
  const ps = inv.payment_status || 'pending';

  const performDelete = () => {
    setDb(prev => {
      const next = { ...prev, invoices: [...prev.invoices], slips: [...prev.slips], ledger: [...prev.ledger] };
      // Remove the invoice.
      next.invoices = next.invoices.filter(i => i.invoice_id !== inv.invoice_id);
      // Mark linked slip as un-invoiced again so the user can re-issue if needed.
      const linkedSlip = next.slips.find(s => s.slip_id === inv.slip_id);
      if (linkedSlip) linkedSlip.invoiced = false;
      // Strip invoice_id reference from any auto ledger entries (slip credit/debit live on
      // the slip, not the invoice — they survive). But ledger entries that exist ONLY
      // because of the invoice (no slip_id) get fully removed.
      next.ledger = next.ledger.map(l => {
        if (l.auto && l.invoice_id === inv.invoice_id && l.slip_id) {
          // Slip-tied ledger row: rewrite the note to drop the invoice reference.
          const cleaned = { ...l, invoice_id: undefined };
          if (l.note?.startsWith('Invoice INV-')) {
            cleaned.note = `Slip #${l.slip_id} (invoice removed) [${payLabel(l.payment_status || 'pending')}]`;
          } else if (l.note?.startsWith('Payment received — INV-')) {
            cleaned.note = `Payment received — Slip #${l.slip_id}`;
          }
          return cleaned;
        }
        return l;
      }).filter(l => !(l.auto && l.invoice_id === inv.invoice_id && !l.slip_id));
      return next;
    });
    toast(`Invoice INV-${inv.invoice_id} deleted. Linked slip is now un-invoiced.`, 'warning', 5000);
    router.replace('/invoices');
  };

  return (
    <>
      <div className="ph no-print">
        <div>
          <div className="pt">Invoice INV-{inv.invoice_id}</div>
          <div className="ps">{new Date(inv.date).toLocaleString('en-IN')}{party ? ` · ${party.party_name}` : ''}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/invoices" className="btn">← All Invoices</Link>
          <span className={`ps-pill ${payClass(ps)}`} style={{ alignSelf: 'center' }}>{payLabel(ps)}</span>
          <button className="btn" onClick={() => setEditing(true)}>✏ Edit Status</button>
          <button className="btn btnp" onClick={() => window.print()}>🖨 Print / Download PDF</button>
          <button className="btn btnr" onClick={() => setConfirmDel(true)}>🗑 Delete</button>
        </div>
      </div>
      <InvoiceDocument inv={inv} />
      <div className="no-print" style={{ maxWidth: 900, margin: '20px auto 0' }}><SharePanel obj={inv} /></div>

      {confirmDel && (
        <ConfirmDialog
          title="Delete this invoice?"
          message={`Permanently delete INV-${inv.invoice_id}?\n\nThe linked slip (#${inv.slip_id}) will be marked un-invoiced so you can re-issue. The slip's ledger entries are preserved. This cannot be undone.`}
          confirmLabel="Delete invoice"
          danger
          onConfirm={performDelete}
          onCancel={() => setConfirmDel(false)}
        />
      )}

      {editing && (
        <InvoiceEditModal inv={inv} onClose={() => setEditing(false)} />
      )}
    </>
  );
}

function InvoiceEditModal({ inv, onClose }: { inv: Invoice; onClose: () => void }) {
  const { setDb } = useDB();
  const toast = useToast();
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(inv.payment_status || 'pending');
  const [paymentMode, setPaymentMode] = useState<PaymentMode | null>(inv.payment_mode ?? null);

  const save = () => {
    if (paymentStatus === 'paid' && !paymentMode) { toast('Select Payment Mode', 'error'); return; }

    setDb(prev => {
      const next = { ...prev, invoices: [...prev.invoices], slips: [...prev.slips], ledger: [...prev.ledger], counters: { ...prev.counters } };
      const i = next.invoices.find(x => x.invoice_id === inv.invoice_id);
      const s = next.slips.find(x => x.slip_id === inv.slip_id);
      if (!i) return prev;
      const oldStatus = i.payment_status;
      i.payment_status = paymentStatus;
      i.payment_mode = paymentStatus === 'paid' && paymentMode ? paymentMode : undefined;
      if (s) {
        s.payment_status = paymentStatus;
        s.payment_mode = i.payment_mode;
      }

      // Sync sale credit row.
      const credit = next.ledger.find(l => l.auto && l.type === 'credit' && l.invoice_id === inv.invoice_id) ||
                     next.ledger.find(l => l.auto && l.type === 'credit' && l.slip_id === inv.slip_id);
      if (credit) {
        credit.payment_status = paymentStatus;
        credit.payment_mode = i.payment_mode;
        credit.invoice_id = inv.invoice_id;
      }

      // Reconcile the receipt debit (one and only one if status=paid, else zero).
      const existingDebit = next.ledger.find(l => l.auto && l.type === 'debit' && (l.invoice_id === inv.invoice_id || l.slip_id === inv.slip_id));
      if (paymentStatus === 'paid' && oldStatus !== 'paid') {
        next.counters.ledger += 1;
        next.ledger.push({
          ledger_id: next.counters.ledger,
          party_id: inv.party_id,
          type: 'debit',
          amount: inv.final_amount,
          note: `Payment received — INV-${inv.invoice_id}`,
          date: new Date().toISOString(),
          slip_id: inv.slip_id,
          invoice_id: inv.invoice_id,
          auto: true,
          payment_status: 'paid',
          payment_mode: i.payment_mode,
        });
      } else if (paymentStatus === 'paid' && existingDebit) {
        existingDebit.payment_mode = i.payment_mode;
        existingDebit.invoice_id = inv.invoice_id;
      } else if (paymentStatus !== 'paid' && existingDebit) {
        next.ledger = next.ledger.filter(l => l.ledger_id !== existingDebit.ledger_id);
      }

      return next;
    });
    toast('Invoice updated', 'success');
    onClose();
  };

  return (
    <Modal title={`Edit Invoice INV-${inv.invoice_id}`} onClose={onClose}>
      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>
        Amount, quantity and tax are sourced from the linked slip. To change those, edit the slip.
      </div>
      <div className="fg-row">
        <label className="flbl">Payment Status <span className="req">*</span></label>
        <PaymentSelector
          value={paymentStatus}
          onChange={s => { setPaymentStatus(s); if (s !== 'paid') setPaymentMode(null); }}
          mode={paymentMode}
          onModeChange={setPaymentMode}
        />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button className="btn btnp" style={{ flex: 1 }} onClick={save}>Save changes</button>
        <button className="btn" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}
