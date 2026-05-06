'use client';

import type { PaymentStatus } from '@/lib/types';

interface Props {
  value: PaymentStatus;
  onChange: (v: PaymentStatus) => void;
}

export default function PaymentSelector({ value, onChange }: Props) {
  return (
    <div className="pay-selector">
      <div className={`pay-opt ${value === 'paid' ? 'sel-paid' : ''}`} onClick={() => onChange('paid')}>🟢 Paid</div>
      <div className={`pay-opt ${value === 'pending' ? 'sel-pending' : ''}`} onClick={() => onChange('pending')}>🟡 Pending</div>
      <div className={`pay-opt ${value === 'debt' ? 'sel-debt' : ''}`} onClick={() => onChange('debt')}>🔴 Debt</div>
    </div>
  );
}
