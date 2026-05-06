'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useDB } from '@/store/DBContext';
import { useToast } from '@/store/ToastContext';
import PaymentSelector from '@/components/PaymentSelector';
import SharePanel from '@/components/SharePanel';
import SlipDocument from '@/components/SlipDocument';
import {
  calcGST, today, fmt2, getPartyRate, gstTypeBadge, gstTypeLabel, payClass, payLabel, stockRemaining,
} from '@/lib/helpers';
import type { PaymentStatus, Slip, LedgerEntry } from '@/lib/types';

type CftUnit = 'in' | 'ft' | 'cm' | 'mt' | 'cft';

export default function SlipPage() {
  const { db, setDb } = useDB();
  const toast = useToast();

  const [date, setDate] = useState(today());
  const [vehicle, setVehicle] = useState('');
  const [driver, setDriver] = useState('');
  const [partyId, setPartyId] = useState('');
  const [matId, setMatId] = useState('');
  const [rate, setRate] = useState<string>('');
  const [qty, setQty] = useState<string>('');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('pending');

  const [cftUnit, setCftUnit] = useState<CftUnit>('in');
  const [cftL, setCftL] = useState<string>('');
  const [cftW, setCftW] = useState<string>('');
  const [cftH, setCftH] = useState<string>('');
  const [cftDirect, setCftDirect] = useState<string>('');

  const [generated, setGenerated] = useState<Slip | null>(null);

  const party = useMemo(() => db.parties.find(p => p.party_id === parseInt(partyId)), [db.parties, partyId]);
  const mat = useMemo(() => db.materials.find(m => m.id === parseInt(matId)), [db.materials, matId]);
  const partyState = party?.state || '';
  const gstPct = mat?.gst_percent || 5;

  const onPartyChange = (val: string) => {
    setPartyId(val);
    if (matId) {
      const p = db.parties.find(p => p.party_id === parseInt(val));
      const m = db.materials.find(m => m.id === parseInt(matId));
      const partyRate = getPartyRate(p, parseInt(matId));
      const eff = partyRate != null ? partyRate : (m?.rate || 0);
      setRate(String(eff || ''));
    }
  };

  const onMatChange = (val: string) => {
    setMatId(val);
    const m = db.materials.find(m => m.id === parseInt(val));
    if (!m) return;
    const partyRate = getPartyRate(party, parseInt(val));
    const eff = partyRate != null ? partyRate : m.rate;
    setRate(String(eff || ''));
  };

  const calcCftValue = (): number => {
    const toFt = (v: number) =>
      cftUnit === 'in' ? v / 12 :
      cftUnit === 'ft' ? v :
      cftUnit === 'cm' ? v / 30.48 :
      cftUnit === 'mt' ? v * 3.28084 : v;
    if (cftUnit === 'cft') return parseFloat(cftDirect) || 0;
    const l = parseFloat(cftL) || 0, w = parseFloat(cftW) || 0, h = parseFloat(cftH) || 0;
    if (l <= 0 || w <= 0 || h <= 0) return 0;
    return parseFloat((toFt(l) * toFt(w) * toFt(h)).toFixed(3));
  };

  const cftPreview = calcCftValue();
  const applyCft = () => {
    if (cftPreview > 0) { setQty(String(cftPreview)); toast(`${cftPreview} CFT applied to Quantity`, 'success'); }
  };

  const qtyN = parseFloat(qty) || 0;
  const rateN = parseFloat(rate) || 0;
  const calc = qtyN > 0 && rateN > 0 && partyState ? calcGST(qtyN, rateN, gstPct, partyState) : null;

  const stockWarn = (() => {
    if (!mat || qtyN <= 0) return null;
    const rem = stockRemaining(db, mat.id);
    return qtyN > rem
      ? { type: 'warning' as const, msg: `⚠ Qty exceeds available stock (${fmt2(rem)} CFT). You can still proceed.` }
      : { type: 'success' as const, msg: `✓ Stock available — ${fmt2(rem)} CFT remaining` };
  })();

  const rateWarn = (() => {
    const partyRate = mat ? getPartyRate(party, mat.id) : null;
    if (mat && partyRate != null && partyRate !== mat.rate) {
      return { type: 'info' as const, msg: `💡 Party-specific rate applied: ₹${partyRate}/CFT (default: ₹${mat.rate}/CFT)` };
    }
    if (rateN === 0) return { type: 'warning' as const, msg: '⚠ Rate is ₹0 — please enter selling rate before generating slip.' };
    return null;
  })();

  const submit = () => {
    if (!vehicle || !partyId || !matId || qtyN <= 0) {
      toast('Please fill: Vehicle, Party, Material and Quantity.', 'error');
      return;
    }
    if (rateN <= 0) {
      toast('⚠ Rate is ₹0 — enter the selling rate per CFT.', 'error');
      return;
    }
    setDb(prev => {
      const next = { ...prev, materials: [...prev.materials], parties: [...prev.parties], slips: [...prev.slips], ledger: [...prev.ledger] };
      const p = next.parties.find(x => x.party_id === parseInt(partyId))!;
      const m = next.materials.find(x => x.id === parseInt(matId))!;
      const g = calcGST(qtyN, rateN, m.gst_percent, p.state);
      next.counters = { ...next.counters, slip: next.counters.slip + 1 };
      const slip: Slip = {
        slip_id: next.counters.slip,
        vehicle_number: vehicle.toUpperCase(),
        driver_name: driver,
        party_id: p.party_id,
        material_id: m.id,
        quantity: qtyN,
        rate: rateN,
        gst_percent: m.gst_percent,
        base_amount: g.base,
        gst_amount: g.gstAmt,
        cgst: g.cgst,
        sgst: g.sgst,
        igst: g.igst,
        final_amount: g.final,
        party_state: p.state,
        date: new Date(date).toISOString(),
        invoiced: false,
        payment_status: paymentStatus,
      };
      next.slips.push(slip);
      next.counters = { ...next.counters, ledger: next.counters.ledger + 1 };
      const le: LedgerEntry = {
        ledger_id: next.counters.ledger,
        party_id: p.party_id,
        type: 'credit',
        amount: g.final,
        note: `Slip #${slip.slip_id} — ${m.material_name} ${qtyN} CFT [${payLabel(paymentStatus)}]`,
        date: new Date().toISOString(),
        slip_id: slip.slip_id,
        auto: true,
        payment_status: paymentStatus,
      };
      next.ledger.push(le);
      if (paymentStatus === 'paid') {
        next.counters = { ...next.counters, ledger: next.counters.ledger + 1 };
        next.ledger.push({
          ledger_id: next.counters.ledger,
          party_id: p.party_id,
          type: 'debit',
          amount: g.final,
          note: `Payment received — Slip #${slip.slip_id}`,
          date: new Date().toISOString(),
          auto: true,
          payment_status: 'paid',
        });
      }
      setGenerated(slip);
      return next;
    });
    toast('Slip generated!', 'success');
  };

  if (generated) return <SlipResult slip={generated} onNew={() => {
    setGenerated(null);
    setVehicle(''); setDriver(''); setPartyId(''); setMatId(''); setRate(''); setQty('');
    setCftL(''); setCftW(''); setCftH(''); setCftDirect(''); setPaymentStatus('pending');
  }} />;

  const cftLabels: Record<CftUnit, string> = { in: 'in', ft: 'ft', cm: 'cm', mt: 'm', cft: 'CFT' };

  return (
    <>
      <div className="ph">
        <div>
          <div className="pt">Generate Vehicle Slip</div>
          <div className="ps">M-Form Tax Invoice · Set payment status at time of generation</div>
        </div>
      </div>
      <div className="g2">
        <div className="card">
          <div className="section-hdr">Vehicle &amp; Party Details</div>
          <div className="g2">
            <div className="fg-row">
              <label className="flbl">Dispatch Date <span className="req">*</span></label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className="fg-row">
              <label className="flbl">Vehicle Number <span className="req">*</span></label>
              <input type="text" value={vehicle} placeholder="PB-10-AB-1234" onChange={e => setVehicle(e.target.value.toUpperCase())} />
            </div>
            <div className="fg-row">
              <label className="flbl">Driver Name</label>
              <input type="text" value={driver} placeholder="Optional" onChange={e => setDriver(e.target.value)} />
            </div>
          </div>
          <div className="fg-row">
            <label className="flbl">Party <span className="req">*</span></label>
            <select value={partyId} onChange={e => onPartyChange(e.target.value)}>
              <option value="">— Select Party —</option>
              {db.parties.map(p => <option key={p.party_id} value={p.party_id}>{p.party_name} ({p.state})</option>)}
            </select>
            {db.parties.length === 0 && (
              <div className="field-hint" style={{ color: 'var(--amber)' }}>
                ⚠ No parties added yet. <Link href="/parties" style={{ textDecoration: 'underline' }}>Add a party →</Link>
              </div>
            )}
          </div>
          <div className="fg-row">
            <label className="flbl">GST Jurisdiction</label>
            <input value={partyState} readOnly placeholder="Auto-filled from party" />
            {party && <div style={{ marginTop: 4 }}><span className={`badge ${gstTypeBadge(partyState)}`}>{gstTypeLabel(partyState)}</span></div>}
          </div>
          <div className="divider" />
          <div className="section-hdr">Material &amp; Pricing</div>
          <div className="fg-row">
            <label className="flbl">Material <span className="req">*</span></label>
            <select value={matId} onChange={e => onMatChange(e.target.value)}>
              <option value="">— Select Material —</option>
              {db.materials.map(m => (
                <option key={m.id} value={m.id}>
                  {m.material_name} — ₹{m.rate}/CFT (Avail: {fmt2(stockRemaining(db, m.id))} CFT)
                </option>
              ))}
            </select>
          </div>
          <div className="g2">
            <div className="fg-row">
              <label className="flbl">Selling Rate (₹/CFT) <span className="req">*</span></label>
              <input type="number" min="0" step="0.01" value={rate} onChange={e => setRate(e.target.value)} placeholder="Enter rate per cft" />
            </div>
            <div className="fg-row">
              <label className="flbl">GST Rate</label>
              <input value={mat ? mat.gst_percent + '%' : ''} readOnly placeholder="Auto" />
            </div>
          </div>
          {rateWarn && (
            <div className={`alert alert-${rateWarn.type}`}>{rateWarn.msg}</div>
          )}

          <div style={{ background: 'linear-gradient(135deg,#EBF2FB,#f0f6ff)', border: '1px solid #b8d4f0', borderRadius: 'var(--r)', padding: 14, marginBottom: 13 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--blue)' }}>📐 CFT Calculator — L × W × H</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text2)' }}>Input unit:</span>
                <select value={cftUnit} onChange={e => setCftUnit(e.target.value as CftUnit)} style={{ padding: '3px 7px', fontSize: 11.5, fontWeight: 700, width: 'auto', borderRadius: 6 }}>
                  <option value="in">Inches (in)</option>
                  <option value="ft">Feet (ft)</option>
                  <option value="cm">Centimetres (cm)</option>
                  <option value="mt">Metres (m)</option>
                  <option value="cft">Direct CFT</option>
                </select>
              </div>
            </div>
            {cftUnit !== 'cft' ? (
              <div className="g3" style={{ gap: 8, marginBottom: 10 }}>
                <div>
                  <label style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text2)', display: 'block', marginBottom: 3 }}>Length ({cftLabels[cftUnit]})</label>
                  <input type="number" min="0" step="0.01" value={cftL} onChange={e => setCftL(e.target.value)} placeholder="0" style={{ padding: '6px 9px', fontSize: 12 }} />
                </div>
                <div>
                  <label style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text2)', display: 'block', marginBottom: 3 }}>Width ({cftLabels[cftUnit]})</label>
                  <input type="number" min="0" step="0.01" value={cftW} onChange={e => setCftW(e.target.value)} placeholder="0" style={{ padding: '6px 9px', fontSize: 12 }} />
                </div>
                <div>
                  <label style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text2)', display: 'block', marginBottom: 3 }}>Height ({cftLabels[cftUnit]})</label>
                  <input type="number" min="0" step="0.01" value={cftH} onChange={e => setCftH(e.target.value)} placeholder="0" style={{ padding: '6px 9px', fontSize: 12 }} />
                </div>
              </div>
            ) : (
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text2)', display: 'block', marginBottom: 3 }}>CFT Value</label>
                <input type="number" min="0" step="0.001" value={cftDirect} onChange={e => setCftDirect(e.target.value)} placeholder="Enter cubic feet directly" style={{ padding: '6px 9px', fontSize: 12, maxWidth: 220 }} />
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              {cftPreview > 0
                ? <div style={{ fontSize: 12, color: 'var(--text3)' }}><span style={{ fontWeight: 800, color: 'var(--blue)', fontSize: 13 }}>{cftPreview} CFT</span></div>
                : <div style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' }}>Enter dimensions to calculate CFT</div>}
              {cftPreview > 0 && (
                <button className="btn btnb btn-sm" onClick={applyCft} type="button">✓ Apply to Quantity</button>
              )}
            </div>
          </div>

          <div className="fg-row">
            <label className="flbl">Quantity (CFT) <span className="req">*</span></label>
            <input type="number" min="0" step="0.001" value={qty} onChange={e => setQty(e.target.value)} placeholder="0.000" />
          </div>
          {stockWarn && <div className={`alert alert-${stockWarn.type}`}>{stockWarn.msg}</div>}

          {calc && (
            <div className="calc-box" style={{ marginTop: 10 }}>
              <div className="cr"><span style={{ color: 'var(--text2)' }}>Taxable ({qtyN} CFT × ₹{rateN})</span><span style={{ fontWeight: 700 }}>₹{fmt2(calc.base)}</span></div>
              {calc.isPunjab ? (
                <>
                  <div className="cr" style={{ color: 'var(--text3)' }}><span>CGST @ {gstPct / 2}%</span><span>₹{calc.cgst.toFixed(2)}</span></div>
                  <div className="cr" style={{ color: 'var(--text3)' }}><span>SGST @ {gstPct / 2}%</span><span>₹{calc.sgst.toFixed(2)}</span></div>
                </>
              ) : (
                <div className="cr" style={{ color: 'var(--text3)' }}><span>IGST @ {gstPct}%</span><span>₹{calc.igst.toFixed(2)}</span></div>
              )}
              <div className="cr tot"><span>Total Payable</span><span>₹{fmt2(calc.final)}</span></div>
              <div style={{ fontSize: 10.5, color: 'var(--accent3)', marginTop: 4, fontWeight: 600 }}>
                {calc.isPunjab ? '🏠 Intra-State — CGST + SGST applicable' : '🌐 Inter-State — IGST applicable'}
              </div>
            </div>
          )}
          <div className="divider" />
          <div className="section-hdr">Payment Status <span className="req">*</span></div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>Select how this sale is being settled right now</div>
          <PaymentSelector value={paymentStatus} onChange={setPaymentStatus} />
          <div style={{ marginTop: 10, padding: '8px 12px', background: 'var(--surface2)', borderRadius: 'var(--r)', fontSize: 11, color: 'var(--text3)', lineHeight: 1.7 }}>
            <strong style={{ color: 'var(--green)' }}>Paid</strong> = Cash/transfer received immediately &nbsp;&nbsp;
            <strong style={{ color: 'var(--amber)' }}>Pending</strong> = Invoice raised, payment expected &nbsp;&nbsp;
            <strong style={{ color: 'var(--red)' }}>Debt</strong> = Supplied on credit, no commitment date
          </div>
          <button className="btn btnp" style={{ width: '100%', padding: 11, marginTop: 16, fontSize: 14 }} onClick={submit}>
            ✓ Generate Slip
          </button>
        </div>

        <div>
          {calc && party && mat && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Live Preview</div>
              <div className="inv-doc">
                <div className="inv-header">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 15 }}>{db.bizInfo.name}</div>
                      <div style={{ fontSize: 10, opacity: 0.6, marginTop: 2, fontFamily: "'JetBrains Mono',monospace" }}>{db.bizInfo.gstin}</div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.15)', padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>PREVIEW</div>
                  </div>
                </div>
                <div style={{ padding: 16 }}>
                  {[
                    ['Vehicle No.', vehicle || '—'],
                    ['Party', party.party_name],
                    ['State', party.state],
                    ['Material', mat.material_name],
                    ['Quantity', qtyN + ' CFT'],
                    ['Rate per CFT', '₹' + rateN],
                    ['Taxable Amt', '₹' + calc.base.toFixed(2)],
                    [calc.isPunjab ? 'CGST+SGST' : 'IGST', '₹' + calc.gstAmt.toFixed(2)],
                  ].map(([l, v]) => (
                    <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px dotted var(--border)', fontSize: 12 }}>
                      <span style={{ color: 'var(--text3)' }}>{l}</span>
                      <span style={{ fontWeight: 600 }}>{v}</span>
                    </div>
                  ))}
                  <div style={{ background: 'var(--accent)', color: '#fff', borderRadius: 'var(--r)', padding: '12px 14px', marginTop: 12, display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 16 }}>
                    <span>Total Payable</span><span>₹{fmt2(calc.final)}</span>
                  </div>
                  <div style={{ marginTop: 10, textAlign: 'center' }}>
                    <span className={`ps-pill ps-${paymentStatus}`}>{payLabel(paymentStatus)}</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function SlipResult({ slip, onNew }: { slip: Slip; onNew: () => void }) {
  const { db } = useDB();
  const party = db.parties.find(p => p.party_id === slip.party_id);
  const mat = db.materials.find(m => m.id === slip.material_id);
  const ps = slip.payment_status || 'pending';
  if (!party || !mat) return null;

  return (
    <>
      <div className="ph no-print">
        <div>
          <div className="pt">Slip #{slip.slip_id} Generated</div>
          <div className="ps">{new Date(slip.date).toLocaleString('en-IN')}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={onNew}>+ New Slip</button>
          {!slip.invoiced && (
            <Link href={`/invoice?slip=${slip.slip_id}`} className="btn btnb">Generate Invoice</Link>
          )}
          <button className="btn btnp" onClick={() => window.print()}>🖨 Print</button>
        </div>
      </div>
      <div className="alert alert-success no-print" style={{ marginBottom: 14 }}>
        <span>✓ Slip #{slip.slip_id} created for <strong>{party.party_name}</strong></span>
        <span className={`ps-pill ${payClass(ps)}`} style={{ marginLeft: 'auto' }}>{payLabel(ps)}</span>
      </div>
      <div className="g2">
        <SlipDocument slip={slip} />
        <div className="no-print"><SharePanel obj={slip} /></div>
      </div>
    </>
  );
}
