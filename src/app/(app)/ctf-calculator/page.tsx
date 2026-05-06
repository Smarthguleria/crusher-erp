'use client';

import { useState } from 'react';
import { useDB } from '@/store/DBContext';
import { fmt } from '@/lib/helpers';
import { STATES } from '@/lib/types';

export default function CTFCalcPage() {
  const { db } = useDB();

  // Volume to CFT
  const [vL, setVL] = useState(''); const [vW, setVW] = useState(''); const [vH, setVH] = useState('');
  const [vUnit, setVUnit] = useState<'ft' | 'm' | 'inch' | 'cm' | 'yard'>('ft');

  // Rate calc
  const [crQty, setCrQty] = useState('');
  const [crMat, setCrMat] = useState('');
  const [crRate, setCrRate] = useState('');
  const [crGst, setCrGst] = useState('5');
  const [crState, setCrState] = useState('Punjab');

  // Truck estimator
  const [trL, setTrL] = useState('14'); const [trW, setTrW] = useState('7'); const [trH, setTrH] = useState('3');
  const [trMat, setTrMat] = useState('');

  // CFT ↔ MT
  const [convCft, setConvCft] = useState(''); const [convMt, setConvMt] = useState('');
  const [convDensityKey, setConvDensityKey] = useState('1600');
  const [convCustom, setConvCustom] = useState('');

  const calcVol = (() => {
    const l = parseFloat(vL) || 0, w = parseFloat(vW) || 0, h = parseFloat(vH) || 0;
    if (l <= 0 || w <= 0 || h <= 0) return null;
    let lf = l, wf = w, hf = h;
    if (vUnit === 'm') { lf = l * 3.28084; wf = w * 3.28084; hf = h * 3.28084; }
    else if (vUnit === 'inch') { lf = l / 12; wf = w / 12; hf = h / 12; }
    else if (vUnit === 'cm') { lf = l / 30.48; wf = w / 30.48; hf = h / 30.48; }
    else if (vUnit === 'yard') { lf = l * 3; wf = w * 3; hf = h * 3; }
    const cft = lf * wf * hf;
    return { cft, cbm: cft / 35.3147, cyd: cft / 27 };
  })();

  const calcRate = (() => {
    const qty = parseFloat(crQty) || 0;
    const rate = parseFloat(crRate) || 0;
    const gst = parseFloat(crGst) || 0;
    if (qty <= 0 || rate <= 0) return null;
    const base = qty * rate;
    const gstAmt = base * gst / 100;
    return { base, gstAmt, total: base + gstAmt, isPunjab: crState === 'Punjab', gst };
  })();

  const onPickRateMat = (val: string) => {
    setCrMat(val);
    const m = db.materials.find(m => m.id === parseInt(val));
    if (m) { setCrRate(String(m.rate)); setCrGst(String(m.gst_percent)); }
  };

  const onPickTrMat = (val: string) => setTrMat(val);

  const calcTruck = (() => {
    const l = parseFloat(trL) || 0, w = parseFloat(trW) || 0, h = parseFloat(trH) || 0;
    const cft = l * w * h;
    const m = db.materials.find(m => m.id === parseInt(trMat));
    const rate = m?.rate || 0;
    const gstPct = m?.gst_percent || 5;
    const base = cft * rate;
    const gstAmt = base * gstPct / 100;
    return { cft, base, gstAmt, total: base + gstAmt, gstPct };
  })();

  const density = convDensityKey === 'custom' ? (parseFloat(convCustom) || 1600) : parseFloat(convDensityKey);
  const kgPerCft = density / 35.3147;
  const cftPerMt = 1000 / kgPerCft;

  const onConvCft = (v: string) => {
    setConvCft(v);
    const cft = parseFloat(v) || 0;
    setConvMt(cft > 0 ? (cft * kgPerCft / 1000).toFixed(4) : '');
  };
  const onConvMt = (v: string) => {
    setConvMt(v);
    const mt = parseFloat(v) || 0;
    setConvCft(mt > 0 ? (mt * 1000 / kgPerCft).toFixed(3) : '');
  };

  return (
    <>
      <div className="ph">
        <div>
          <div className="pt">CTF Calculator</div>
          <div className="ps">Cubic Feet conversion &amp; material rate calculator</div>
        </div>
      </div>

      <div className="g2" style={{ marginBottom: 14 }}>
        <div className="card">
          <div className="section-hdr">Volume → Cubic Feet (CFT)</div>
          <div className="g3" style={{ gap: 10, marginBottom: 12 }}>
            <div className="fg-row" style={{ marginBottom: 0 }}>
              <label className="flbl">Length</label>
              <input type="number" min="0" step="0.001" value={vL} onChange={e => setVL(e.target.value)} placeholder="0.000" />
            </div>
            <div className="fg-row" style={{ marginBottom: 0 }}>
              <label className="flbl">Width</label>
              <input type="number" min="0" step="0.001" value={vW} onChange={e => setVW(e.target.value)} placeholder="0.000" />
            </div>
            <div className="fg-row" style={{ marginBottom: 0 }}>
              <label className="flbl">Height / Depth</label>
              <input type="number" min="0" step="0.001" value={vH} onChange={e => setVH(e.target.value)} placeholder="0.000" />
            </div>
          </div>
          <div className="fg-row" style={{ marginBottom: 12 }}>
            <label className="flbl">Input Unit</label>
            <select value={vUnit} onChange={e => setVUnit(e.target.value as any)}>
              <option value="ft">Feet (ft)</option>
              <option value="m">Metres (m)</option>
              <option value="inch">Inches (in)</option>
              <option value="cm">Centimetres (cm)</option>
              <option value="yard">Yards (yd)</option>
            </select>
          </div>
          <div className="calc-box" style={{ minHeight: 60 }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>Result</div>
            <div className="cr"><span>Volume in CFT</span><span style={{ fontSize: 18, fontWeight: 800, color: 'var(--accent)' }}>{calcVol ? calcVol.cft.toFixed(3) + ' CFT' : '—'}</span></div>
            <div className="cr"><span>Volume in CBM (m³)</span><span style={{ fontWeight: 700 }}>{calcVol ? calcVol.cbm.toFixed(4) + ' m³' : '—'}</span></div>
            <div className="cr"><span>Volume in Cubic Yards</span><span style={{ fontWeight: 700 }}>{calcVol ? calcVol.cyd.toFixed(4) + ' yd³' : '—'}</span></div>
          </div>
        </div>

        <div className="card">
          <div className="section-hdr">CFT × Rate → Invoice Amount</div>
          <div className="fg-row">
            <label className="flbl">Quantity (CFT) <span className="req">*</span></label>
            <input type="number" min="0" step="0.001" value={crQty} onChange={e => setCrQty(e.target.value)} placeholder="e.g. 450.000" />
          </div>
          <div className="fg-row">
            <label className="flbl">Material (auto-fills rate)</label>
            <select value={crMat} onChange={e => onPickRateMat(e.target.value)}>
              <option value="">— Select Material —</option>
              {db.materials.filter(m => m.rate > 0).map(m => (
                <option key={m.id} value={m.id}>{m.material_name} — ₹{m.rate}/CFT (GST {m.gst_percent}%)</option>
              ))}
            </select>
          </div>
          <div className="g2" style={{ gap: 10 }}>
            <div className="fg-row">
              <label className="flbl">Rate (₹/CFT)</label>
              <input type="number" min="0" step="0.01" value={crRate} onChange={e => setCrRate(e.target.value)} placeholder="0.00" />
            </div>
            <div className="fg-row">
              <label className="flbl">GST (%)</label>
              <input type="number" min="0" max="28" step="0.5" value={crGst} onChange={e => setCrGst(e.target.value)} />
            </div>
          </div>
          <div className="fg-row">
            <label className="flbl">Party State (for GST type)</label>
            <select value={crState} onChange={e => setCrState(e.target.value)}>
              {STATES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="calc-box" style={{ minHeight: 80 }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>Calculation</div>
            <div className="cr"><span>Taxable Amount</span><span style={{ fontWeight: 700 }}>{calcRate ? '₹' + calcRate.base.toFixed(2) : '—'}</span></div>
            {calcRate && calcRate.isPunjab ? (
              <>
                <div className="cr"><span>CGST {calcRate.gst / 2}%</span><span style={{ fontWeight: 700 }}>₹{(calcRate.gstAmt / 2).toFixed(2)}</span></div>
                <div className="cr"><span>SGST {calcRate.gst / 2}%</span><span style={{ fontWeight: 700 }}>₹{(calcRate.gstAmt / 2).toFixed(2)}</span></div>
              </>
            ) : calcRate ? (
              <div className="cr"><span>IGST {calcRate.gst}%</span><span style={{ fontWeight: 700 }}>₹{calcRate.gstAmt.toFixed(2)}</span></div>
            ) : null}
            <div className="cr tot"><span>Grand Total</span><span style={{ color: 'var(--accent)' }}>{calcRate ? '₹' + calcRate.total.toFixed(2) : '—'}</span></div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="section-hdr">Truck Load Estimator</div>
        <div className="g4" style={{ gap: 10, marginBottom: 14 }}>
          <div className="fg-row" style={{ marginBottom: 0 }}>
            <label className="flbl">Truck Length (ft)</label>
            <input type="number" min="0" step="0.1" value={trL} onChange={e => setTrL(e.target.value)} />
          </div>
          <div className="fg-row" style={{ marginBottom: 0 }}>
            <label className="flbl">Truck Width (ft)</label>
            <input type="number" min="0" step="0.1" value={trW} onChange={e => setTrW(e.target.value)} />
          </div>
          <div className="fg-row" style={{ marginBottom: 0 }}>
            <label className="flbl">Fill Height (ft)</label>
            <input type="number" min="0" step="0.1" value={trH} onChange={e => setTrH(e.target.value)} />
          </div>
          <div className="fg-row" style={{ marginBottom: 0 }}>
            <label className="flbl">Material (optional)</label>
            <select value={trMat} onChange={e => onPickTrMat(e.target.value)}>
              <option value="">— Pick material —</option>
              {db.materials.filter(m => m.rate > 0).map(m => <option key={m.id} value={m.id}>{m.material_name}</option>)}
            </select>
          </div>
        </div>
        <div className="calc-box">
          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>Truck Estimate</div>
          <div className="g3" style={{ gap: 10 }}>
            <div style={{ textAlign: 'center', padding: 10, background: 'var(--surface)', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase' }}>Volume</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent)' }}>{calcTruck.cft > 0 ? calcTruck.cft.toFixed(3) : '—'}</div>
              <div style={{ fontSize: 10, color: 'var(--text3)' }}>CFT</div>
            </div>
            <div style={{ textAlign: 'center', padding: 10, background: 'var(--surface)', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase' }}>Bill Amount</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--green)' }}>{calcTruck.total > 0 ? '₹' + fmt(calcTruck.total) : '—'}</div>
              <div style={{ fontSize: 10, color: 'var(--text3)' }}>incl. GST</div>
            </div>
            <div style={{ textAlign: 'center', padding: 10, background: 'var(--surface)', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase' }}>GST Amount</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--amber)' }}>{calcTruck.gstAmt > 0 ? '₹' + calcTruck.gstAmt.toFixed(2) : '—'}</div>
              <div style={{ fontSize: 10, color: 'var(--text3)' }}>@{calcTruck.gstPct}%</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="section-hdr">CFT ↔ Metric Tonnes (MT) Converter</div>
        <div className="alert alert-info" style={{ marginBottom: 14 }}>Conversion uses standard bulk density. Adjust density for your specific material.</div>
        <div className="g3" style={{ gap: 10, marginBottom: 12 }}>
          <div className="fg-row" style={{ marginBottom: 0 }}>
            <label className="flbl">Quantity (CFT)</label>
            <input type="number" min="0" step="0.001" value={convCft} onChange={e => onConvCft(e.target.value)} placeholder="0.000" />
          </div>
          <div className="fg-row" style={{ marginBottom: 0 }}>
            <label className="flbl">Quantity (MT)</label>
            <input type="number" min="0" step="0.0001" value={convMt} onChange={e => onConvMt(e.target.value)} placeholder="0.0000" />
          </div>
          <div className="fg-row" style={{ marginBottom: 0 }}>
            <label className="flbl">Bulk Density (kg/m³)</label>
            <select value={convDensityKey} onChange={e => setConvDensityKey(e.target.value)}>
              <option value="1600">Crushed Stone / 20mm / 40mm — 1600</option>
              <option value="1700">10mm Chips — 1700</option>
              <option value="1550">65mm Gitti — 1550</option>
              <option value="1500">River Sand — 1500</option>
              <option value="1800">Dense Gravel — 1800</option>
              <option value="custom">Custom...</option>
            </select>
          </div>
        </div>
        {convDensityKey === 'custom' && (
          <div className="fg-row" style={{ marginBottom: 12 }}>
            <label className="flbl">Custom Density (kg/m³)</label>
            <input type="number" min="100" step="10" value={convCustom} onChange={e => setConvCustom(e.target.value)} placeholder="e.g. 1600" />
          </div>
        )}
        <div className="calc-box">
          <div className="cr"><span>1 CFT of selected material</span><span style={{ fontWeight: 700 }}>{kgPerCft.toFixed(3)} kg</span></div>
          <div className="cr"><span>1 MT of selected material</span><span style={{ fontWeight: 700 }}>{cftPerMt.toFixed(3)} CFT</span></div>
        </div>
      </div>
    </>
  );
}
