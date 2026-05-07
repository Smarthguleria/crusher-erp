'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useDB } from '@/store/DBContext';
import { useToast } from '@/store/ToastContext';
import SlipDocument from '@/components/SlipDocument';
import SharePanel from '@/components/SharePanel';
import ConfirmDialog from '@/components/ConfirmDialog';
import Modal from '@/components/Modal';
import PaymentSelector from '@/components/PaymentSelector';
import NumberInput from '@/components/NumberInput';
import { calcGST, isPositiveNumber, payClass, payLabel } from '@/lib/helpers';
import type { PaymentStatus, PaymentMode, Slip } from '@/lib/types';

export default function SlipViewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = parseInt(params?.id || '0');
  const { db, setDb, ready } = useDB();
  const toast = useToast();

  const [confirmDel, setConfirmDel] = useState(false);
  const [editing, setEditing] = useState(false);

  if (!ready) {
    return <div className="empty"><div className="empty-icon">⏳</div>Loading slip…</div>;
  }

  const slip = db.slips.find(x => x.slip_id === id);
  if (!slip) {
    return (
      <div className="ph">
        <div>
          <div className="pt">Slip not found</div>
          <div className="ps">No slip with ID {id} exists in this workspace.</div>
        </div>
        <Link href="/slips" className="btn">← All Slips</Link>
      </div>
    );
  }

  const party = db.parties.find(p => p.party_id === slip.party_id);
  const ps = slip.payment_status || 'pending';

  const performDelete = () => {
    if (slip.invoiced) {
      toast(`Cannot delete Slip #${slip.slip_id} — it is linked to an invoice. Delete the invoice first.`, 'error', 6000);
      setConfirmDel(false);
      return;
    }
    setDb(prev => ({
      ...prev,
      slips: prev.slips.filter(s => s.slip_id !== slip.slip_id),
      // Cascade: drop all auto ledger entries (credit + receipt debit) tied to this slip.
      ledger: prev.ledger.filter(l => !(l.auto && l.slip_id === slip.slip_id)),
    }));
    toast(`Slip #${slip.slip_id} deleted`, 'warning');
    router.replace('/slips');
  };

  return (
    <>
      <div className="ph no-print">
        <div>
          <div className="pt">Slip #{slip.slip_id}</div>
          <div className="ps">{new Date(slip.date).toLocaleString('en-IN')}{party ? ` · ${party.party_name}` : ''}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/slips" className="btn">← All Slips</Link>
          {!slip.invoiced && (
            <Link href={`/invoice?slip=${slip.slip_id}`} className="btn btnb">Generate Invoice</Link>
          )}
          <span className={`ps-pill ${payClass(ps)}`} style={{ alignSelf: 'center' }}>{payLabel(ps)}</span>
          <button className="btn" onClick={() => setEditing(true)}>✏ Edit</button>
          <button className="btn btnp" onClick={() => window.print()}>🖨 Print / Download PDF</button>
          <button className="btn btnr" onClick={() => setConfirmDel(true)} disabled={slip.invoiced} title={slip.invoiced ? 'Delete linked invoice first' : ''}>
            🗑 Delete
          </button>
        </div>
      </div>
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <SlipDocument slip={slip} />
      </div>
      <div className="no-print" style={{ maxWidth: 600, margin: '20px auto 0' }}><SharePanel obj={slip} /></div>

      {confirmDel && (
        <ConfirmDialog
          title="Delete this slip?"
          message={`Permanently delete Slip #${slip.slip_id}?\n\nLinked auto ledger entries (sale credit${ps === 'paid' ? ' and payment receipt' : ''}) will also be removed. This cannot be undone.`}
          confirmLabel="Delete slip"
          danger
          onConfirm={performDelete}
          onCancel={() => setConfirmDel(false)}
        />
      )}

      {editing && (
        <SlipEditModal slip={slip} onClose={() => setEditing(false)} />
      )}
    </>
  );
}

