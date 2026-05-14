'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useDB } from '@/store/DBContext';
import { useToast } from '@/store/ToastContext';
import PaymentSelector from '@/components/PaymentSelector';
import SharePanel from '@/components/SharePanel';
import SlipDocument from '@/components/SlipDocument';
import NumberInput from '@/components/NumberInput';
import DimensionInput, { toDecimalFeet } from '@/components/DimensionInput';
import {
  calcGST, today, fmt2, getPartyRate, gstTypeBadge, gstTypeLabel, isPositiveNumber, payClass, payLabel, stockRemaining,
} from '@/lib/helpers';
import type { PaymentStatus, PaymentMode, Slip, LedgerEntry } from '@/lib/types';

type CftMode = 'ft_in' | 'cft';

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
  const [paymentMode, setPaymentMode] = useState<PaymentMode | null>(null);
  // Per-slip GST override. Defaults to the selected party's gst_enabled setting.
  const [gstEnabled, setGstEnabled] = useState<boolean>(true);

  // CFT helper: ft+in pair per dimension, or a direct CFT override. Replaces the
  // legacy single-unit selector (which produced rounding errors when users entered
  // inches or centimetres).
  const [cftMode, setCftMode] = useState<CftMode>('ft_in');
  const [lFt, setLFt] = useState(''); const [lIn, setLIn] = useState('');
  const [wFt, setWFt] = useState(''); const [wIn, setWIn] = useState('');
  const [hFt, setHFt] = useState(''); const [hIn, setHIn] = useState('');
  const [cftDirect, setCftDirect] = useState<string>('');

  const [generated, setGenerated] = useState<Slip | null>(null);

  const party = useMemo(() => db.parties.find(p => p.party_id === parseInt(partyId)), [db.parties, partyId]);
  const mat = useMemo(() => db.materials.find(m => m.id === parseInt(matId)), [db.materials, matId]);
  const partyState = party?.state || '';
  const gstPct = mat?.gst_percent || 5;

  // When the party changes, sync GST mode to that party's default treatment.
  useEffect(() => {
    if (party) setGstEnabled(party.gst_enabled !== false);
  }, [party]);

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
    if (cftMode === 'cft') return parseFloat(cftDirect) || 0;
    const lf = toDecimalFeet(lFt, lIn);
    const wf = toDecimalFeet(wFt, wIn);
    const hf = toDecimalFeet(hFt, hIn);
    if (lf <= 0 || wf <= 0 || hf <= 0) return 0;
    // Round to 2 decimal places to match the user-facing test case (807.61 CFT).
    return parseFloat((lf * wf * hf).toFixed(2));
  };

  const cftPreview = calcCftValue();
  const applyCft = () => {
    if (cftPreview > 0) { setQty(String(cftPreview)); toast(`${cftPreview} CFT applied to Quantity`, 'success'); }
  };

  const qtyN = parseFloat(qty) || 0;
  const rateN = parseFloat(rate) || 0;
  const calc = qtyN > 0 && rateN > 0 && partyState ? calcGST(qtyN, rateN, gstPct, partyState, gstEnabled) : null;

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
    if (!vehicle || !partyId || !matId) {
      toast('Please fill: Vehicle, Party, Material.', 'error'); return;
    }
    if (!isPositiveNumber(qty)) { toast('Quantity must be a positive number.', 'error'); return; }
    if (!isPositiveNumber(rate)) { toast('Rate must be a positive number.', 'error'); return; }
    if (paymentStatus === 'paid' && !paymentMode) {
      toast('Select Payment Mode (Cash or Online) when status is Paid.', 'error'); return;
    }
    setDb(prev => {
      const next = {
        ...prev, materials: [...prev.materials], parties: [...prev.parties],
        slips: [...prev.slips], ledger: [...prev.ledger],
      };
      const p = next.parties.find(x => x.party_id === parseInt(partyId))!;
      const m = next.materials.find(x => x.id === parseInt(matId))!;
      const g = calcGST(qtyN, rateN, m.gst_percent, p.state, gstEnabled);
      next.counters = { ...next.counters, slip: next.counters.slip + 1 };
      const slip: Slip = {
        slip_id: next.counters.slip,
        vehicle_number: vehicle.toUpperCase().trim(),
        driver_name: driver.trim(),
        party_id: p.party_id,
        material_id: m.id,
        quantity: qtyN,
        rate: rateN,
        gst_percent: gstEnabled ? m.gst_percent : 0,
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
        gst_enabled: gstEnabled,
        payment_mode: paymentStatus === 'paid' && paymentMode ? paymentMode : undefined,
      };
      next.slips.push(slip);

      // Sale credit (always one entry — never duplicated by invoice generation later).
      next.counters = { ...next.counters, ledger: next.counters.ledger + 1 };
      const credit: LedgerEntry = {
        ledger_id: next.counters.ledger,
        party_id: p.party_id,
        type: 'credit',
        amount: g.final,
        note: `Slip #${slip.slip_id} — ${m.material_name} ${qtyN} CFT [${payLabel(paymentStatus)}]`,
        date: new Date().toISOString(),
        slip_id: slip.slip_id,
        auto: true,
        payment_status: paymentStatus,
        payment_mode: slip.payment_mode,
      };
      next.ledger.push(credit);

      // If paid at slip-creation time, record the matching receipt as a debit.
      if (paymentStatus === 'paid') {
        next.counters = { ...next.counters, ledger: next.counters.ledger + 1 };
        next.ledger.push({
          ledger_id: next.counters.ledger,
          party_id: p.party_id,
          type: 'debit',
          amount: g.final,
          note: `Payment received — Slip #${slip.slip_id}`,
          date: new Date().toISOString(),
          slip_id: slip.slip_id,
          auto: true,
          payment_status: 'paid',
          payment_mode: slip.payment_mode,
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
    setLFt(''); setLIn(''); setWFt(''); setWIn(''); setHFt(''); setHIn(''); setCftDirect('');
    setPaymentStatus('pending'); setPaymentMode(null);
  }} />;

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
              {db.parties.map(p => <option key={p.party_id} value={p.party_id}>{p.party_name} ({p.state}){p.gst_enabled === false ? ' · No GST' : ''}</option>)}
            </select>
            {db.parties.length === 0 && (
              <div className="field-hint" style={{ color: 'var(--amber)' }}>
                ⚠ No parties added yet. <Link href="/parties" style={{ textDecoration: 'underline' }}>Add a party →</Link>
              </div>
            )}
          </div>

          <div className="fg-row">
            <label className="flbl">GST Treatment <span className="req">*</span></label>
            <div style={{ display: 'flex', gap: 8 }}>
              <label style={{
                flex: 1, padding: '9px 12px', borderRadius: 'var(--r)', cursor: 'pointer',
                border: `1.5px solid ${gstEnabled ? 'var(--accent3)' : 'var(--border)'}`,
                background: gstEnabled ? 'var(--accent-light)' : 'var(--surface)',
                fontSize: 12, fontWeight: 700, color: gstEnabled ? 'var(--accent)' : 'var(--text2)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <input type="radio" checked={gstEnabled} onChange={() => setGstEnabled(true)} style={{ width: 'auto' }} />
                With GST
              </label>
              <label style={{
                flex: 1, padding: '9px 12px', borderRadius: 'var(--r)', cursor: 'pointer',
                border: `1.5px solid ${!gstEnabled ? 'var(--accent3)' : 'var(--border)'}`,
                background: !gstEnabled ? 'var(--accent-light)' : 'var(--surface)',
                fontSize: 12, fontWeight: 700, color: !gstEnabled ? 'var(--accent)' : 'var(--text2)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <input type="radio" checked={!gstEnabled} onChange={() => setGstEnabled(false)} style={{ width: 'auto' }} />
                Without GST
              </label>
            </div>
            <div className="field-hint">{gstEnabled ? 'CGST+SGST or IGST applied based on party state.' : 'No tax — total = subtotal.'}</div>
          </div>

          <div className="fg-row">
            <label className="flbl">GST Jurisdiction</label>
            <input value={partyState} readOnly placeholder="Auto-filled from party" />
            {party && gstEnabled && <div style={{ marginTop: 4 }}><span className={`badge ${gstTypeBadge(partyState)}`}>{gstTypeLabel(partyState)}</span></div>}
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
              <NumberInput mode="decimal" value={rate} onChange={setRate} placeholder="Enter rate per cft" />
            </div>
            <div className="fg-row">
              <label className="flbl">GST Rate</label>
              <input value={gstEnabled ? (mat ? mat.gst_percent + '%' : '') : '0% (without GST)'} readOnly />
            </div>
          </div>
          {rateWarn && (
            <div className={`alert alert-${rateWarn.type}`}>{rateWarn.msg}</div>
          )}

          <div style={{ background: 'linear-gradient(135deg,#EBF2FB,#f0f6ff)', border: '1px solid #b8d4f0', borderRadius: 'var(--r)', padding: 14, marginBottom: 13 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--blue)' }}>📐 CFT Calculator — L × W × H (feet + inches)</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text2)' }}>Input mode:</span>
                <select value={cftMode} onChange={e => setCftMode(e.target.value as CftMode)} style={{ padding: '3px 7px', fontSize: 11.5, fontWeight: 700, width: 'auto', borderRadius: 6 }}>
                  <option value="ft_in">Feet + Inches</option>
                  <option value="cft">Direct CFT</option>
                </select>
              </div>
            </div>
            {cftMode === 'ft_in' ? (
              <div className="g3" style={{ gap: 8, marginBottom: 10 }}>
                <DimensionInput label="Length" feet={lFt} inches={lIn} onFeetChange={setLFt} onInchesChange={setLIn} />
                <DimensionInput label="Width" feet={wFt} inches={wIn} onFeetChange={setWFt} onInchesChange={setWIn} />
                <DimensionInput label="Height" feet={hFt} inches={hIn} onFeetChange={setHFt} onInchesChange={setHIn} />
              </div>
            ) : (
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text2)', display: 'block', marginBottom: 3 }}>CFT Value</label>
                <NumberInput mode="decimal" value={cftDirect} onChange={setCftDirect} placeholder="Enter cubic feet directly" style={{ padding: '6px 9px', fontSize: 12, maxWidth: 220 }} />
              </div>
            )}
            {cftMode === 'ft_in' && cftPreview > 0 && (
              <div style={{ fontSize: 10.5, color: 'var(--text3)', marginBottom: 8 }}>
                Decimal feet: {toDecimalFeet(lFt, lIn).toFixed(4)} × {toDecimalFeet(wFt, wIn).toFixed(4)} × {toDecimalFeet(hFt, hIn).toFixed(4)}
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
            <NumberInput mode="decimal" value={qty} onChange={setQty} placeholder="0.000" />
          </div>
          {stockWarn && <div className={`alert alert-${stockWarn.type}`}>{stockWarn.msg}</div>}

          {calc && (
            <div className="calc-box" style={{ marginTop: 10 }}>
              <div className="cr"><span style={{ color: 'var(--text2)' }}>{gstEnabled ? 'Taxable' : 'Subtotal'} ({qtyN} CFT × ₹{rateN})</span><span style={{ fontWeight: 700 }}>₹{fmt2(calc.base)}</span></div>
              {gstEnabled && (calc.isPunjab ? (
                <>
                  <div className="cr" style={{ color: 'var(--text3)' }}><span>CGST @ {gstPct / 2}%</span><span>₹{calc.cgst.toFixed(2)}</span></div>
                  <div className="cr" style={{ color: 'var(--text3)' }}><span>SGST @ {gstPct / 2}%</span><span>₹{calc.sgst.toFixed(2)}</span></div>
                </>
              ) : (
                <div className="cr" style={{ color: 'var(--text3)' }}><span>IGST @ {gstPct}%</span><span>₹{calc.igst.toFixed(2)}</span></div>
              ))}
              <div className="cr tot"><span>Total Payable</span><span>₹{fmt2(calc.final)}</span></div>
              <div style={{ fontSize: 10.5, color: 'var(--accent3)', marginTop: 4, fontWeight: 600 }}>
                {!gstEnabled ? '🚫 Without GST — total equals subtotal' : calc.isPunjab ? '🏠 Intra-State — CGST + SGST applicable' : '🌐 Inter-State — IGST applicable'}
              </div>
            </div>
          )}
          <div className="divider" />
          <div className="section-hdr">Payment Status <span className="req">*</span></div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>Select how this sale is being settled right now</div>
          <PaymentSelector
            value={paymentStatus}
            onChange={s => { setPaymentStatus(s); if (s !== 'paid') setPaymentMode(null); }}
            mode={paymentMode}
            onModeChange={setPaymentMode}
          />
          <div style={{ marginTop: 10, padding: '8px 12px', background: 'var(--surface2)', borderRadius: 'var(--r)', fontSize: 11, color: 'var(--text3)', lineHeight: 1.7 }}>
            <strong style={{ color: 'var(--green)' }}>Paid</strong> — pick Cash or Online below &nbsp;&nbsp;
            <strong style={{ color: 'var(--amber)' }}>Pending</strong> = Invoice raised, payment expected &nbsp;&nbsp;
            <strong style={{ color: 'var(--red)' }}>Debt</strong> = Supplied on credit
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
                    <div style={{ background: 'rgba(255,255,255,0.15)', padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
                      PREVIEW · {gstEnabled ? 'GST' : 'NO GST'}
                    </div>
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
                    [gstEnabled ? 'Taxable Amt' : 'Subtotal', '₹' + calc.base.toFixed(2)],
                    ...(gstEnabled ? [[calc.isPunjab ? 'CGST+SGST' : 'IGST', '₹' + calc.gstAmt.toFixed(2)] as [string, string]] : []),
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
                    <span className={`ps-pill ps-${paymentStatus}`}>
                      {payLabel(paymentStatus)}{paymentStatus === 'paid' && paymentMode ? ` · ${paymentMode === 'cash' ? 'Cash' : 'Online'}` : ''}
                    </span>
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
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" onClick={onNew}>+ New Slip</button>
          <Link href={`/slips/${slip.slip_id}`} className="btn">Edit / Manage</Link>
          {!slip.invoiced && (
            <Link href={`/invoice?slip=${slip.slip_id}`} className="btn btnb">Generate Invoice</Link>
          )}
          <button className="btn btnp" onClick={() => window.print()}>🖨 Print / Download PDF</button>
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
