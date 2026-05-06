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
import type { PaymentStatus, Invoice, LedgerEntry } from '@/lib/types';

function InvoicePageInner() {
  const { db, setDb } = useDB();
  const toast = useToast();
  const params = useSearchParams();
  const initialSlipId = params.get('slip');

  const [slipId, setSlipId] = useState<string>(initialSlipId || '');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('pending');
  const [generated, setGenerated] = useState<Invoice | null>(null);

  const uninvoiced = useMemo(() => db.slips.filter(s => !s.invoiced), [db.slips]);
  const slip = useMemo(() => db.slips.find(s => s.slip_id === parseInt(slipId)), [db.slips, slipId]);
  const party = slip ? db.parties.find(p => p.party_id === slip.party_id) : null;
  const mat = slip ? db.materials.find(m => m.id === slip.material_id) : null;

  useEffect(() => { if (slip) setPaymentStatus(slip.payment_status || 'pending'); }, [slip]);

  const submit = () => {
    if (!slip || !party || !mat) { toast('Please select a slip', 'error'); return; }
    setDb(prev => {
      const next = { ...prev, slips: [...prev.slips], invoices: [...prev.invoices], ledger: [...prev.ledger], counters: { ...prev.counters } };
      const s = next.slips.find(x => x.slip_id === slip.slip_id)!;
      s.payment_status = paymentStatus;
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
      };
      next.invoices.push(inv);
      next.counters.ledger += 1;
      const le: LedgerEntry = {
        ledger_id: next.counters.ledger,
        party_id: s.party_id,
        type: 'credit',
        amount: s.final_amount,
        note: `Invoice INV-${inv.invoice_id} — Slip #${s.slip_id} [${payLabel(paymentStatus)}]`,
        date: new Date().toISOString(),
        auto: true,
        payment_status: paymentStatus,
      };
      next.ledger.push(le);
      if (paymentStatus === 'paid') {
        next.counters.ledger += 1;
        next.ledger.push({
          ledger_id: next.counters.ledger,
          party_id: s.party_id,
          type: 'debit',
          amount: s.final_amount,
          note: `Payment received — INV-${inv.invoice_id}`,
          date: new Date().toISOString(),
          auto: true,
          payment_status: 'paid',
        });
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
                ['GST Type', slip.party_state === 'Punjab' ? 'CGST+SGST (Intra-State)' : 'IGST (Inter-State)'],
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
          <PaymentSelector value={paymentStatus} onChange={setPaymentStatus} />
          <button className="btn btnp" style={{ width: '100%', padding: 11, marginTop: 16, fontSize: 14 }} onClick={submit}>Generate Invoice</button>
        </div>

        <div>
          {slip && party && mat ? (
            <InvoicePreview slip={slip} party={party} mat={mat} ps={paymentStatus} bizInfo={db.bizInfo} />
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

function InvoicePreview({ slip, party, mat, ps, bizInfo }: any) {
  const ip = slip.party_state === 'Punjab';
  const psColor = ps === 'paid' ? '#1A6B35' : ps === 'pending' ? '#B45309' : '#B91C1C';
  const psBg = ps === 'paid' ? '#DCFCE7' : ps === 'pending' ? '#FEF3C7' : '#FEE2E2';
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
              <div style={{ fontSize: 11, fontWeight: 800, color: '#81C784', fontFamily: "'JetBrains Mono',monospace" }}>DRAFT</div>
            </div>
          </div>
          <div style={{ display: 'flex', marginTop: 14, borderRadius: '6px 6px 0 0', overflow: 'hidden', background: 'rgba(0,0,0,0.2)' }}>
            {[['Date', new Date(slip.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })], ['Slip Ref', '#' + slip.slip_id], ['GST', ip ? 'Intra-State' : 'Inter-State'], ['Status', payLabel(ps)]].map(([l, v], i) => (
              <div key={l} style={{ flex: 1, padding: '8px 10px', borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.1)' : 'none' }}>
                <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 }}>{l}</div>
                <div style={{ fontSize: 11, fontWeight: 800, color: l === 'Status' ? (ps === 'paid' ? '#81C784' : ps === 'pending' ? '#FFD54F' : '#EF9A9A') : '#fff' }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid #e8ece8' }}>
          <div style={{ padding: '14px 18px', borderRight: '1px solid #e8ece8' }}>
            <div style={{ fontSize: 8, fontWeight: 800, letterSpacing: 1.5, color: '#2E7D32', textTransform: 'uppercase', marginBottom: 6 }}>Seller</div>
            <div style={{ fontWeight: 800, fontSize: 13 }}>{bizInfo.name}</div>
            <div style={{ fontSize: 10.5, color: '#666', marginTop: 2 }}>{bizInfo.address}</div>
            <div style={{ fontSize: 10, color: '#888', fontFamily: "'JetBrains Mono',monospace", marginTop: 2 }}>GSTIN: {bizInfo.gstin}</div>
          </div>
          <div style={{ padding: '14px 18px', background: '#FAFCFA' }}>
            <div style={{ fontSize: 8, fontWeight: 800, letterSpacing: 1.5, color: '#2E7D32', textTransform: 'uppercase', marginBottom: 6 }}>Buyer</div>
            <div style={{ fontWeight: 800, fontSize: 13 }}>{party.party_name}</div>
            <div style={{ fontSize: 10.5, color: '#666', marginTop: 2 }}>{party.state}{party.phone ? ' · ' + party.phone : ''}</div>
            {party.gstin && <div style={{ fontSize: 10, color: '#888', fontFamily: "'JetBrains Mono',monospace", marginTop: 2 }}>GSTIN: {party.gstin}</div>}
          </div>
        </div>
        <div style={{ padding: '14px 18px 10px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'linear-gradient(90deg,#1B5E20,#2E7D32)' }}>
                <th style={{ padding: '8px 10px', textAlign: 'left', color: 'rgba(255,255,255,0.7)', fontSize: 8.5, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase' }}>Description</th>
                <th style={{ padding: '8px 8px', textAlign: 'center', color: 'rgba(255,255,255,0.7)', fontSize: 8.5, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase' }}>HSN</th>
                <th style={{ padding: '8px 8px', textAlign: 'right', color: 'rgba(255,255,255,0.7)', fontSize: 8.5, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase' }}>Qty</th>
                <th style={{ padding: '8px 8px', textAlign: 'right', color: 'rgba(255,255,255,0.7)', fontSize: 8.5, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase' }}>Rate</th>
                <th style={{ padding: '8px 8px', textAlign: 'right', color: 'rgba(255,255,255,0.7)', fontSize: 8.5, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase' }}>Taxable</th>
                {ip ? <>
                  <th style={{ padding: '8px 8px', textAlign: 'right', color: 'rgba(255,255,255,0.7)', fontSize: 8.5, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase' }}>CGST</th>
                  <th style={{ padding: '8px 8px', textAlign: 'right', color: 'rgba(255,255,255,0.7)', fontSize: 8.5, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase' }}>SGST</th>
                </> : <th style={{ padding: '8px 8px', textAlign: 'right', color: 'rgba(255,255,255,0.7)', fontSize: 8.5, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase' }}>IGST</th>}
                <th style={{ padding: '8px 10px', textAlign: 'right', color: '#fff', fontSize: 8.5, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1.5px solid #e8ece8' }}>
                <td style={{ padding: '12px 10px' }}>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>{mat.material_name}</div>
                  <div style={{ fontSize: 10, color: '#888' }}>GST: {slip.gst_percent}%</div>
                </td>
                <td style={{ padding: '12px 8px', textAlign: 'center', fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: '#2E7D32', fontWeight: 700 }}>{mat.hsn_code}</td>
                <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 800 }}>{slip.quantity} CFT</td>
                <td style={{ padding: '12px 8px', textAlign: 'right', color: '#555' }}>₹{slip.rate}</td>
                <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 600 }}>₹{slip.base_amount.toFixed(2)}</td>
                {ip ? <>
                  <td style={{ padding: '12px 8px', textAlign: 'right', color: '#666' }}>₹{slip.cgst.toFixed(2)}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'right', color: '#666' }}>₹{slip.sgst.toFixed(2)}</td>
                </> : <td style={{ padding: '12px 8px', textAlign: 'right', color: '#666' }}>₹{slip.igst.toFixed(2)}</td>}
                <td style={{ padding: '12px 10px', textAlign: 'right', fontWeight: 900, color: '#1B5E20', fontSize: 14 }}>₹{slip.final_amount.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{ padding: '0 18px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 14px', borderRadius: 8, background: psBg, border: `1.5px solid ${psColor}` }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: psColor }} />
            <span style={{ fontSize: 12, fontWeight: 800, color: psColor }}>{payLabel(ps)}</span>
          </div>
          <div style={{ textAlign: 'right' }}>
            {ip
              ? <div style={{ fontSize: 11, color: '#888' }}>CGST {slip.gst_percent / 2}%: ₹{slip.cgst.toFixed(2)} · SGST {slip.gst_percent / 2}%: ₹{slip.sgst.toFixed(2)}</div>
              : <div style={{ fontSize: 11, color: '#888' }}>IGST {slip.gst_percent}%: ₹{slip.igst.toFixed(2)}</div>}
            <div style={{ fontSize: 18, fontWeight: 900, color: '#1B5E20', marginTop: 2 }}>Grand Total: ₹{slip.final_amount.toFixed(2)}</div>
          </div>
        </div>
        <div style={{ height: 3, background: 'linear-gradient(90deg,#1B5E20,#2E7D32,#43A047,#A5D6A7)' }} />
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
          <button className="btn btnp" onClick={() => window.print()}>Print / Save PDF</button>
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
