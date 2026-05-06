'use client';

import { useDB } from '@/store/DBContext';
import { fmt2, payClass, payLabel } from '@/lib/helpers';
import type { Slip } from '@/lib/types';

export default function SlipDocument({ slip }: { slip: Slip }) {
  const { db } = useDB();
  const party = db.parties.find(p => p.party_id === slip.party_id);
  const mat = db.materials.find(m => m.id === slip.material_id);
  if (!party || !mat) {
    return (
      <div className="empty"><div className="empty-icon">⚠️</div>
        Cannot render slip: linked party or material is missing.
      </div>
    );
  }
  const ip = slip.party_state === 'Punjab';
  const ps = slip.payment_status || 'pending';

  return (
    <div id="inv-full-page" className="inv-doc">
      <div className="inv-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>{db.bizInfo.name}</div>
            <div style={{ fontSize: 10, opacity: 0.6, marginTop: 2, fontFamily: "'JetBrains Mono',monospace" }}>{db.bizInfo.gstin} · {db.bizInfo.address}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 13, fontWeight: 800 }}>VEHICLE SLIP</div>
            <div className="mono" style={{ fontSize: 11, opacity: 0.7 }}>#{slip.slip_id}</div>
          </div>
        </div>
      </div>
      <div style={{ padding: 16 }}>
        {([
          ['Date', new Date(slip.date).toLocaleString('en-IN')],
          ['Vehicle No.', slip.vehicle_number],
          slip.driver_name ? ['Driver', slip.driver_name] : null,
          ['Bill To', party.party_name + (party.gstin ? ' | GSTIN: ' + party.gstin : '')],
          ['State / GST', party.state + ' — ' + (ip ? 'CGST+SGST' : 'IGST')],
          ['Material', mat.material_name],
          ['HSN Code', mat.hsn_code],
          ['Quantity', slip.quantity + ' CFT'],
          ['Rate per CFT', '₹' + slip.rate],
          ['Taxable Amount', '₹' + slip.base_amount.toFixed(2)],
          ip ? ['CGST ' + slip.gst_percent / 2 + '%', '₹' + slip.cgst.toFixed(2)] : null,
          ip ? ['SGST ' + slip.gst_percent / 2 + '%', '₹' + slip.sgst.toFixed(2)] : null,
          !ip ? ['IGST ' + slip.gst_percent + '%', '₹' + slip.igst.toFixed(2)] : null,
        ].filter(Boolean) as [string, string][]).map(([l, v]) => (
          <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px dotted var(--border)', fontSize: 12.5 }}>
            <span style={{ color: 'var(--text3)' }}>{l}</span>
            <span style={{ fontWeight: 600 }}>{v}</span>
          </div>
        ))}
        <div style={{ background: 'var(--accent)', color: '#fff', borderRadius: 'var(--r)', padding: '12px 16px', marginTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 800, fontSize: 16 }}>
          <span>Total Payable</span><span>₹{fmt2(slip.final_amount)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTop: '1px dotted var(--border)' }}>
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>Payment Status</span>
          <span className={`ps-pill ${payClass(ps)}`}>{payLabel(ps)}</span>
        </div>
        <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--text3)', marginTop: 14, paddingTop: 10, borderTop: '1px dotted var(--border)' }}>
          Authorized Signatory &nbsp;·&nbsp; Computer Generated
        </div>
      </div>
    </div>
  );
}
