'use client';

import { useDB } from '@/store/DBContext';
import { numToWords, payLabel, paymentModeLabel } from '@/lib/helpers';
import type { Invoice } from '@/lib/types';

export default function InvoiceDocument({ inv }: { inv: Invoice }) {
  const { db } = useDB();
  const party = db.parties.find(p => p.party_id === inv.party_id);
  const mat = db.materials.find(m => m.id === inv.material_id);
  const slip = db.slips.find(s => s.slip_id === inv.slip_id);
  if (!party || !mat) {
    return (
      <div className="empty"><div className="empty-icon">⚠️</div>
        Cannot render invoice: linked party or material is missing.
      </div>
    );
  }
  const ip = inv.party_state === 'Punjab';
  const ps = inv.payment_status || 'pending';
  const gstOn = inv.gst_enabled !== false;
  const invDate = new Date(inv.date);
  const slipDate = slip ? new Date(slip.date) : invDate;
  const psColor = ps === 'paid' ? '#1A6B35' : ps === 'pending' ? '#B45309' : '#B91C1C';
  const psBg = ps === 'paid' ? '#DCFCE7' : ps === 'pending' ? '#FEF3C7' : '#FEE2E2';
  const psSuffix = ps === 'paid' && inv.payment_mode ? ` · ${paymentModeLabel(inv.payment_mode)}` : '';

  return (
    <div id="inv-full-page" style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 8px 40px rgba(0,0,0,0.12)', maxWidth: 900, margin: '0 auto', color: '#1a1a1a', border: '1px solid #e0e0e0' }}>
      <div style={{ height: 6, background: 'linear-gradient(90deg,#1B5E20,#2E7D32,#43A047,#66BB6A,#A5D6A7)' }} />
      <div style={{ background: 'linear-gradient(135deg,#1B5E20 0%,#2E7D32 55%,#1a5276 100%)', padding: '28px 36px 0', position: 'relative', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#fff', letterSpacing: -0.6, lineHeight: 1.1 }}>{db.bizInfo.name}</div>
            <div style={{ marginTop: 7, fontSize: 11.5, color: 'rgba(255,255,255,0.65)', lineHeight: 1.7 }}>
              <div>{db.bizInfo.address}</div>
              <div style={{ fontFamily: "'JetBrains Mono',monospace" }}>GSTIN: <strong style={{ color: 'rgba(255,255,255,0.85)' }}>{db.bizInfo.gstin}</strong>{db.bizInfo.phone ? <> &nbsp;·&nbsp; Ph: <strong style={{ color: 'rgba(255,255,255,0.85)' }}>{db.bizInfo.phone}</strong></> : null}</div>
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 9.5, letterSpacing: 3, color: 'rgba(255,255,255,0.45)', fontWeight: 700, textTransform: 'uppercase' }}>Tax Invoice · M-Form</div>
            <div style={{ fontSize: 36, fontWeight: 900, color: '#fff', letterSpacing: -2, lineHeight: 1, marginTop: 2 }}>INVOICE</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#81C784', fontFamily: "'JetBrains Mono',monospace", marginTop: 3 }}>INV-{inv.invoice_id}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 0, marginTop: 20, borderRadius: '8px 8px 0 0', overflow: 'hidden', background: 'rgba(0,0,0,0.22)' }}>
          {[
            ['Invoice No.', 'INV-' + inv.invoice_id],
            ['Invoice Date', invDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })],
            ['Dispatch Date', slipDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })],
            ['Slip Ref', '#' + inv.slip_id],
            ['GST Type', gstOn ? (ip ? 'Intra-State' : 'Inter-State') : 'Without GST'],
            ['Status', payLabel(ps) + psSuffix],
          ].map(([l, v], i) => (
            <div key={l} style={{ flex: 1, minWidth: 90, padding: '10px 14px', borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.1)' : 'none' }}>
              <div style={{ fontSize: 8.5, fontWeight: 700, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>{l}</div>
              <div style={{ fontSize: 12, fontWeight: 800, color: l === 'Status' ? (ps === 'paid' ? '#81C784' : ps === 'pending' ? '#FFD54F' : '#EF9A9A') : '#fff' }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1.5px solid #e8ece8' }}>
        <div style={{ padding: '22px 28px 22px 36px', borderRight: '1.5px solid #e8ece8' }}>
          <div style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: 2, color: '#2E7D32', textTransform: 'uppercase', marginBottom: 10 }}>Consignor / Seller</div>
          <div style={{ fontSize: 17, fontWeight: 900, color: '#1a1a1a', marginBottom: 6 }}>{db.bizInfo.name}</div>
          <div style={{ fontSize: 12, color: '#555', lineHeight: 1.7 }}>{db.bizInfo.address}</div>
          <div style={{ marginTop: 7, display: 'inline-flex', alignItems: 'center', gap: 6, background: '#F1F8F2', border: '1px solid #C8E6C9', borderRadius: 6, padding: '4px 10px' }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: '#2E7D32', textTransform: 'uppercase', letterSpacing: 0.8 }}>GSTIN</span>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11.5, fontWeight: 700, color: '#1B5E20' }}>{db.bizInfo.gstin}</span>
          </div>
          {db.bizInfo.phone && <div style={{ marginTop: 6, fontSize: 12, color: '#555' }}>📞 {db.bizInfo.phone}</div>}
        </div>
        <div style={{ padding: '22px 36px 22px 28px', background: '#FAFCFA' }}>
          <div style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: 2, color: '#2E7D32', textTransform: 'uppercase', marginBottom: 10 }}>Consignee / Buyer</div>
          <div style={{ fontSize: 17, fontWeight: 900, color: '#1a1a1a', marginBottom: 6 }}>{party.party_name}</div>
          <div style={{ fontSize: 12, color: '#555', lineHeight: 1.7 }}>{party.state}{party.phone ? ' · 📞 ' + party.phone : ''}</div>
          {party.gstin
            ? <div style={{ marginTop: 7, display: 'inline-flex', alignItems: 'center', gap: 6, background: '#F1F8F2', border: '1px solid #C8E6C9', borderRadius: 6, padding: '4px 10px' }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: '#2E7D32', textTransform: 'uppercase', letterSpacing: 0.8 }}>GSTIN</span>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11.5, fontWeight: 700, color: '#1B5E20' }}>{party.gstin}</span>
              </div>
            : <div style={{ marginTop: 7, fontSize: 11, color: '#999', fontStyle: 'italic' }}>GSTIN not registered / not provided</div>}
        </div>
      </div>

      <div style={{ padding: '14px 36px', background: '#F8FCF8', borderBottom: '1.5px solid #e8ece8', display: 'flex', gap: 40, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: 2, color: '#2E7D32', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Transport Details</div>
        {([
          ['Vehicle No.', inv.vehicle_number],
          inv.driver_name ? ['Driver', inv.driver_name] : null,
          ['Place of Supply', party.state],
          ['Mode', 'Road'],
        ].filter(Boolean) as [string, string][]).map(([l, v]) => (
          <div key={l}>
            <div style={{ fontSize: 9.5, color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{l}</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#1a1a1a', fontFamily: l === 'Vehicle No.' ? "'JetBrains Mono',monospace" : 'inherit' }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: '24px 36px 0' }}>
        <div style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: 2, color: '#2E7D32', textTransform: 'uppercase', marginBottom: 12 }}>Item Details</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'linear-gradient(90deg,#1B5E20,#2E7D32)' }}>
              <th style={{ padding: '11px 14px', textAlign: 'left', color: 'rgba(255,255,255,0.7)', fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>#</th>
              <th style={{ padding: '11px 14px', textAlign: 'left', color: 'rgba(255,255,255,0.7)', fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>Description of Goods</th>
              <th style={{ padding: '11px 12px', textAlign: 'center', color: 'rgba(255,255,255,0.7)', fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>HSN Code</th>
              <th style={{ padding: '11px 12px', textAlign: 'right', color: 'rgba(255,255,255,0.7)', fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>Qty (CFT)</th>
              <th style={{ padding: '11px 12px', textAlign: 'right', color: 'rgba(255,255,255,0.7)', fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>Rate/CFT (₹)</th>
              <th style={{ padding: '11px 12px', textAlign: 'right', color: 'rgba(255,255,255,0.7)', fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>{gstOn ? 'Taxable (₹)' : 'Subtotal (₹)'}</th>
              {gstOn && (ip ? <>
                <th style={{ padding: '11px 12px', textAlign: 'right', color: 'rgba(255,255,255,0.7)', fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>CGST (₹)</th>
                <th style={{ padding: '11px 12px', textAlign: 'right', color: 'rgba(255,255,255,0.7)', fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>SGST (₹)</th>
              </> : <th style={{ padding: '11px 12px', textAlign: 'right', color: 'rgba(255,255,255,0.7)', fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>IGST (₹)</th>)}
              <th style={{ padding: '11px 14px', textAlign: 'right', color: '#fff', fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>Total (₹)</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '2px solid #e8ece8' }}>
              <td style={{ padding: '16px 14px', color: '#999', fontSize: 12 }}>01</td>
              <td style={{ padding: '16px 14px' }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: '#1a1a1a' }}>{mat.material_name}</div>
                <div style={{ fontSize: 11, color: '#888', marginTop: 3, lineHeight: 1.6 }}>
                  Crushed Stone Aggregate{gstOn ? ` · GST Rate: ${inv.gst_percent}%` : ' · No GST'}<br />
                  Vehicle: <strong style={{ color: '#444' }}>{inv.vehicle_number}</strong>{inv.driver_name && <> · Driver: <strong style={{ color: '#444' }}>{inv.driver_name}</strong></>}
                </div>
              </td>
              <td style={{ padding: '16px 12px', textAlign: 'center', fontFamily: "'JetBrains Mono',monospace", fontSize: 12, fontWeight: 700, color: '#2E7D32' }}>{mat.hsn_code}</td>
              <td style={{ padding: '16px 12px', textAlign: 'right', fontWeight: 800, fontSize: 15 }}>{inv.quantity}</td>
              <td style={{ padding: '16px 12px', textAlign: 'right', fontWeight: 700, color: '#444' }}>₹{inv.rate}</td>
              <td style={{ padding: '16px 12px', textAlign: 'right', fontWeight: 700, color: '#444' }}>₹{inv.base_amount.toFixed(2)}</td>
              {gstOn && (ip ? <>
                <td style={{ padding: '16px 12px', textAlign: 'right', color: '#555' }}>
                  <div style={{ fontWeight: 700 }}>₹{inv.cgst.toFixed(2)}</div>
                  <div style={{ fontSize: 10, color: '#999' }}>{inv.gst_percent / 2}%</div>
                </td>
                <td style={{ padding: '16px 12px', textAlign: 'right', color: '#555' }}>
                  <div style={{ fontWeight: 700 }}>₹{inv.sgst.toFixed(2)}</div>
                  <div style={{ fontSize: 10, color: '#999' }}>{inv.gst_percent / 2}%</div>
                </td>
              </> : <td style={{ padding: '16px 12px', textAlign: 'right', color: '#555' }}>
                <div style={{ fontWeight: 700 }}>₹{inv.igst.toFixed(2)}</div>
                <div style={{ fontSize: 10, color: '#999' }}>{inv.gst_percent}%</div>
              </td>)}
              <td style={{ padding: '16px 14px', textAlign: 'right', fontWeight: 900, fontSize: 17, color: '#1B5E20' }}>₹{inv.final_amount.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', borderTop: '1.5px solid #e8ece8' }}>
        <div style={{ padding: '24px 28px 24px 36px', borderRight: '1.5px solid #e8ece8' }}>
          <div style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: 2, color: '#2E7D32', textTransform: 'uppercase', marginBottom: 12 }}>Payment &amp; Terms</div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '10px 18px', borderRadius: 10, background: psBg, border: `1.5px solid ${psColor}`, marginBottom: 16 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: psColor }} />
            <span style={{ fontSize: 15, fontWeight: 900, color: psColor }}>{payLabel(ps)}{psSuffix}</span>
          </div>
          <div style={{ fontSize: 11.5, color: '#888', lineHeight: 2, marginTop: 4 }}>
            <div>• Goods once dispatched will not be taken back</div>
            <div>• Subject to jurisdiction of Punjab courts only</div>
            <div>• Interest @18% p.a. on overdue payments</div>
            <div>• E. &amp; O.E. (Errors and Omissions Excepted)</div>
          </div>
        </div>
        <div style={{ padding: '24px 36px 24px 28px', minWidth: 300 }}>
          <div style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: 2, color: '#2E7D32', textTransform: 'uppercase', marginBottom: 14 }}>Amount Summary</div>
          <div style={{ border: '1.5px solid #e8ece8', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between', fontSize: 13, background: '#F8FCF8', borderBottom: '1px solid #e8ece8' }}>
              <span style={{ color: '#666' }}>{gstOn ? 'Taxable Value' : 'Subtotal'}</span>
              <span style={{ fontWeight: 700 }}>₹{inv.base_amount.toFixed(2)}</span>
            </div>
            {gstOn && (ip ? <>
              <div style={{ padding: '9px 16px', display: 'flex', justifyContent: 'space-between', fontSize: 12.5, borderBottom: '1px dashed #e8ece8' }}>
                <span style={{ color: '#888' }}>CGST @ {inv.gst_percent / 2}%</span>
                <span style={{ fontWeight: 600, color: '#555' }}>₹{inv.cgst.toFixed(2)}</span>
              </div>
              <div style={{ padding: '9px 16px', display: 'flex', justifyContent: 'space-between', fontSize: 12.5, borderBottom: '1.5px solid #e8ece8' }}>
                <span style={{ color: '#888' }}>SGST @ {inv.gst_percent / 2}%</span>
                <span style={{ fontWeight: 600, color: '#555' }}>₹{inv.sgst.toFixed(2)}</span>
              </div>
            </> : <div style={{ padding: '9px 16px', display: 'flex', justifyContent: 'space-between', fontSize: 12.5, borderBottom: '1.5px solid #e8ece8' }}>
              <span style={{ color: '#888' }}>IGST @ {inv.gst_percent}%</span>
              <span style={{ fontWeight: 600, color: '#555' }}>₹{inv.igst.toFixed(2)}</span>
            </div>)}
            <div style={{ padding: 16, background: 'linear-gradient(135deg,#1B5E20,#2E7D32)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'rgba(255,255,255,0.8)', fontWeight: 700, fontSize: 13 }}>Grand Total</span>
              <span style={{ color: '#fff', fontWeight: 900, fontSize: 22, letterSpacing: -0.5 }}>₹{inv.final_amount.toFixed(2)}</span>
            </div>
          </div>
          <div style={{ marginTop: 8, fontSize: 10.5, color: '#aaa', textAlign: 'right', fontStyle: 'italic' }}>
            {numToWords(inv.final_amount)} Rupees Only
          </div>
        </div>
      </div>

      <div style={{ padding: '20px 36px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 20, borderTop: '1.5px solid #e8ece8', background: '#F8FCF8' }}>
        <div style={{ fontSize: 11, color: '#999', lineHeight: 1.8 }}>
          <div style={{ fontWeight: 700, color: '#444', fontSize: 12, marginBottom: 2 }}>Crusher ERP · Punjab GST System</div>
          <div>Computer Generated Invoice · M-Form Tax Invoice</div>
          <div>This invoice is valid without physical signature as per IT Act 2000</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 180, height: 50, borderBottom: '1.5px solid #1B5E20', marginBottom: 6 }} />
          <div style={{ fontSize: 11, fontWeight: 700, color: '#444' }}>Authorized Signatory</div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 1 }}>{db.bizInfo.name}</div>
        </div>
      </div>

      <div style={{ height: 5, background: 'linear-gradient(90deg,#1B5E20,#2E7D32,#43A047,#66BB6A,#A5D6A7)' }} />
    </div>
  );
}
