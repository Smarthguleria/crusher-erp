'use client';

import type { PaymentStatus, PaymentMode } from '@/lib/types';

interface Props {
  value: PaymentStatus;
  onChange: (v: PaymentStatus) => void;
  // Payment mode is only meaningful when status = 'paid'. When the parent supplies these
  // props, the Cash/Online sub-selector renders below the status pills.
  mode?: PaymentMode | null;
  onModeChange?: (m: PaymentMode) => void;
  // Some callers (e.g. invoice editor) want to keep the legacy 'debt' option visible.
  showDebt?: boolean;
}

export default function PaymentSelector({ value, onChange, mode, onModeChange, showDebt = true }: Props) {
  return (
    <>
      <div className="pay-selector">
        <div className={`pay-opt ${value === 'paid' ? 'sel-paid' : ''}`} onClick={() => onChange('paid')}>🟢 Paid</div>
        <div className={`pay-opt ${value === 'pending' ? 'sel-pending' : ''}`} onClick={() => onChange('pending')}>🟡 Pending</div>
        {showDebt && (
          <div className={`pay-opt ${value === 'debt' ? 'sel-debt' : ''}`} onClick={() => onChange('debt')}>🔴 Debt</div>
        )}
      </div>

      {value === 'paid' && onModeChange && (
        <div style={{ marginTop: 10 }}>
          <label className="flbl">Payment Mode <span className="req">*</span></label>
          <div className="pay-selector">
            <div className={`pay-opt ${mode === 'cash' ? 'sel-paid' : ''}`} onClick={() => onModeChange('cash')}>💵 Cash</div>
            <div className={`pay-opt ${mode === 'online' ? 'sel-paid' : ''}`} onClick={() => onModeChange('online')}>🏦 Online</div>
          </div>
        </div>
      )}
    </>
  );
}
