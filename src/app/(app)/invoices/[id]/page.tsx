'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useDB } from '@/store/DBContext';
import InvoiceDocument from '@/components/InvoiceDocument';
import SharePanel from '@/components/SharePanel';
import { payClass, payLabel } from '@/lib/helpers';

export default function InvoiceViewPage() {
  const params = useParams<{ id: string }>();
  const id = parseInt(params?.id || '0');
  const { db, ready } = useDB();

  if (!ready) {
    return <div className="empty"><div className="empty-icon">⏳</div>Loading invoice…</div>;
  }

  const inv = db.invoices.find(x => x.invoice_id === id);
  if (!inv) {
    return (
      <>
        <div className="ph">
          <div>
            <div className="pt">Invoice not found</div>
            <div className="ps">No invoice with ID {id} exists in this workspace.</div>
          </div>
          <Link href="/invoices" className="btn">← All Invoices</Link>
        </div>
      </>
    );
  }

  const party = db.parties.find(p => p.party_id === inv.party_id);
  const ps = inv.payment_status || 'pending';

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
          <button className="btn btnp" onClick={() => window.print()}>🖨 Print / Save PDF</button>
        </div>
      </div>
      <InvoiceDocument inv={inv} />
      <div className="no-print" style={{ maxWidth: 900, margin: '20px auto 0' }}><SharePanel obj={inv} /></div>
    </>
  );
}
