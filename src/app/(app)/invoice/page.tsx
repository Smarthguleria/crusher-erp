'use client';

import { useState, useMemo, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useDB } from '@/store/DBContext';
import { useToast } from '@/store/ToastContext';
import PaymentSelector from '@/components/PaymentSelector';
import SharePanel from '@/components/SharePanel';
import InvoiceDocument from '@/components/InvoiceDocument';
import { fmt2, payClass, payLabel } from '@/lib/helpers';
import type { PaymentStatus, PaymentMode, Invoice, LedgerEntry } from '@/lib/types';

function InvoicePageInner() {
  const { db, setDb } = useDB();
  const toast = useToast();
  const params = useSearchParams();
  const initialSlipId = params.get('slip');

  const [slipId, setSlipId] = useState<string>(initialSlipId || '');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('pending');
  const [paymentMode, setPaymentMode] = useState<PaymentMode | null>(null);
  const [generated, setGenerated] = useState<Invoice | null>(null);

  const uninvoiced = useMemo(() => db.slips.filter(s => !s.invoiced), [db.slips]);
  const slip = useMemo(() => db.slips.find(s => s.slip_id === parseInt(slipId)), [db.slips, slipId]);
  const party = slip ? db.parties.find(p => p.party_id === slip.party_id) : null;
  const mat = slip ? db.materials.find(m => m.id === slip.material_id) : null;

  useEffect(() => {
    if (slip) {
      setPaymentStatus(slip.payment_status || 'pending');
      setPaymentMode(slip.payment_mode ?? null);
    }
  }, [slip]);

  const submit = () => {
    if (!slip || !party || !mat) { toast('Please select a slip', 'error'); return; }
    if (paymentStatus === 'paid' && !paymentMode) {
      toast('Select Payment Mode (Cash or Online) when status is Paid.', 'error'); return;
    }

    setDb(prev => {
      const next = {
        ...prev, slips: [...prev.slips], invoices: [...prev.invoices],
        ledger: [...prev.ledger], counters: { ...prev.counters },
      };
      const s = next.slips.find(x => x.slip_id === slip.slip_id)!;
      const oldStatus = s.payment_status;

      // Snapshot payment status + mode onto the slip too — they must agree.
      s.payment_status = paymentStatus;
      s.payment_mode = paymentStatus === 'paid' && paymentMode ? paymentMode : undefined;
      s.invoiced = true;

      next.counters.invoice += 1;
      const inv: Invoice = {
        invoice_id: next.counters.invoice,
        slip_id: s.slip_id,
        party_id: s.party_id,
        material_id: s.material_id,
        base_amount: s.base_amount,
        gst_amount: s.gst_amount,
        cgst: s.cgst,
        sgst: s.sgst,
        igst: s.igst,
        final_amount: s.final_amount,
        gst_percent: s.gst_percent,
        quantity: s.quantity,
        rate: s.rate,
        party_state: s.party_state,
        vehicle_number: s.vehicle_number,
        driver_name: s.driver_name,
        date: new Date().toISOString(),
        payment_status: paymentStatus,
        gst_enabled: s.gst_enabled,
        payment_mode: s.payment_mode,
      };
      next.invoices.push(inv);

      // ─── Ledger dedup ───
      // Slip generation already wrote the sale credit. Invoicing the same slip should NOT
      // create a second credit. Instead, find the existing slip credit (auto, type=credit,
      // slip_id matches) and update its note + status to reflect the invoice.
      const credit = next.ledger.find(
        l => l.auto && l.type === 'credit' && l.slip_id === s.slip_id
      );
      if (credit) {
        credit.note = `Invoice INV-${inv.invoice_id} — Slip #${s.slip_id} [${payLabel(paymentStatus)}]`;
        credit.payment_status = paymentStatus;
        credit.payment_mode = s.payment_mode;
        credit.invoice_id = inv.invoice_id;
      } else {
        // Defensive fallback: if the slip credit was manually deleted, create one now.
        next.counters.ledger += 1;
        next.ledger.push({
          ledger_id: next.counters.ledger,
          party_id: s.party_id,
          type: 'credit',
          amount: s.final_amount,
          note: `Invoice INV-${inv.invoice_id} — Slip #${s.slip_id} [${payLabel(paymentStatus)}]`,
          date: new Date().toISOString(),
          slip_id: s.slip_id,
          invoice_id: inv.invoice_id,
          auto: true,
          payment_status: paymentStatus,
          payment_mode: s.payment_mode,
        });
      }

      // Receipt debit: only add if status moved INTO 'paid'. If the slip was already paid,
      // its receipt debit already exists and we don't duplicate it.
      if (paymentStatus === 'paid' && oldStatus !== 'paid') {
        next.counters.ledger += 1;
        next.ledger.push({
          ledger_id: next.counters.ledger,
          party_id: s.party_id,
          type: 'debit',
          amount: s.final_amount,
          note: `Payment received — INV-${inv.invoice_id}`,
          date: new Date().toISOString(),
          slip_id: s.slip_id,
          invoice_id: inv.invoice_id,
          auto: true,
          payment_status: 'paid',
          payment_mode: s.payment_mode,
        });
      } else if (paymentStatus === 'paid' && oldStatus === 'paid') {
        // Status unchanged — but mode may have changed. Update the existing receipt debit
        // so the ledger shows the correct mode.
        const debit = next.ledger.find(
          l => l.auto && l.type === 'debit' && l.slip_id === s.slip_id
        );
        if (debit) {
          debit.payment_mode = s.payment_mode;
          debit.note = `Payment received — INV-${inv.invoice_id}`;
          debit.invoice_id = inv.invoice_id;
        }
      } else if (oldStatus === 'paid' && paymentStatus !== 'paid') {
        // Reverting from paid: drop the auto receipt debit so balance recovers.
        next.ledger = next.ledger.filter(
          l => !(l.auto && l.type === 'debit' && l.slip_id === s.slip_id)
        );
      }

      setGenerated(inv);
      return next;
    });
    toast('Invoice generated!', 'success');
  };

  if (generated) return <InvoiceResult inv={generated} />;

  return (
    <>
      <div className="ph">
        <div>
          <div className="pt">Generate M-Form Invoice</div>
          <div className="ps">Convert a vehicle slip into a formal tax invoice</div>
        </div>
      </div>
      <div className="g2">
        <div className="card">
          <div className="section-hdr">Select Slip to Invoice</div>
          <div className="fg-row">
            <label className="flbl">Vehicle Slip <span className="req">*</span></label>
            <select value={slipId} onChange={e => setSlipId(e.target.value)}>
              <option value="">— Select an uninvoiced slip —</option>
              {uninvoiced.map(s => {
                const p = db.parties.find(x => x.party_id === s.party_id);
                const m = db.materials.find(x => x.id === s.material_id);
                return (
                  <option key={s.slip_id} value={s.slip_id}>
                    #{s.slip_id} · {p?.party_name} · {m?.material_name} · {s.quantity} CFT · {payLabel(s.payment_status || 'pending')}
                  </option>
                );
              })}
            </select>
            {uninvoiced.length === 0 && (
              <div className="alert alert-warning" style={{ marginTop: 6 }}>
                All slips have been invoiced. Generate a new slip first.
              </div>
            )}
          </div>
          {slip && party && mat && (
            <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 12, marginTop: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>Slip #{slip.slip_id} Details</span>
                <span className={`ps-pill ${payClass(slip.payment_status || 'pending')}`}>{payLabel(slip.payment_status || 'pending')}</span>
              </div>
              {[
                ['Party', party.party_name],
                ['State', party.state],
                ['Material', mat.material_name],
                ['Vehicle', slip.vehicle_number],
                ['Qty & Rate', slip.quantity + ' CFT @ ₹' + slip.rate + '/CFT'],
                ['GST Treatment', slip.gst_enabled ? (slip.party_state === 'Punjab' ? 'CGST+SGST (Intra-State)' : 'IGST (Inter-State)') : 'Without GST'],
              ].map(([l, v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12.5 }}>
                  <span style={{ color: 'var(--text3)' }}>{l}</span>
                  <span style={{ fontWeight: 600 }}>{v}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 0', borderTop: '1px solid var(--border)', marginTop: 6, fontSize: 15, fontWeight: 800, color: 'var(--accent)' }}>
                <span>Invoice Total</span><span>₹{fmt2(slip.final_amount)}</span>
              </div>
            </div>
          )}
          <div className="divider" />
          <div className="section-hdr">Update Payment Status</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>Override the slip's payment status for this invoice</div>
          <PaymentSelector
            value={paymentStatus}
            onChange={s => { setPaymentStatus(s); if (s !== 'paid') setPaymentMode(null); }}
            mode={paymentMode}
            onModeChange={setPaymentMode}
          />
          <button className="btn btnp" style={{ width: '100%', padding: 11, marginTop: 16, fontSize: 14 }} onClick={submit}>Generate Invoice</button>
        </div>

        <div>
          {slip && party && mat ? (
            <InvoicePreview slip={slip} party={party} mat={mat} ps={paymentStatus} mode={paymentMode} bizInfo={db.bizInfo} />
          ) : (
            <div style={{ border: '2px dashed var(--border)', borderRadius: 'var(--rxl)', height: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', gap: 8 }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Select a slip to preview invoice</div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default function Page() {
  return <Suspense fallback={null}><InvoicePageInner /></Suspense>;
}

function InvoicePreview({ slip, party, mat, ps, mode, bizInfo }: any) {
  const ip = slip.party_state === 'Punjab';
  const gstOn = slip.gst_enabled !== false;
  const psColor = ps === 'paid' ? '#1A6B35' : ps === 'pending' ? '#B45309' : '#B91C1C';
  const psBg = ps === 'paid' ? '#DCFCE7' : ps === 'pending' ? '#FEF3C7' : '#FEE2E2';
  const modeLbl = ps === 'paid' && mode ? (mode === 'cash' ? ' · Cash' : ' · Online') : '';
  return (
    <>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Invoice Preview</div>
      <div style={{ background: '#fff', border: '1.5px solid #d0d8d0', borderRadius: 12, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
        <div style={{ height: 4, background: 'linear-gradient(90deg,#1B5E20,#2E7D32,#43A047,#A5D6A7)' }} />
        <div style={{ background: 'linear-gradient(135deg,#1B5E20 0%,#2E7D32 60%,#1a5276 100%)', padding: '18px 22px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 900, color: '#fff' }}>{bizInfo.name}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', marginTop: 3 }}>{bizInfo.address}</div>
              <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.55)', marginTop: 1, fontFamily: "'JetBrains Mono',monospace" }}>GSTIN: {bizInfo.gstin}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 9, letterSpacing: 2, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Tax Invoice</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#fff', lineHeight: 1 }}>INVOICE</div>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#81C784', fontFamily: "'JetBrains Mono',monospace" }}>DRAFT · {gstOn ? 'GST' : 'NO GST'}</div>
            </div>
          </div>
          <div style={{ display: 'flex', marginTop: 14, borderRadius: '6px 6px 0 0', overflow: 'hidden', background: 'rgba(0,0,0,0.2)' }}>
            {[['Date', new Date(slip.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })], ['Slip Ref', '#' + slip.slip_id], ['GST', gstOn ? (ip ? 'Intra-State' : 'Inter-State') : 'Without GST'], ['Status', payLabel(ps) + modeLbl]].map(([l, v], i) => (
              <div key={l} style={{ flex: 1, padding: '8px 10px', borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.1)' : 'none' }}>
                <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 }}>{l}</div>
                <div style={{ fontSize: 11, fontWeight: 800, color: l === 'Status' ? (ps === 'paid' ? '#81C784' : ps === 'pending' ? '#FFD54F' : '#EF9A9A') : '#fff' }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ padding: '16px 22px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 1 }}>Bill To</div>
              <div style={{ fontWeight: 800, fontSize: 13 }}>{party.party_name}</div>
              <div style={{ fontSize: 10.5, color: '#666' }}>{party.state}{party.gstin ? ' · GSTIN: ' + party.gstin : ''}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 1 }}>Vehicle</div>
              <div className="mono" style={{ fontWeight: 700, fontSize: 12 }}>{slip.vehicle_number}</div>
            </div>
          </div>
          <div style={{ background: '#FAFAFA', borderRadius: 8, padding: 12, marginTop: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
              <span>{mat.material_name} — {slip.quantity} CFT @ ₹{slip.rate}/CFT</span>
              <span style={{ fontWeight: 700 }}>₹{slip.base_amount.toFixed(2)}</span>
            </div>
            {gstOn && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#888' }}>
                <span>{ip ? `CGST ${slip.gst_percent / 2}% + SGST ${slip.gst_percent / 2}%` : `IGST ${slip.gst_percent}%`}</span>
                <span>₹{slip.gst_amount.toFixed(2)}</span>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, padding: '10px 14px', background: 'linear-gradient(135deg,#1B5E20,#2E7D32)', color: '#fff', borderRadius: 8, fontWeight: 800, fontSize: 16 }}>
            <span>Grand Total</span>
            <span>₹{slip.final_amount.toFixed(2)}</span>
          </div>
          <div style={{ marginTop: 10, textAlign: 'center' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 14, background: psBg, border: `1px solid ${psColor}`, fontSize: 11, fontWeight: 700, color: psColor }}>
              {payLabel(ps)}{modeLbl}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

function InvoiceResult({ inv }: { inv: Invoice }) {
  const { db } = useDB();
  const party = db.parties.find(p => p.party_id === inv.party_id);
  if (!party) return null;
  const ps = inv.payment_status || 'pending';
  const invDate = new Date(inv.date);

  return (
    <>
      <div className="ph no-print">
        <div>
          <div className="pt">Invoice INV-{inv.invoice_id}</div>
          <div className="ps">{invDate.toLocaleString('en-IN')}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/invoices" className="btn">← All Invoices</Link>
          <Link href={`/invoices/${inv.invoice_id}`} className="btn btnb">Edit / Manage</Link>
          <button className="btn btnp" onClick={() => window.print()}>Print / Download PDF</button>
        </div>
      </div>
      <div className="alert alert-success no-print" style={{ marginBottom: 18 }}>
        <span>Invoice <strong>INV-{inv.invoice_id}</strong> generated for <strong>{party.party_name}</strong></span>
        <span className={`ps-pill ${payClass(ps)}`} style={{ marginLeft: 'auto' }}>{payLabel(ps)}</span>
      </div>
      <InvoiceDocument inv={inv} />
      <div className="no-print" style={{ maxWidth: 900, margin: '20px auto 0' }}><SharePanel obj={inv} /></div>
    </>
  );
}