function SlipEditModal({ slip, onClose }: { slip: Slip; onClose: () => void }) {
  const { db, setDb } = useDB();
  const toast = useToast();

  const [vehicle, setVehicle] = useState(slip.vehicle_number);
  const [driver, setDriver] = useState(slip.driver_name || '');
  const [qty, setQty] = useState(String(slip.quantity));
  const [rate, setRate] = useState(String(slip.rate));
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(slip.payment_status || 'pending');
  const [paymentMode, setPaymentMode] = useState<PaymentMode | null>(slip.payment_mode ?? null);
  const [gstEnabled, setGstEnabled] = useState(slip.gst_enabled !== false);

  const save = () => {
    if (!vehicle.trim()) { toast('Vehicle number required', 'error'); return; }
    if (!isPositiveNumber(qty)) { toast('Quantity must be positive', 'error'); return; }
    if (!isPositiveNumber(rate)) { toast('Rate must be positive', 'error'); return; }
    if (paymentStatus === 'paid' && !paymentMode) { toast('Select Payment Mode', 'error'); return; }

    const qtyN = parseFloat(qty);
    const rateN = parseFloat(rate);

    setDb(prev => {
      const next = { ...prev, slips: [...prev.slips], invoices: [...prev.invoices], ledger: [...prev.ledger], counters: { ...prev.counters } };
      const s = next.slips.find(x => x.slip_id === slip.slip_id);
      if (!s) return prev;
      const oldStatus = s.payment_status;
      const mat = next.materials.find(m => m.id === s.material_id)!;
      const g = calcGST(qtyN, rateN, mat.gst_percent, s.party_state, gstEnabled);

      s.vehicle_number = vehicle.toUpperCase().trim();
      s.driver_name = driver.trim();
      s.quantity = qtyN;
      s.rate = rateN;
      s.gst_percent = gstEnabled ? mat.gst_percent : 0;
      s.gst_enabled = gstEnabled;
      s.base_amount = g.base;
      s.gst_amount = g.gstAmt;
      s.cgst = g.cgst;
      s.sgst = g.sgst;
      s.igst = g.igst;
      s.final_amount = g.final;
      s.payment_status = paymentStatus;
      s.payment_mode = paymentStatus === 'paid' && paymentMode ? paymentMode : undefined;

      // Update existing slip credit + linked invoice (if any) so amounts stay consistent.
      const credit = next.ledger.find(l => l.auto && l.type === 'credit' && l.slip_id === s.slip_id);
      if (credit) {
        credit.amount = g.final;
        credit.payment_status = paymentStatus;
        credit.payment_mode = s.payment_mode;
        credit.note = `Slip #${s.slip_id} — ${mat.material_name} ${qtyN} CFT [${payLabel(paymentStatus)}]`;
      }

      // Reconcile receipt debit against new status.
      const existingDebit = next.ledger.find(l => l.auto && l.type === 'debit' && l.slip_id === s.slip_id);
      if (paymentStatus === 'paid' && oldStatus !== 'paid') {
        next.counters.ledger += 1;
        next.ledger.push({
          ledger_id: next.counters.ledger,
          party_id: s.party_id,
          type: 'debit',
          amount: g.final,
          note: `Payment received — Slip #${s.slip_id}`,
          date: new Date().toISOString(),
          slip_id: s.slip_id,
          auto: true,
          payment_status: 'paid',
          payment_mode: s.payment_mode,
        });
      } else if (paymentStatus === 'paid' && existingDebit) {
        existingDebit.amount = g.final;
        existingDebit.payment_mode = s.payment_mode;
      } else if (paymentStatus !== 'paid' && existingDebit) {
        next.ledger = next.ledger.filter(l => l.ledger_id !== existingDebit.ledger_id);
      }

      // If invoiced, also update the linked invoice numbers.
      const linkedInv = next.invoices.find(i => i.slip_id === s.slip_id);
      if (linkedInv) {
        linkedInv.quantity = qtyN;
        linkedInv.rate = rateN;
        linkedInv.gst_percent = s.gst_percent;
        linkedInv.gst_enabled = gstEnabled;
        linkedInv.base_amount = g.base;
        linkedInv.gst_amount = g.gstAmt;
        linkedInv.cgst = g.cgst;
        linkedInv.sgst = g.sgst;
        linkedInv.igst = g.igst;
        linkedInv.final_amount = g.final;
        linkedInv.payment_status = paymentStatus;
        linkedInv.payment_mode = s.payment_mode;
        linkedInv.vehicle_number = s.vehicle_number;
        linkedInv.driver_name = s.driver_name;
      }

      return next;
    });
    toast('Slip updated', 'success');
    onClose();
  };

  return (
    <Modal title={`Edit Slip #${slip.slip_id}`} onClose={onClose}>
      <div className="g2">
        <div className="fg-row">
          <label className="flbl">Vehicle Number <span className="req">*</span></label>
          <input value={vehicle} onChange={e => setVehicle(e.target.value.toUpperCase())} />
        </div>
        <div className="fg-row">
          <label className="flbl">Driver Name</label>
          <input value={driver} onChange={e => setDriver(e.target.value)} />
        </div>
      </div>
      <div className="g2">
        <div className="fg-row">
          <label className="flbl">Quantity (CFT) <span className="req">*</span></label>
          <NumberInput mode="decimal" value={qty} onChange={setQty} />
        </div>
        <div className="fg-row">
          <label className="flbl">Rate (₹/CFT) <span className="req">*</span></label>
          <NumberInput mode="decimal" value={rate} onChange={setRate} />
        </div>
      </div>
      <div className="fg-row">
        <label className="flbl">GST Treatment</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <label style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, padding: 8, border: `1.5px solid ${gstEnabled ? 'var(--accent3)' : 'var(--border)'}`, borderRadius: 'var(--r)', cursor: 'pointer', fontSize: 12.5, fontWeight: 700 }}>
            <input type="radio" checked={gstEnabled} onChange={() => setGstEnabled(true)} style={{ width: 'auto' }} /> With GST
          </label>
          <label style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, padding: 8, border: `1.5px solid ${!gstEnabled ? 'var(--accent3)' : 'var(--border)'}`, borderRadius: 'var(--r)', cursor: 'pointer', fontSize: 12.5, fontWeight: 700 }}>
            <input type="radio" checked={!gstEnabled} onChange={() => setGstEnabled(false)} style={{ width: 'auto' }} /> Without GST
          </label>
        </div>
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
