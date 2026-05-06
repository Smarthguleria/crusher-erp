'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useDB } from '@/store/DBContext';
import SlipDocument from '@/components/SlipDocument';
import SharePanel from '@/components/SharePanel';
import { payClass, payLabel } from '@/lib/helpers';

export default function SlipViewPage() {
  const params = useParams<{ id: string }>();
  const id = parseInt(params?.id || '0');
  const { db, ready } = useDB();

  if (!ready) {
    return <div className="empty"><div className="empty-icon">⏳</div>Loading slip…</div>;
  }

  const slip = db.slips.find(x => x.slip_id === id);
  if (!slip) {
    return (
      <>
        <div className="ph">
          <div>
            <div className="pt">Slip not found</div>
            <div className="ps">No slip with ID {id} exists in this workspace.</div>
          </div>
          <Link href="/slips" className="btn">← All Slips</Link>
        </div>
      </>
    );
  }

  const party = db.parties.find(p => p.party_id === slip.party_id);
  const ps = slip.payment_status || 'pending';

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
          <button className="btn btnp" onClick={() => window.print()}>🖨 Print / Save PDF</button>
        </div>
      </div>
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <SlipDocument slip={slip} />
      </div>
      <div className="no-print" style={{ maxWidth: 600, margin: '20px auto 0' }}><SharePanel obj={slip} /></div>
    </>
  );
}
